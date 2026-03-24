import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron';
import path from 'node:path';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { autoUpdater } from 'electron-updater';
import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';

// ffmpeg 경로 주입 (개발/프로덕션 모두)
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

let mainWindow: BrowserWindow | null = null;
let nextServerStarted = false;
let updateAvailableVersion = '';
let configuredUpdateUrl = '';

type UpdateConfig = {
  updateUrl?: string;
};

const isDev = process.env.NODE_ENV === 'development';
const devUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000';
const appPort = process.env.PORT || '3123';

function ensureShellPath() {
  const home = process.env.HOME || '';
  const extraDirs = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/opt/local/bin',
    '/usr/bin',
    '/bin',
    home ? path.join(home, '.local', 'bin') : '',
    home ? path.join(home, '.npm-global', 'bin') : '',
    home ? path.join(home, 'bin') : ''
  ].filter(Boolean);
  const current = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  process.env.PATH = [...new Set([...extraDirs, ...current])].join(path.delimiter);
}

function getUpdateConfigPath() {
  return path.join(app.getPath('userData'), 'update-config.json');
}

function getRuntimeConfigPath() {
  return path.join(app.getPath('userData'), 'runtime-config.bin');
}

function sanitizeConfigKey(key: string) {
  return key.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80) || 'default';
}

function getAppConfigPath(key: string) {
  return path.join(app.getPath('userData'), 'app-config', `${sanitizeConfigKey(key)}.bin`);
}

