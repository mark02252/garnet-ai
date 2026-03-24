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
      '숏폼 영상 스크립트 작가. 한국어. 간결하게.',
      `${formatLabel} 영상 스크립트. 요청: ${req.prompt}
플랫폼: ${req.platform}, 길이: ${req.duration || 15}~30초

형식:
[HOOK] 3초 오프닝 - 나레이션 + 화면설명
[BODY] 본문 2~3포인트 - 나레이션 + 화면설명
[CTA] 마무리 - 행동유도 + 화면설명

각 장면: 나레이션, 화면설명, 시간(초). 바로 작성하세요.`,
      0.7,
      4000,
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
