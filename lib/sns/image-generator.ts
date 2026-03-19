// lib/sns/image-generator.ts
import { GoogleGenAI, type Part } from '@google/genai'
import { uploadSnsFile } from '@/lib/sns/upload'
import { applyCanvaTemplate } from '@/lib/sns/canva-pipeline'

// Gemini Flash image generation model
const MODEL_ID = 'gemini-2.5-flash-image'

export type GeneratedImage = {
  url: string
  mimeType: string
  rawUrl: string
  usedCanva: boolean
}

export async function generateSlideImage(
  imagePrompt: string,
  referenceImageUrls: string[] = []
): Promise<GeneratedImage> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY 또는 GOOGLE_API_KEY 환경변수가 없습니다.')

  const ai = new GoogleGenAI({ apiKey })

  // 프롬프트 + 레퍼런스 이미지 (최대 14장)
  const contents: Part[] = [{ text: imagePrompt }]
  for (const url of referenceImageUrls.slice(0, 14)) {
    const res = await fetch(url)
    const buffer = await res.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mimeType = res.headers.get('content-type') || 'image/jpeg'
    contents.push({ inlineData: { data: base64, mimeType } })
  }

  const response = await ai.models.generateContent({
    model: MODEL_ID,
    contents,
  })

  // 이미지 파트 추출
  const imagePart = response.candidates?.[0]?.content?.parts?.find(
    (p: unknown) => (p as { inlineData?: unknown }).inlineData
  ) as { inlineData: { data: string; mimeType: string } } | undefined

  if (!imagePart?.inlineData) throw new Error('이미지 생성 실패: 응답에 이미지 없음')

  const { data, mimeType } = imagePart.inlineData
  const buffer = Buffer.from(data, 'base64')
  const ext = mimeType.split('/')[1] || 'jpg'
  const fileName = `sns/slides/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  // Supabase Storage 업로드
  const uploadedUrl = await uploadSnsFile(fileName, buffer, mimeType)

  // Canva MCP 파이프라인 (선택적 — CANVA_API_TOKEN 있을 때만 동작)
  const canvaResult = await applyCanvaTemplate({
    rawImageUrl: uploadedUrl,
    templateKeyword: 'Instagram 포스트',
    headline: imagePrompt.slice(0, 50),
  })

  return {
    url: canvaResult.designUrl,
    mimeType,
    rawUrl: uploadedUrl,
    usedCanva: !canvaResult.usedFallback,
  }
}