function hasSecureRuntimeStorage() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function normalizeUpdateUrl(value?: string) {
  const raw = (value || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

function isValidUpdateUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function readUpdateConfig(): Promise<UpdateConfig> {
  try {
    const raw = await readFile(getUpdateConfigPath(), 'utf-8');
    const parsed = JSON.parse(raw) as UpdateConfig;
    return {
      updateUrl: normalizeUpdateUrl(parsed.updateUrl)
    };
  } catch {
    return {};
  }
}

async function writeUpdateConfig(config: UpdateConfig) {
  const filepath = getUpdateConfigPath();
  await mkdir(path.dirname(filepath), { recursive: true });
  await writeFile(
    filepath,
    JSON.stringify(
      {
        updateUrl: normalizeUpdateUrl(config.updateUrl)
      },
      null,
      2
    ),
    'utf-8'
  );
}

async function readRuntimeConfig() {
  try {
    const encrypted = await readFile(getRuntimeConfigPath());
    if (!encrypted.length) return '';
    if (!hasSecureRuntimeStorage()) {
      throw new Error('OS 보안 저장소를 사용할 수 없습니다.');
    }
    return safeStorage.decryptString(encrypted);
  } catch (error) {
    const e = error as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return '';
    throw error;
  }
}

async function writeRuntimeConfig(runtimeJson: string) {
  if (!hasSecureRuntimeStorage()) {
    throw new Error('OS 보안 저장소를 사용할 수 없습니다.');
  }

  const filepath = getRuntimeConfigPath();
  await mkdir(path.dirname(filepath), { recursive: true });
  await writeFile(filepath, safeStorage.encryptString(runtimeJson));
}

async function readAppConfig(key: string) {
  try {
    const encrypted = await readFile(getAppConfigPath(key));
    if (!encrypted.length) return '';
    if (!hasSecureRuntimeStorage()) {
      throw new Error('OS 보안 저장소를 사용할 수 없습니다.');
    }
    return safeStorage.decryptString(encrypted);
  } catch (error) {
    const e = error as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return '';
    throw error;
  }
}

async function writeAppConfig(key: string, configJson: string) {
  if (!hasSecureRuntimeStorage()) {
    throw new Error('OS 보안 저장소를 사용할 수 없습니다.');
  }

  const filepath = getAppConfigPath(key);
  await mkdir(path.dirname(filepath), { recursive: true });
  await writeFile(filepath, safeStorage.encryptString(configJson));
}

async function resolveUpdateUrl() {
  const config = await readUpdateConfig();
  const saved = normalizeUpdateUrl(config.updateUrl);
  if (saved) return { url: saved, source: 'saved' as const };
  const envUrl = normalizeUpdateUrl(process.env.APP_UPDATE_URL);
  if (envUrl) return { url: envUrl, source: 'env' as const };
  return { url: '', source: 'none' as const };
}

function hasBundledUpdateConfig() {
  const updater = autoUpdater as unknown as { appUpdateConfigPath?: string };
  const configPath = updater.appUpdateConfigPath;
  if (!configPath) return false;
  return existsSync(configPath);
}

function getAppUrl() {
  if (isDev) return devUrl;
  return `http://127.0.0.1:${appPort}`;
}

function getAppOrigin() {
  try {
    return new URL(getAppUrl()).origin;
  } catch {
    return 'http://127.0.0.1:3000';
  }
}

function isOAuthPopupUrl(targetUrl: string) {
  try {
    const parsed = new URL(targetUrl);
    const appOrigin = getAppOrigin();
    return (
      parsed.origin === appOrigin ||
      parsed.origin === 'https://www.facebook.com' ||
      parsed.origin === 'https://facebook.com' ||
      parsed.origin === 'https://www.instagram.com' ||
      parsed.origin === 'https://instagram.com'
    );
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureRuntimeDatabaseUrl() {
  if (isDev) return;
  if (process.env.DATABASE_URL?.trim()) return;
  const dbPath = path.join(app.getPath('userData'), 'marketing-os.db');
  process.env.DATABASE_URL = `file:${dbPath}`;
}

function ensureDbSchema() {
  if (isDev) return;
  const dbUrl = process.env.DATABASE_URL || '';
  const dbPath = dbUrl.startsWith('file:') ? dbUrl.slice(5) : dbUrl;
  if (!dbPath) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    const db = new DatabaseSync(dbPath);

    // Always run CREATE TABLE IF NOT EXISTS to add any new tables
    // (safe to re-run — IF NOT EXISTS prevents duplicates)

    db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;

      CREATE TABLE IF NOT EXISTS "Run" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "topic" TEXT NOT NULL,
        "brand" TEXT,
        "region" TEXT,
        "goal" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "Run_createdAt_idx" ON "Run"("createdAt");
      CREATE INDEX IF NOT EXISTS "Run_topic_idx" ON "Run"("topic");
      CREATE INDEX IF NOT EXISTS "Run_brand_idx" ON "Run"("brand");

      CREATE TABLE IF NOT EXISTS "RunAttachment" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "runId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "mimeType" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "RunAttachment_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "RunAttachment_runId_createdAt_idx" ON "RunAttachment"("runId", "createdAt");

      CREATE TABLE IF NOT EXISTS "WebSource" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "runId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "snippet" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "provider" TEXT NOT NULL,
        "fetchedAt" DATETIME NOT NULL,
        CONSTRAINT "WebSource_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "WebSource_runId_idx" ON "WebSource"("runId");
      CREATE INDEX IF NOT EXISTS "WebSource_fetchedAt_idx" ON "WebSource"("fetchedAt");

      CREATE TABLE IF NOT EXISTS "MeetingTurn" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "runId" TEXT NOT NULL,
        "role" TEXT NOT NULL,
        "nickname" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MeetingTurn_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "MeetingTurn_runId_createdAt_idx" ON "MeetingTurn"("runId", "createdAt");
      CREATE INDEX IF NOT EXISTS "MeetingTurn_role_idx" ON "MeetingTurn"("role");

      CREATE TABLE IF NOT EXISTS "Deliverable" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "runId" TEXT NOT NULL UNIQUE,
        "type" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Deliverable_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "Deliverable_type_idx" ON "Deliverable"("type");

      CREATE TABLE IF NOT EXISTS "MemoryLog" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "runId" TEXT NOT NULL UNIQUE,
        "hypothesis" TEXT NOT NULL,
        "direction" TEXT NOT NULL,
        "expectedImpact" TEXT NOT NULL,
        "risks" TEXT NOT NULL,
        "outcome" TEXT,
        "failureReason" TEXT,
        "tags" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "MemoryLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "MemoryLog_createdAt_idx" ON "MemoryLog"("createdAt");

      CREATE TABLE IF NOT EXISTS "Dataset" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "notes" TEXT,
        "rawData" TEXT NOT NULL,
        "analysis" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "Dataset_createdAt_idx" ON "Dataset"("createdAt");
      CREATE INDEX IF NOT EXISTS "Dataset_name_idx" ON "Dataset"("name");
      CREATE INDEX IF NOT EXISTS "Dataset_type_idx" ON "Dataset"("type");

      CREATE TABLE IF NOT EXISTS "LearningArchive" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "runId" TEXT,
        "sourceType" TEXT NOT NULL,
        "situation" TEXT NOT NULL,
        "recommendedResponse" TEXT NOT NULL,
        "reasoning" TEXT NOT NULL,
        "signals" TEXT NOT NULL,
        "tags" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'DRAFT',
        "lastUsedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "LearningArchive_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "LearningArchive_runId_idx" ON "LearningArchive"("runId");
      CREATE INDEX IF NOT EXISTS "LearningArchive_status_idx" ON "LearningArchive"("status");
      CREATE INDEX IF NOT EXISTS "LearningArchive_createdAt_idx" ON "LearningArchive"("createdAt");

      CREATE TABLE IF NOT EXISTS "ManualCampaignRoom" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "brand" TEXT NOT NULL,
        "region" TEXT NOT NULL,
        "goal" TEXT NOT NULL,
        "objective" TEXT,
        "notes" TEXT,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "ManualCampaignRoom_brand_idx" ON "ManualCampaignRoom"("brand");
      CREATE INDEX IF NOT EXISTS "ManualCampaignRoom_createdAt_idx" ON "ManualCampaignRoom"("createdAt");

      CREATE TABLE IF NOT EXISTS "KpiGoal" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "brand" TEXT,
        "region" TEXT,
        "metric" TEXT NOT NULL,
        "targetValue" REAL NOT NULL,
        "currentValue" REAL NOT NULL DEFAULT 0,
        "unit" TEXT NOT NULL DEFAULT '',
        "period" TEXT NOT NULL DEFAULT 'MONTHLY',
        "notes" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "KpiGoal_createdAt_idx" ON "KpiGoal"("createdAt");
      CREATE INDEX IF NOT EXISTS "KpiGoal_brand_idx" ON "KpiGoal"("brand");

      CREATE TABLE IF NOT EXISTS "InstagramReachDaily" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "accountId" TEXT NOT NULL,
        "metricDate" DATETIME NOT NULL,
        "reach" INTEGER NOT NULL,
        "rawValue" TEXT,
        "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("accountId", "metricDate")
      );
      CREATE INDEX IF NOT EXISTS "InstagramReachDaily_metricDate_idx" ON "InstagramReachDaily"("metricDate");
      CREATE INDEX IF NOT EXISTS "InstagramReachDaily_accountId_metricDate_idx" ON "InstagramReachDaily"("accountId", "metricDate");

      CREATE TABLE IF NOT EXISTS "ContentDraft" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "contentType" TEXT NOT NULL,
        "brand" TEXT NOT NULL DEFAULT '',
        "target" TEXT NOT NULL DEFAULT '',
        "tone" TEXT NOT NULL DEFAULT '',
        "keyMessage" TEXT NOT NULL,
        "additionalContext" TEXT NOT NULL DEFAULT '',
        "result" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "ContentDraft_createdAt_idx" ON "ContentDraft"("createdAt");

      CREATE TABLE IF NOT EXISTS "InstagramReachAnalysisRun" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "accountId" TEXT NOT NULL,
        "since" DATETIME NOT NULL,
        "until" DATETIME NOT NULL,
        "days" INTEGER NOT NULL,
        "averageReach" REAL NOT NULL,
        "latestReach" INTEGER NOT NULL,
        "previousReach" INTEGER,
        "dayOverDayChangePct" REAL,
        "sevenDayAverage" REAL,
        "trendDirection" TEXT NOT NULL,
        "anomalyCount" INTEGER NOT NULL DEFAULT 0,
        "summary" TEXT NOT NULL,
        "rawJson" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "InstagramReachAnalysisRun_accountId_createdAt_idx" ON "InstagramReachAnalysisRun"("accountId", "createdAt");
      CREATE INDEX IF NOT EXISTS "InstagramReachAnalysisRun_createdAt_idx" ON "InstagramReachAnalysisRun"("createdAt");

      CREATE TABLE IF NOT EXISTS "ApprovalDecision" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "itemType" TEXT NOT NULL,
        "itemId" TEXT NOT NULL,
        "decision" TEXT NOT NULL,
        "label" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("itemType", "itemId", "decision")
      );
      CREATE INDEX IF NOT EXISTS "ApprovalDecision_itemType_updatedAt_idx" ON "ApprovalDecision"("itemType", "updatedAt");

      CREATE TABLE IF NOT EXISTS "RunProgress" (
        "runId" TEXT NOT NULL PRIMARY KEY,
        "status" TEXT NOT NULL,
        "stepKey" TEXT NOT NULL,
        "stepLabel" TEXT NOT NULL,
        "progressPct" INTEGER NOT NULL DEFAULT 0,
        "message" TEXT,
        "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "finishedAt" DATETIME,
        CONSTRAINT "RunProgress_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "RunProgress_status_updatedAt_idx" ON "RunProgress"("status", "updatedAt");

      CREATE TABLE IF NOT EXISTS "SeminarSession" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "title" TEXT,
        "topic" TEXT NOT NULL,
        "brand" TEXT,
        "region" TEXT,
        "goal" TEXT,
        "status" TEXT NOT NULL,
        "startsAt" DATETIME NOT NULL,
        "endsAt" DATETIME NOT NULL,
        "intervalMinutes" INTEGER NOT NULL,
        "maxRounds" INTEGER NOT NULL,
        "completedRounds" INTEGER NOT NULL DEFAULT 0,
        "nextRunAt" DATETIME,
        "lastRunAt" DATETIME,
        "morningBriefing" TEXT,
        "runtimeConfig" TEXT,
        "lastError" TEXT,
        "isProcessing" INTEGER NOT NULL DEFAULT 0,
        "processingStartedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "SeminarSession_status_nextRunAt_idx" ON "SeminarSession"("status", "nextRunAt");
      CREATE INDEX IF NOT EXISTS "SeminarSession_createdAt_idx" ON "SeminarSession"("createdAt");

      CREATE TABLE IF NOT EXISTS "SeminarRound" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "sessionId" TEXT NOT NULL,
        "roundNumber" INTEGER NOT NULL,
        "scheduledAt" DATETIME NOT NULL,
        "startedAt" DATETIME,
        "finishedAt" DATETIME,
        "status" TEXT NOT NULL,
        "runId" TEXT,
        "summary" TEXT,
        "error" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("sessionId", "roundNumber"),
        CONSTRAINT "SeminarRound_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SeminarSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "SeminarRound_sessionId_status_idx" ON "SeminarRound"("sessionId", "status");
      CREATE INDEX IF NOT EXISTS "SeminarRound_createdAt_idx" ON "SeminarRound"("createdAt");

      CREATE TABLE IF NOT EXISTS "SeminarFinalReport" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "sessionId" TEXT NOT NULL UNIQUE,
        "content" TEXT NOT NULL,
        "structured" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SeminarFinalReport_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SeminarSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "SeminarFinalReport_updatedAt_idx" ON "SeminarFinalReport"("updatedAt");

      -- SNS Studio tables (v0.3.0+)
      CREATE TABLE IF NOT EXISTS "SnsPersona" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "platform" TEXT NOT NULL DEFAULT 'INSTAGRAM',
        "learnMode" TEXT NOT NULL DEFAULT 'FROM_TEMPLATE',
        "brandConcept" TEXT,
        "targetAudience" TEXT,
        "writingStyle" TEXT,
        "tone" TEXT,
        "keywords" TEXT NOT NULL DEFAULT '[]',
        "sampleSentences" TEXT NOT NULL DEFAULT '[]',
        "instagramHandle" TEXT,
        "isActive" INTEGER NOT NULL DEFAULT 1,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS "SnsPersonaPost" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "personaId" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "postedAt" DATETIME,
        "source" TEXT,
        CONSTRAINT "SnsPersonaPost_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "SnsPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );

      CREATE TABLE IF NOT EXISTS "SnsContentDraft" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "personaId" TEXT,
        "type" TEXT NOT NULL DEFAULT 'TEXT',
        "planningMode" TEXT NOT NULL DEFAULT 'CREATIVE',
        "title" TEXT,
        "content" TEXT,
        "slides" TEXT,
        "videoUrl" TEXT,
        "status" TEXT NOT NULL DEFAULT 'DRAFT',
        "publishedAt" DATETIME,
        "platform" TEXT NOT NULL DEFAULT 'INSTAGRAM',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SnsContentDraft_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "SnsPersona"("id") ON DELETE SET NULL ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "SnsContentDraft_personaId_idx" ON "SnsContentDraft"("personaId");
      CREATE INDEX IF NOT EXISTS "SnsContentDraft_createdAt_idx" ON "SnsContentDraft"("createdAt");
      CREATE INDEX IF NOT EXISTS "SnsContentDraft_status_idx" ON "SnsContentDraft"("status");

      CREATE TABLE IF NOT EXISTS "SnsScheduledPost" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "draftId" TEXT NOT NULL UNIQUE,
        "personaId" TEXT NOT NULL,
        "platform" TEXT NOT NULL DEFAULT 'INSTAGRAM',
        "scheduledAt" DATETIME NOT NULL,
        "publishedAt" DATETIME,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "errorMsg" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SnsScheduledPost_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "SnsContentDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "SnsScheduledPost_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "SnsPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "SnsScheduledPost_status_scheduledAt_idx" ON "SnsScheduledPost"("status", "scheduledAt");
      CREATE INDEX IF NOT EXISTS "SnsScheduledPost_personaId_idx" ON "SnsScheduledPost"("personaId");

      CREATE TABLE IF NOT EXISTS "SnsAnalyticsSnapshot" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "personaId" TEXT NOT NULL,
        "platform" TEXT NOT NULL DEFAULT 'INSTAGRAM',
        "date" DATETIME NOT NULL,
        "reach" INTEGER NOT NULL DEFAULT 0,
        "impressions" INTEGER NOT NULL DEFAULT 0,
        "engagement" REAL NOT NULL DEFAULT 0,
        "followers" INTEGER NOT NULL DEFAULT 0,
        "postCount" INTEGER NOT NULL DEFAULT 0,
        "topPostId" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SnsAnalyticsSnapshot_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "SnsPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "SnsAnalyticsSnapshot_personaId_date_key" ON "SnsAnalyticsSnapshot"("personaId", "date");

      CREATE TABLE IF NOT EXISTS "SnsCommentTemplate" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "personaId" TEXT NOT NULL,
        "triggerKeywords" TEXT NOT NULL DEFAULT '[]',
        "replyType" TEXT NOT NULL DEFAULT 'comment',
        "template" TEXT NOT NULL,
        "isActive" INTEGER NOT NULL DEFAULT 1,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SnsCommentTemplate_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "SnsPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );

      CREATE TABLE IF NOT EXISTS "SnsPerformanceReport" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "personaId" TEXT NOT NULL,
        "period" TEXT NOT NULL DEFAULT '30d',
        "reportJson" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SnsPerformanceReport_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "SnsPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "SnsPerformanceReport_personaId_createdAt_idx" ON "SnsPerformanceReport"("personaId", "createdAt");

      CREATE TABLE IF NOT EXISTS "SnsContentTemplate" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "category" TEXT NOT NULL DEFAULT 'GENERAL',
        "type" TEXT NOT NULL DEFAULT 'TEXT',
        "promptTemplate" TEXT NOT NULL,
        "slideCount" INTEGER NOT NULL DEFAULT 5,
        "hashtags" TEXT NOT NULL DEFAULT '[]',
        "isActive" INTEGER NOT NULL DEFAULT 1,
        "usageCount" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "SnsContentTemplate_category_idx" ON "SnsContentTemplate"("category");
    `);

    db.close();
    console.log('[ensureDbSchema] Schema created successfully.');
  } catch (error) {
    console.error('[ensureDbSchema] Failed to initialize DB schema:', error);
  }
}

function enableAsarNodePath(resourcesPath: string) {
  const unpackedNodeModules = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules');
  const asarNodeModules = path.join(resourcesPath, 'app.asar', 'node_modules');
  const unpackedVendorRoot = path.join(resourcesPath, 'app.asar.unpacked', 'vendor_prisma');
  const asarVendorRoot = path.join(resourcesPath, 'app.asar', 'vendor_prisma');
  const customPaths = [unpackedVendorRoot, asarVendorRoot, unpackedNodeModules, asarNodeModules].join(path.delimiter);
  process.env.NODE_PATH = process.env.NODE_PATH ? `${customPaths}${path.delimiter}${process.env.NODE_PATH}` : customPaths;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Module = require('module') as { Module: { _initPaths: () => void } };
  Module.Module._initPaths();
}

async function waitForServerReady(url: string, timeoutMs = 45000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {
      // keep polling
    }
    await sleep(600);
  }
  return false;
}

async function startEmbeddedSeminarScheduler() {
  if (isDev) return;
  const schedulerUrl = `http://127.0.0.1:${appPort}/api/seminar/scheduler/start`;
  try {
    await fetch(schedulerUrl, { method: 'POST', signal: AbortSignal.timeout(5000) });
  } catch {
    // Ignore scheduler bootstrap failures; user can still trigger from UI/API.
  }
}

function startNextServer() {
  if (isDev) return;
  if (nextServerStarted) return;

  const resourcesPath = process.resourcesPath;
  const unpackedServerPath = path.join(resourcesPath, 'app.asar.unpacked', '.next-build', 'standalone', 'server.js');
  const asarServerPath = path.join(resourcesPath, 'app.asar', '.next-build', 'standalone', 'server.js');
  const serverPath = existsSync(unpackedServerPath) ? unpackedServerPath : asarServerPath;
  process.env.PORT = appPort;
  process.env.HOSTNAME = '127.0.0.1';
  enableAsarNodePath(resourcesPath);

  if (serverPath === unpackedServerPath) {
    // Unpacked standalone server can chdir/load static assets normally.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require(serverPath);
  } else {
    const originalChdir = process.chdir.bind(process);
    process.chdir = ((dir: string) => {
      if (typeof dir === 'string' && dir.includes('app.asar/.next-build/standalone')) return;
      return originalChdir(dir);
    }) as typeof process.chdir;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require(serverPath);
    process.chdir = originalChdir;
  }
  nextServerStarted = true;
}

function configureAutoUpdater() {
  if (isDev) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    updateAvailableVersion = info.version || '';
  });

  autoUpdater.on('update-not-available', () => {
    updateAvailableVersion = '';
  });

  autoUpdater.on('error', () => {
    updateAvailableVersion = '';
  });
}

