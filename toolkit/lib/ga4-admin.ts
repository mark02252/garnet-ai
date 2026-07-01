import { google } from 'googleapis';

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GA4_CLIENT_EMAIL!,
      private_key: process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/analytics.edit'],
  });
}

export function getPropertyId(): string {
  return `properties/${process.env.GA4_PROPERTY_ID!}`;
}

// 커스텀 디멘션 등록
export async function createCustomDimension(parameterName: string, displayName: string, scope: string = 'EVENT', description: string = '') {
  const admin = google.analyticsadmin({ version: 'v1beta', auth: getAuth() });
  try {
    await admin.properties.customDimensions.create({
      parent: getPropertyId(),
      requestBody: { parameterName, displayName, scope, description } as any,
    });
    return { ok: true, parameterName };
  } catch (e: any) {
    return { ok: false, parameterName, error: e.message?.substring(0, 80) };
  }
}

// 커스텀 메트릭 등록
export async function createCustomMetric(parameterName: string, displayName: string, measurementUnit: string = 'STANDARD') {
  const admin = google.analyticsadmin({ version: 'v1alpha', auth: getAuth() });
  try {
    await (admin as any).properties.customMetrics.create({
      parent: getPropertyId(),
      requestBody: { parameterName, displayName, scope: 'EVENT', measurementUnit },
    });
    return { ok: true, parameterName };
  } catch (e: any) {
    return { ok: false, parameterName, error: e.message?.substring(0, 80) };
  }
}

// 전환 이벤트 등록
export async function createConversionEvent(eventName: string, countingMethod: string = 'ONCE_PER_EVENT') {
  const admin = google.analyticsadmin({ version: 'v1beta', auth: getAuth() });
  try {
    await admin.properties.conversionEvents.create({
      parent: getPropertyId(),
      requestBody: { eventName, countingMethod },
    });
    return { ok: true, eventName };
  } catch (e: any) {
    return { ok: false, eventName, error: e.message?.substring(0, 80) };
  }
}

// 현황 조회
export async function listCustomDimensions() {
  const admin = google.analyticsadmin({ version: 'v1beta', auth: getAuth() });
  const { data } = await admin.properties.customDimensions.list({ parent: getPropertyId() });
  return data.customDimensions || [];
}

export async function listConversionEvents() {
  const admin = google.analyticsadmin({ version: 'v1beta', auth: getAuth() });
  const { data } = await admin.properties.conversionEvents.list({ parent: getPropertyId() });
  return data.conversionEvents || [];
}
