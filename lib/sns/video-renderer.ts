// lib/sns/video-renderer.ts
// VIDEO 타입 초안 렌더링을 위한 스텁 — 향후 fluent-ffmpeg 기반 구현 예정

export type VideoRenderInput = {
  slides: Array<{ imageUrl: string; title: string; body: string }>
  durationPerSlide?: number  // seconds, default 3
  outputFormat?: 'mp4' | 'webm'
}

export type VideoRenderResult = {
  videoUrl: string
  durationSeconds: number
}

/**
 * TODO: fluent-ffmpeg를 사용해 슬라이드 이미지 배열 → 영상으로 렌더링
 * Electron main process에서 ffmpeg 경로 주입 필요 (electron/main.ts에 ffmpegPath 설정됨)
 */
export async function renderSlidesToVideo(
  _input: VideoRenderInput
): Promise<VideoRenderResult> {
  throw new Error('video-renderer: 아직 구현되지 않았습니다.')
}