async function ensureUpdateFeedConfigured() {
  if (isDev) {
    return {
      ok: false,
      status: 'disabled',
      message: '개발 모드에서는 자동 업데이트를 사용할 수 없습니다.',
      source: 'none' as const
    };
  }

  const resolved = await resolveUpdateUrl();
  if (!resolved.url) {
    if (hasBundledUpdateConfig()) {
      return {
        ok: true,
        status: 'configured',
        message: '앱에 내장된 업데이트 설정(app-update.yml)을 사용합니다.',
        source: 'bundled' as const
      };
    }
    return {
      ok: false,
      status: 'missing-config',
      message: '업데이트 피드 URL이 없습니다. 설정 및 복구에서 먼저 저장해 주세요.',
      source: resolved.source
    };
  }

  if (!isValidUpdateUrl(resolved.url)) {
    return {
      ok: false,
      status: 'invalid-config',
      message: '업데이트 피드 URL 형식이 올바르지 않습니다. http(s) 주소를 확인해 주세요.',
      source: resolved.source
    };
  }

  if (configuredUpdateUrl !== resolved.url) {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: resolved.url
    });
    configuredUpdateUrl = resolved.url;
  }

  return {
    ok: true,
    status: 'configured',
    message: '업데이트 피드가 설정되었습니다.',
    updateUrl: resolved.url,
    source: resolved.source
  };
}

