import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabasePublicEnv } from '@/lib/supabase/env';

const BUCKET_NAME = 'garnet-attachments';

function getStorageClient(accessToken: string): SupabaseClient {
  const env = getSupabasePublicEnv();
  if (!env.isConfigured) {
    throw new Error('Supabase 환경 변수가 설정되지 않았습니다.');
  }
  return createClient(env.url, env.publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

/**
 * Uploads a base64-encoded attachment to Supabase Storage.
 * Returns the public URL of the uploaded file.
 */
export async function uploadAttachmentToStorage(
  accessToken: string,
  organizationId: string,
  runId: string,
  attachmentId: string,
  fileName: string,
  mimeType: string,
  contentBase64: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const client = getStorageClient(accessToken);

    // base64 → Buffer → Blob
    const buffer = Buffer.from(contentBase64, 'base64');
    const blob = new Blob([buffer], { type: mimeType });

    const storagePath = `${organizationId}/${runId}/${attachmentId}/${fileName}`;

    const { error: uploadError } = await client.storage
      .from(BUCKET_NAME)
      .upload(storagePath, blob, {
        contentType: mimeType,
        upsert: true
      });

    if (uploadError) {
      return { url: null, error: uploadError.message };
    }

    const { data } = client.storage.from(BUCKET_NAME).getPublicUrl(storagePath);
    return { url: data.publicUrl, error: null };
  } catch (err) {
    return { url: null, error: err instanceof Error ? err.message : '업로드 실패' };
  }
}

/**
 * Ensure the garnet-attachments bucket exists (public read).
 * Safe to call on each sync — does nothing if already exists.
 */
export async function ensureAttachmentBucket(accessToken: string): Promise<void> {
  const client = getStorageClient(accessToken);
  const { data: buckets } = await client.storage.listBuckets();
  const exists = buckets?.some((b) => b.name === BUCKET_NAME);
  if (!exists) {
    await client.storage.createBucket(BUCKET_NAME, { public: true, fileSizeLimit: 50 * 1024 * 1024 });
  }
}

export type AttachmentWithStorageUrl = {
  id: string;
  name: string;
  mimeType: string;
  /** null when content is already in Supabase Storage */
  content: string;
  storageUrl: string | null;
  createdAt: string;
};

/**
 * Uploads all attachments in a run to Supabase Storage.
 * Returns the same list with storageUrl filled in and content set to '' to save DB space.
 */
export async function uploadRunAttachmentsToStorage(
  accessToken: string,
  organizationId: string,
  runId: string,
  attachments: Array<{ id: string; name: string; mimeType: string; content: string; createdAt: string }>
): Promise<AttachmentWithStorageUrl[]> {
  if (attachments.length === 0) return [];

  return Promise.all(
    attachments.map(async (att) => {
      // 이미 URL이 아닌 base64 content만 업로드
      if (!att.content || att.content.startsWith('http')) {
        return { ...att, storageUrl: att.content.startsWith('http') ? att.content : null };
      }

      const { url, error } = await uploadAttachmentToStorage(
        accessToken,
        organizationId,
        runId,
        att.id,
        att.name,
        att.mimeType,
        att.content
      );

      return {
        id: att.id,
        name: att.name,
        mimeType: att.mimeType,
        content: error ? att.content : '', // 업로드 성공 시 content 비움
        storageUrl: url,
        createdAt: att.createdAt
      };
    })
  );
}
