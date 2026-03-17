// lib/sns/upload.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BUCKET = 'garnet-attachments'

/**
 * SNS 이미지(또는 영상)를 Supabase Storage에 업로드하고 public URL을 반환한다.
 * @param path   저장 경로 (예: "sns/slides/1234.jpg")
 * @param buffer 파일 버퍼
 * @param mimeType MIME 타입 (예: "image/jpeg")
 */
export async function uploadSnsFile(
  path: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const supabase = createClient(supabaseUrl, supabaseKey)

  // 버킷이 없으면 public 버킷 자동 생성 (이미 있으면 무시됨)
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {})

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mimeType, upsert: true })

  if (error) throw new Error(`Storage 업로드 실패: ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}