ipcMain.handle('report:save-pdf', async (event, payload?: { suggestedName?: string }) => {
  const sender = event.sender;
  const filename = (payload?.suggestedName || 'marketing-report.pdf').replace(/[^\w\-_.가-힣]/g, '_');

  const result = await dialog.showSaveDialog({
    title: 'PDF 보고서 저장',
    defaultPath: path.join(app.getPath('documents'), filename),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });

  if (result.canceled || !result.filePath) {
    return { ok: false, canceled: true };
  }

  const pdfBuffer = await sender.printToPDF({
    printBackground: true,
    landscape: false,
    pageSize: 'A4',
    margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
  });

  await writeFile(result.filePath, pdfBuffer);
  return { ok: true, path: result.filePath };
});

ipcMain.handle('runtime-config:get', async () => {
  try {
    const runtimeJson = await readRuntimeConfig();
    return {
      ok: true,
      status: runtimeJson ? 'loaded' : 'empty',
      message: runtimeJson ? '실행 키를 안전 저장소에서 불러왔습니다.' : '저장된 실행 키가 없습니다.',
      runtimeJson: runtimeJson || undefined,
      storageMode: hasSecureRuntimeStorage() ? ('safeStorage' as const) : ('none' as const)
    };
  } catch (error) {
    return {
      ok: false,
      status: 'error',
      message: error instanceof Error ? error.message : '실행 키를 불러오지 못했습니다.',
      storageMode: hasSecureRuntimeStorage() ? ('safeStorage' as const) : ('none' as const)
    };
  }
});

