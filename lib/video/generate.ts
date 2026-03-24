import { prisma } from '@/lib/prisma';
import { runLLM } from '@/lib/llm';
import type { RuntimeConfig } from '@/lib/types';
import type { VideoGenerationRequest, VideoGenerationResult } from './types';
import { FORMAT_LABELS } from './types';

/**
 * Step 1: AI가 마케팅 영상 스크립트를 생성한다.
 * Step 2: 스크립트를 기반으로 MCP video-gen 서버로 영상 생성을 요청한다.
 * Step 3: MCP video-editor로 자막/리사이즈 후처리한다.
 *
 * 현재: Step 1 (스크립트 생성) + DB 저장만 구현.
 * MCP 영상 서버 연동은 서버 설치 후 확장.
 */
export async function createVideoGeneration(
  req: VideoGenerationRequest,
  runtime?: RuntimeConfig
): Promise<VideoGenerationResult> {
  // DB에 작업 생성
  const record = await prisma.videoGeneration.create({
    data: {
      prompt: req.prompt,
      format: req.format,
      platform: req.platform,
      status: 'GENERATING',
    }
  });

  try {
    // AI 스크립트 생성
    const formatLabel = FORMAT_LABELS[req.format] || req.format;
    const script = await runLLM(
      '당신은 숏폼 마케팅 영상 전문 스크립트 작가입니다. 한국어로 작성하세요.',
      `아래 요청을 기반으로 ${formatLabel} 영상 스크립트를 작성하세요.

요청: ${req.prompt}
플랫폼: ${req.platform}
길이: ${req.duration || 15}~30초

다음 형식으로 작성하세요:
1. [HOOK] 첫 3초 - 시선을 사로잡는 오프닝 (질문/충격적 사실/공감)
2. [BODY] 본문 - 핵심 메시지 전달 (2~3개 포인트)
3. [CTA] 마무리 - 행동 유도 (팔로우/링크/댓글)

각 장면에 대해:
- 나레이션 텍스트
- 화면 설명 (배경, 텍스트 오버레이, 전환 효과)
- 예상 시간(초)

스크립트만 출력하세요.`,
      0.7,
      2000,
      runtime
    );

    // 스크립트 저장 + 상태 업데이트
    // MCP 영상 서버 미연동 시 COMPLETED로 저장 (스크립트만)
    await prisma.videoGeneration.update({
      where: { id: record.id },
      data: {
        script,
        status: 'COMPLETED',
        metadata: JSON.stringify({
          format: req.format,
          platform: req.platform,
          generatedAt: new Date().toISOString(),
          note: 'MCP video server 미연동 — 스크립트만 생성됨'
        })
      }
    });

    return {
      id: record.id,
      status: 'COMPLETED',
      script,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    await prisma.videoGeneration.update({
      where: { id: record.id },
      data: { status: 'FAILED', error }
    });
    return { id: record.id, status: 'FAILED', error };
  }
}

export async function getVideoGeneration(id: string): Promise<VideoGenerationResult | null> {
  const record = await prisma.videoGeneration.findUnique({ where: { id } });
  if (!record) return null;
  return {
    id: record.id,
    status: record.status as VideoGenerationResult['status'],
    videoUrl: record.videoUrl || undefined,
    thumbnailUrl: record.thumbnailUrl || undefined,
    script: record.script || undefined,
    error: record.error || undefined,
  };
}

export async function listVideoGenerations(limit: number = 20) {
  return prisma.videoGeneration.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
