import { createClient } from '@supabase/supabase-js';
import { getSupabasePublicEnv } from '@/lib/supabase/env';
import type {
  SharedApprovalDecisionRecord,
  SharedLearningArchiveRecord,
  SharedRunProgressRecord,
  SharedRunRecord
} from '@/lib/shared-sync/contracts';

export type WorkspaceSyncResult = {
  ok: boolean;
  counts: {
    runs: number;
    learningArchives: number;
    approvalDecisions: number;
    runProgress: number;
  };
  errors: string[];
};

function getServerClient(accessToken: string) {
  const env = getSupabasePublicEnv();
  if (!env.isConfigured) {
    throw new Error('Supabase 환경 변수가 설정되지 않았습니다.');
  }

  return createClient(env.url, env.publishableKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` }
    },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function syncRunsToSupabase(
  organizationId: string,
  accessToken: string,
  createdByUserId: string,
  runs: SharedRunRecord[]
): Promise<{ count: number; error: string | null }> {
  if (runs.length === 0) return { count: 0, error: null };

  const client = getServerClient(accessToken);
  const rows = runs.map((run) => ({
    id: run.id,
    organization_id: organizationId,
    created_by_user_id: createdByUserId,
    topic: run.topic,
    brand: run.brand,
    region: run.region,
    goal: run.goal,
    web_sources: run.webSources,
    meeting_turns: run.meetingTurns,
    attachments: run.attachments,
    deliverable: run.deliverable,
    memory_log: run.memoryLog,
    source_device: run.sourceDevice,
    created_at: run.createdAt,
    updated_at: run.updatedAt
  }));

  const { error } = await client
    .from('workspace_runs')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: false });

  return { count: rows.length, error: error ? error.message : null };
}

export async function syncLearningArchivesToSupabase(
  organizationId: string,
  accessToken: string,
  createdByUserId: string,
  items: SharedLearningArchiveRecord[]
): Promise<{ count: number; error: string | null }> {
  if (items.length === 0) return { count: 0, error: null };

  const client = getServerClient(accessToken);
  const rows = items.map((item) => ({
    id: item.id,
    organization_id: organizationId,
    source_run_id: item.runId,
    created_by_user_id: createdByUserId,
    source_type: item.sourceType,
    situation: item.situation,
    recommended_response: item.recommendedResponse,
    reasoning: item.reasoning,
    signals: item.signals,
    tags: item.tags,
    status: item.status,
    last_used_at: item.lastUsedAt,
    created_at: item.createdAt,
    updated_at: item.updatedAt
  }));

  const { error } = await client
    .from('workspace_learning_archives')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: false });

  return { count: rows.length, error: error ? error.message : null };
}

export async function syncApprovalDecisionsToSupabase(
  organizationId: string,
  accessToken: string,
  createdByUserId: string,
  items: SharedApprovalDecisionRecord[]
): Promise<{ count: number; error: string | null }> {
  if (items.length === 0) return { count: 0, error: null };

  const client = getServerClient(accessToken);
  const rows = items.map((item) => ({
    id: item.id,
    organization_id: organizationId,
    created_by_user_id: createdByUserId,
    item_type: item.itemType,
    item_id: item.itemId,
    decision: item.decision,
    label: item.label,
    created_at: item.createdAt,
    updated_at: item.updatedAt
  }));

  const { error } = await client
    .from('workspace_approval_decisions')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: false });

  return { count: rows.length, error: error ? error.message : null };
}

export async function syncRunProgressToSupabase(
  organizationId: string,
  accessToken: string,
  createdByUserId: string,
  items: SharedRunProgressRecord[]
): Promise<{ count: number; error: string | null }> {
  if (items.length === 0) return { count: 0, error: null };

  const client = getServerClient(accessToken);
  const rows = items.map((item) => ({
    run_id: item.runId,
    organization_id: organizationId,
    created_by_user_id: createdByUserId,
    status: item.status,
    step_key: item.stepKey,
    step_label: item.stepLabel,
    progress_pct: item.progressPct,
    message: item.message,
    started_at: item.startedAt,
    updated_at: item.updatedAt ?? new Date().toISOString(),
    finished_at: item.finishedAt
  }));

  const { error } = await client
    .from('workspace_run_progress')
    .upsert(rows, { onConflict: 'run_id', ignoreDuplicates: false });

  return { count: rows.length, error: error ? error.message : null };
}

export async function syncAllToSupabase(
  organizationId: string,
  accessToken: string,
  userId: string,
  payload: {
    runs: SharedRunRecord[];
    learningArchives: SharedLearningArchiveRecord[];
    approvalDecisions: SharedApprovalDecisionRecord[];
    runProgress: SharedRunProgressRecord[];
  }
): Promise<WorkspaceSyncResult> {
  const errors: string[] = [];

  const [runsResult, archivesResult, approvalsResult, progressResult] = await Promise.all([
    syncRunsToSupabase(organizationId, accessToken, userId, payload.runs),
    syncLearningArchivesToSupabase(organizationId, accessToken, userId, payload.learningArchives),
    syncApprovalDecisionsToSupabase(organizationId, accessToken, userId, payload.approvalDecisions),
    syncRunProgressToSupabase(organizationId, accessToken, userId, payload.runProgress)
  ]);

  if (runsResult.error) errors.push(`runs: ${runsResult.error}`);
  if (archivesResult.error) errors.push(`learning: ${archivesResult.error}`);
  if (approvalsResult.error) errors.push(`approvals: ${approvalsResult.error}`);
  if (progressResult.error) errors.push(`progress: ${progressResult.error}`);

  return {
    ok: errors.length === 0,
    counts: {
      runs: runsResult.count,
      learningArchives: archivesResult.count,
      approvalDecisions: approvalsResult.count,
      runProgress: progressResult.count
    },
    errors
  };
}