ipcMain.handle('runtime-config:set', async (_event, payload?: { runtimeJson?: string }) => {
  const runtimeJson = (payload?.runtimeJson || '').trim();
  if (!runtimeJson) {
    try {
      await rm(getRuntimeConfigPath(), { force: true });
    } catch {
      // noop
    }
    return {
      ok: true,
      status: 'cleared',
      message: '실행 키를 초기화했습니다.',
      storageMode: hasSecureRuntimeStorage() ? ('safeStorage' as const) : ('none' as const)
    };
  }

  try {
    await writeRuntimeConfig(runtimeJson);
    return {
      ok: true,
      status: 'saved',
      message: '실행 키를 안전 저장소에 저장했습니다.',
      storageMode: 'safeStorage' as const
    };
  } catch (error) {
    return {
      ok: false,
      status: 'error',
      message: error instanceof Error ? error.message : '실행 키 저장에 실패했습니다.',
      storageMode: hasSecureRuntimeStorage() ? ('safeStorage' as const) : ('none' as const)
    };
  }
});

ipcMain.handle('app-config:get', async (_event, payload?: { key?: string }) => {
  const key = sanitizeConfigKey(payload?.key || '');
  try {
    const configJson = await readAppConfig(key);
    return {
      ok: true,
      status: configJson ? 'loaded' : 'empty',
      message: configJson ? '앱 설정을 안전 저장소에서 불러왔습니다.' : '저장된 앱 설정이 없습니다.',
      configJson: configJson || undefined,
      storageMode: hasSecureRuntimeStorage() ? ('safeStorage' as const) : ('none' as const)
    };
  } catch (error) {
    return {
      ok: false,
      status: 'error',
      message: error instanceof Error ? error.message : '앱 설정을 불러오지 못했습니다.',
      storageMode: hasSecureRuntimeStorage() ? ('safeStorage' as const) : ('none' as const)
    };
  }
});

