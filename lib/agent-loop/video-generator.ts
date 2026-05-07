/**
 * Video Generator — Pixelle-Video 연동 모듈
 *
 * Garnet 인사이트 → 자동 숏폼 영상 생성
 * Pixelle-Video API (localhost:8501) 또는 외부 서비스 호출
 *
 * 사용 시나리오:
 * 1. 신작 등록 알림 → 15초 프로모션 영상 자동 생성
 * 2. 주간 성과 → 요약 영상 자동 생성
 * 3. 이벤트 홍보 → SNS용 숏폼 자동 생성
 */

type VideoRequest = {
  topic: string           // 영상 주제
  style?: 'documentary' | 'promotion' | 'news' | 'cinematic'
  duration?: number       // 초 (기본 15)
  language?: 'ko' | 'en'
  outputPath?: string     // 저장 경로
}

type VideoResult = {
  success: boolean
  videoPath?: string
  duration?: number
  error?: string
}

const PIXELLE_BASE_URL = process.env.PIXELLE_VIDEO_URL || 'http://localhost:8501'

/**
 * Pixelle-Video가 실행 중인지 확인
 */
export async function isVideoGeneratorAvailable(): Promise<boolean> {
  try {
    const res = await fetch(PIXELLE_BASE_URL, {
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * 영상 생성 요청
 * Pixelle-Video API로 호출 (설치 후 사용)
 */
export async function generateVideo(request: VideoRequest): Promise<VideoResult> {
  const available = await isVideoGeneratorAvailable()
  if (!available) {
    return { success: false, error: 'Pixelle-Video 서버가 실행 중이 아닙니다 (localhost:8501)' }
  }

  try {
    // Pixelle-Video Streamlit API 호출
    // 실제 API 명세에 맞춰 수정 필요
    const res = await fetch(`${PIXELLE_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: request.topic,
        style: request.style || 'promotion',
        duration: request.duration || 15,
        language: request.language || 'ko',
      }),
      signal: AbortSignal.timeout(300_000), // 5분 타임아웃 (영상 생성은 오래 걸림)
    })

    if (!res.ok) {
      return { success: false, error: `API 에러: ${res.status}` }
    }

    const data = await res.json() as { video_path?: string; duration?: number }
    return {
      success: true,
      videoPath: data.video_path,
      duration: data.duration,
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }
}

/**
 * Garnet 인사이트에서 영상 주제 생성
 * CRM 시나리오와 연동
 */
export function buildVideoTopicFromInsight(params: {
  type: 'new_movie' | 'weekly_report' | 'event_promo' | 'theater_highlight'
  theaterName?: string
  movieName?: string
  metric?: string
  period?: string
}): VideoRequest {
  switch (params.type) {
    case 'new_movie':
      return {
        topic: `${params.theaterName || '모노플렉스'}에서 새로운 영화 "${params.movieName || ''}" 상영 시작! 프라이빗 시네마에서 특별한 영화 경험을 만나보세요.`,
        style: 'promotion',
        duration: 15,
        language: 'ko',
      }

    case 'weekly_report':
      return {
        topic: `이번 주 모노플렉스 하이라이트. ${params.metric || ''} ${params.period || ''}`,
        style: 'news',
        duration: 30,
        language: 'ko',
      }

    case 'event_promo':
      return {
        topic: `${params.theaterName || '모노플렉스'} 특별 이벤트! 프라이빗 시네마에서 잊지 못할 순간을 만들어보세요.`,
        style: 'cinematic',
        duration: 15,
        language: 'ko',
      }

    case 'theater_highlight':
      return {
        topic: `${params.theaterName || ''} - 당신만을 위한 프라이빗 영화관. 30석 프리미엄 공간에서 특별한 영화 경험.`,
        style: 'cinematic',
        duration: 20,
        language: 'ko',
      }

    default:
      return { topic: params.movieName || '모노플렉스', style: 'promotion', duration: 15, language: 'ko' }
  }
}

/**
 * CRM 푸시와 연동 — 영상 생성 + 알림
 * CRM_AUTOMATION_PLAN.md의 시나리오 참고
 */
export async function generateAndNotify(params: {
  type: 'new_movie' | 'weekly_report' | 'event_promo' | 'theater_highlight'
  theaterName?: string
  movieName?: string
  metric?: string
  slackWebhook?: string
}): Promise<VideoResult> {
  const request = buildVideoTopicFromInsight(params)
  const result = await generateVideo(request)

  // 성공 시 Slack 알림
  if (result.success && params.slackWebhook) {
    try {
      await fetch(params.slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🎬 영상 자동 생성 완료\n주제: ${request.topic}\n파일: ${result.videoPath}`,
        }),
      })
    } catch { /* non-critical */ }
  }

  return result
}
