import { google } from 'googleapis';

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GA4_CLIENT_EMAIL!,
      private_key: process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    },
    scopes: [
      'https://www.googleapis.com/auth/tagmanager.edit.containers',
      'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
      'https://www.googleapis.com/auth/tagmanager.publish',
    ],
  });
}

function getTagManager() {
  return google.tagmanager({ version: 'v2', auth: getAuth() });
}

function getContainerPath(): string {
  return `accounts/${process.env.GTM_ACCOUNT_ID}/containers/${process.env.GTM_CONTAINER_ID}`;
}

// 워크스페이스 목록
export async function listWorkspaces() {
  const tm = getTagManager();
  const { data } = await tm.accounts.containers.workspaces.list({ parent: getContainerPath() });
  return data.workspace || [];
}

// 태그 목록
export async function listTags(workspacePath: string) {
  const tm = getTagManager();
  const { data } = await tm.accounts.containers.workspaces.tags.list({ parent: workspacePath });
  return data.tag || [];
}

// 변수 목록
export async function listVariables(workspacePath: string) {
  const tm = getTagManager();
  const { data } = await tm.accounts.containers.workspaces.variables.list({ parent: workspacePath });
  return data.variable || [];
}

// 트리거 목록
export async function listTriggers(workspacePath: string) {
  const tm = getTagManager();
  const { data } = await tm.accounts.containers.workspaces.triggers.list({ parent: workspacePath });
  return data.trigger || [];
}

// 변수 생성
export async function createVariable(workspacePath: string, config: any) {
  const tm = getTagManager();
  const { data } = await tm.accounts.containers.workspaces.variables.create({ parent: workspacePath, requestBody: config });
  return data;
}

// 변수 업데이트
export async function updateVariable(variablePath: string, config: any) {
  const tm = getTagManager();
  const { data } = await tm.accounts.containers.workspaces.variables.update({ path: variablePath, requestBody: config });
  return data;
}

// 태그 생성
export async function createTag(workspacePath: string, config: any) {
  const tm = getTagManager();
  const { data } = await tm.accounts.containers.workspaces.tags.create({ parent: workspacePath, requestBody: config });
  return data;
}

// 태그 업데이트
export async function updateTag(tagPath: string, config: any) {
  const tm = getTagManager();
  const { data } = await tm.accounts.containers.workspaces.tags.update({ path: tagPath, requestBody: config });
  return data;
}

// 버전 생성 + 배포
export async function publishWorkspace(workspacePath: string, name: string, notes: string = '') {
  const tm = getTagManager();
  const { data: ver } = await tm.accounts.containers.workspaces.create_version({
    path: workspacePath,
    requestBody: { name, notes },
  });
  if (ver.containerVersion?.path) {
    const { data: pub } = await tm.accounts.containers.versions.publish({ path: ver.containerVersion.path });
    return { ok: true, version: pub.containerVersion?.containerVersionId };
  }
  return { ok: false, version: ver.containerVersion?.containerVersionId };
}

// 버전 목록
export async function listVersions() {
  const tm = getTagManager();
  const { data } = await tm.accounts.containers.version_headers.list({ parent: getContainerPath() });
  return data.containerVersionHeader || [];
}