ipcMain.handle('app-config:set', async (_event, payload?: { key?: string; configJson?: string }) => {
  const key = sanitizeConfigKey(payload?.key || '');
  const configJson = (payload?.configJson || '').trim();

  if (!configJson) {
    try {
      await rm(getAppConfigPath(key), { force: true });
    } catch {
      // noop
    }
    return {
      ok: true,
      status: 'cleared',
      message: '앱 설정을 초기화했습니다.',
      storageMode: hasSecureRuntimeStorage() ? ('safeStorage' as const) : ('none' as const)
    };
  }

  try {
    await writeAppConfig(key, configJson);
    return {
      ok: true,
      status: 'saved',
      message: '앱 설정을 안전 저장소에 저장했습니다.',
      storageMode: 'safeStorage' as const
    };
  } catch (error) {
    return {
      ok: false,
      status: 'error',
      message: error instanceof Error ? error.message : '앱 설정 저장에 실패했습니다.',
      storageMode: hasSecureRuntimeStorage() ? ('safeStorage' as const) : ('none' as const)
    };
  }
});

ipcMain.handle('updater:check', async () => {
  if (isDev) {
    return {
      ok: false,
      status: 'disabled',
      message: '개발 모드에서는 자동 업데이트를 사용할 수 없습니다.',
      currentVersion: app.getVersion()
    };
  }

  try {
    const feedStatus = await ensureUpdateFeedConfigured();
    if (!feedStatus.ok) {
      return {
        ok: false,
        status: feedStatus.status,
        message: feedStatus.message,
        currentVersion: app.getVersion()
      };
    }
    const result = await autoUpdater.checkForUpdates();
    if (!result?.updateInfo) {
      return {
        ok: true,
        status: 'idle',
        message: '업데이트 정보를 확인하지 못했습니다.',
        currentVersion: app.getVersion()
      };
    }

    const hasUpdate = result.updateInfo.version !== app.getVersion();
    updateAvailableVersion = hasUpdate ? result.updateInfo.version : '';

    return {
      ok: true,
      status: hasUpdate ? 'available' : 'up-to-date',
      message: hasUpdate ? '업데이트가 확인되었습니다.' : '현재 최신 버전입니다.',
      currentVersion: app.getVersion(),
      availableVersion: hasUpdate ? result.updateInfo.version : undefined,
      updateUrl: feedStatus.updateUrl,
      configSource: feedStatus.source
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : '업데이트 확인 실패';
    return {
      ok: false,
      status: 'error',
      message: `업데이트 확인 실패: ${reason}`,
      currentVersion: app.getVersion()
    };
  }
});

ipcMain.handle('updater:get-config', async () => {
  const resolved = await resolveUpdateUrl();
  if (!resolved.url && hasBundledUpdateConfig()) {
    return {
      ok: true,
      updateUrl: '',
      source: 'bundled' as const
    };
  }
  return {
    ok: true,
    updateUrl: resolved.url,
    source: resolved.source
  };
});

ipcMain.handle('updater:set-config', async (_event, payload?: { updateUrl?: string }) => {
  if (isDev) {
    return {
      ok: false,
      status: 'disabled',
      message: '개발 모드에서는 업데이트 설정 저장이 비활성화됩니다.'
    };
  }

  const updateUrl = normalizeUpdateUrl(payload?.updateUrl);
  if (updateUrl && !isValidUpdateUrl(updateUrl)) {
    return {
      ok: false,
      status: 'invalid-config',
      message: 'URL 형식이 올바르지 않습니다. http(s):// 로 시작해야 합니다.'
    };
  }

  await writeUpdateConfig({ updateUrl });
  configuredUpdateUrl = '';
  updateAvailableVersion = '';
  await ensureUpdateFeedConfigured();

  return {
    ok: true,
    status: 'saved',
    message: updateUrl ? '업데이트 피드 URL을 저장했습니다.' : '업데이트 피드 URL을 초기화했습니다.',
    updateUrl
  };
});

ipcMain.handle('updater:download', async () => {
  if (isDev) {
    return { ok: false, status: 'disabled', message: '개발 모드에서는 다운로드할 수 없습니다.' };
  }

  try {
    const feedStatus = await ensureUpdateFeedConfigured();
    if (!feedStatus.ok) {
      return {
        ok: false,
        status: feedStatus.status,
        message: feedStatus.message
      };
    }
    await autoUpdater.downloadUpdate();
    return {
      ok: true,
      status: 'downloaded',
      message: '업데이트 다운로드가 완료되었습니다. 설치 버튼으로 반영하세요.',
      availableVersion: updateAvailableVersion || undefined
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : '업데이트 다운로드 실패';
    return { ok: false, status: 'error', message: `업데이트 다운로드 실패: ${reason}` };
  }
});

ipcMain.handle('updater:install', async () => {
  if (isDev) {
    return { ok: false, status: 'disabled', message: '개발 모드에서는 설치할 수 없습니다.' };
  }

  setImmediate(() => autoUpdater.quitAndInstall());
  return { ok: true, status: 'installing', message: '앱을 종료하고 업데이트를 설치합니다.' };
});

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isOAuthPopupUrl(url)) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }

    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 540,
        height: 760,
        autoHideMenuBar: true,
        parent: mainWindow || undefined,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          nodeIntegration: false
        }
      }
    };
  });

  const appUrl = getAppUrl();
  const canLoad = isDev ? true : await waitForServerReady(appUrl, 45000);
  if (!canLoad) {
    const message = `
      <html><body style="font-family:-apple-system,Apple SD Gothic Neo,sans-serif;padding:28px;background:#f6f1ea;color:#2a1a18;">
      <h2>앱 로딩 지연</h2>
      <p>내부 서버 시작이 지연되고 있습니다. 앱을 다시 실행해 주세요.</p>
      <p style="font-size:12px;color:#6b5a50;">문제가 반복되면 최신 버전으로 업데이트하거나 재설치해 주세요.</p>
      </body></html>
    `;
    await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(message)}`);
  } else {
    await mainWindow.loadURL(appUrl);
  }

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.webContents.on('did-fail-load', async () => {
    if (!mainWindow) return;
    if (isDev) return;
    const ready = await waitForServerReady(appUrl, 15000);
    if (ready) {
      await mainWindow.loadURL(appUrl);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startSchedulerTimer() {
  const appPort = process.env.PORT || '3123'
  const baseUrl = `http://127.0.0.1:${appPort}`

  // 앱 시작 시 MISSED 처리 (Next.js가 준비된 후 호출되므로 약간 지연)
  setTimeout(() => processMissedSchedules(baseUrl), 5_000)

  // 1분마다 PENDING 예약 확인
  setInterval(() => processScheduledPosts(baseUrl), 60_000)

  // 24시간마다 토큰 자동 갱신 시도
  setInterval(() => refreshTokenIfNeeded(baseUrl), 24 * 60 * 60_000)
  // 앱 시작 후 10초 뒤 첫 갱신 체크
  setTimeout(() => refreshTokenIfNeeded(baseUrl), 10_000)
}

