// lib/sns/canva-pipeline.ts (temporary stub — will be expanded in Task 2-3)
export type CanvaPipelineInput = {
  rawImageUrl: string
  templateKeyword: string
  brandName?: string
  headline?: string
}

export type CanvaPipelineResult = {
  designUrl: string
  exportUrl?: string
  usedFallback: boolean
}

export async function applyCanvaTemplate(
  input: CanvaPipelineInput
): Promise<CanvaPipelineResult> {
  const canvaToken = process.env.CANVA_API_TOKEN
  if (!canvaToken) {
    return { designUrl: input.rawImageUrl, usedFallback: true }
  }
  // Full implementation added in Task 2-3
  return { designUrl: input.rawImageUrl, usedFallback: true }
}
