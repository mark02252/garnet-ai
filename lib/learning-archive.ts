import { Prisma } from '@prisma/client';

function parseTags(raw?: string | null) {
  try {
    return JSON.parse(raw || '[]') as string[];
  } catch {
    return [];
  }
}

export function buildArchiveFromRun(run: {
  id: string;
  topic: string;
  brand?: string | null;
  goal?: string | null;
  meetingTurns: Array<{ role: string; content: string }>;
  deliverable?: { content: string } | null;
  memoryLog?: { direction: string; risks: string; tags: string } | null;
}) {
  const strategist = run.meetingTurns.find((t) => t.role === 'STRATEGIST')?.content || '';
  const pm = run.meetingTurns.find((t) => t.role === 'PM')?.content || '';
  const deliverablePreview = (run.deliverable?.content || '').split('\n').slice(0, 8).join('\n');
  const memoryTags = parseTags(run.memoryLog?.tags);

  const situation = [
    `주제: ${run.topic}`,
    run.brand ? `브랜드: ${run.brand}` : null,
    run.goal ? `목표: ${run.goal}` : null,
    '요청 성격: 마케팅 전략/실행안 생성'
  ]
    .filter(Boolean)
    .join(' | ');

  const recommendedResponse = [
    '1) 먼저 타깃과 KPI를 명확히 재정의한다.',
    '2) 웹 인텔리전스와 기존 메모리에서 근거를 뽑아 우선순위를 정한다.',
    '3) PM 결정을 기준으로 실행 가능한 산출물(채널/카피/실험안)을 고정한다.',
    '',
    '[직전 유사 산출물 미리보기]',
    deliverablePreview || '없음'
  ].join('\n');

  const reasoning = [
    '[전략가 핵심]',
    strategist || '전략가 발화 없음',
    '',
    '[PM 최종 결정]',
    pm || 'PM 발화 없음',
    '',
    `[리스크 메모] ${run.memoryLog?.risks || '없음'}`
  ].join('\n');

  const signals = [
    `유사 주제 키워드: ${run.topic}`,
    run.memoryLog?.direction ? `반복 전략 방향: ${run.memoryLog.direction}` : '반복 전략 방향: 없음',
    `태그 힌트: ${(memoryTags.length ? memoryTags : ['학습필요']).join(', ')}`
  ];

  const tags = Array.from(new Set(['대화학습', '전략응답', ...memoryTags])).slice(0, 8);

  return {
    runId: run.id,
    sourceType: 'RUN',
    situation,
    recommendedResponse,
    reasoning,
    signals: JSON.stringify(signals),
    tags: JSON.stringify(tags),
    status: 'DRAFT' as Prisma.LearningArchiveCreateInput['status']
  };
}