async function processMissedSchedules(baseUrl: string) {
  try {
    await fetch(`${baseUrl}/api/sns/schedule/missed`, { method: 'POST' })
  } catch (e) {
    console.error('[Scheduler] missed 처리 오류:', e)
  }
}

async function refreshTokenIfNeeded(baseUrl: string) {
  try {
    const raw = await readAppConfig('meta_connection_v1')
    if (!raw) return
    const parsed = JSON.parse(raw)
    const accessToken = parsed?.accessToken || ''
    const tokenSource = parsed?.tokenSource || ''
    const tokenExpiresIn = parsed?.tokenExpiresIn

    // 장기 토큰이고 만료까지 14일 이내면 갱신
    if (tokenSource === 'oauth_long_lived' && accessToken) {
      // tokenExpiresIn이 있으면 체크, 없으면 무조건 갱신 시도
      const shouldRefresh = !tokenExpiresIn || tokenExpiresIn < 14 * 24 * 3600
      if (shouldRefresh) {
        const res = await fetch(`${baseUrl}/api/meta/token/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken }),
        })
        if (res.ok) {
          const data = await res.json() as { accessToken?: string; expiresIn?: number }
          if (data.accessToken) {
            const updated = {
              ...parsed,
              accessToken: data.accessToken,
              tokenExpiresIn: data.expiresIn ?? null,
            }
            await writeAppConfig('meta_connection_v1', JSON.stringify(updated))
            console.log('[Token] 장기 토큰 자동 갱신 완료')
          }
        }
      }
    }
  } catch (e) {
    console.error('[Token] 자동 갱신 오류:', e)
  }
}

async function processScheduledPosts(baseUrl: string) {
  try {
    // Electron 보안 저장소에서 Meta 연결 정보 읽기
    let accessToken = ''
    let businessAccountId = ''
    try {
      const raw = await readAppConfig('meta_connection_v1')
      if (raw) {
        const parsed = JSON.parse(raw)
        accessToken = parsed?.accessToken || ''
        businessAccountId = parsed?.instagramBusinessAccountId || ''
      }
    } catch { /* config 읽기 실패 — 토큰 없이 진행 (DB 상태만 변경) */ }

    const res = await fetch(`${baseUrl}/api/sns/schedule/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, businessAccountId }),
    })
    if (!res.ok) console.error('[Scheduler] 발행 처리 실패:', await res.text())
  } catch (e) {
    console.error('[Scheduler] 타이머 오류:', e)
  }
}

// EPIPE 에러 방지 — stdout/stderr 파이프가 닫힌 상태에서 console.error 호출 시 crash 방지
process.stdout?.on?.('error', () => {});
process.stderr?.on?.('error', () => {});

// Electron이 EPIPE/네트워크 에러를 다이얼로그로 표시하여 UI를 블로킹하는 것을 방지
process.on('uncaughtException', (err) => {
  const msg = err?.message || '';
  // EPIPE, ECONNREFUSED 등 무해한 에러는 무시
  if (msg.includes('EPIPE') || msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
    return;
  }
  // 그 외 진짜 에러는 콘솔에만 출력 (다이얼로그 안 띄움)
  try { console.error('[Uncaught]', err); } catch { /* ignore */ }
});

app.whenReady().then(async () => {
  ensureShellPath();
  ensureRuntimeDatabaseUrl();
  ensureDbSchema();
  configureAutoUpdater();
  try {
    startNextServer();
  } catch (error) {
    console.error('Failed to start embedded Next server:', error);
  }
  startSchedulerTimer();

  await createWindow();
  await startEmbeddedSeminarScheduler();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  nextServerStarted = false;
});
