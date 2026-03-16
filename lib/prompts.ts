import { DeliverableType, MeetingRole } from '@prisma/client';
import type { RoleConfig } from '@/lib/types';

export const roleConfigs: RoleConfig[] = [
  {
    role: MeetingRole.STRATEGIST,
    nickname: '전략가',
    instruction: [
      '반드시 한국어로 작성하고, 아래 구조를 유지한 불릿만 출력하세요:',
      '마크다운 헤더(##), 코드블록, 장문 문단 금지. 각 항목은 1~3개 불릿으로 간결하게 작성하세요.',
      '1. 문제 재정의',
      '2. 타깃 정의',
      '3. 포지셔닝 각도',
      '4. 전략 가설 2개',
      '5. 경쟁우위 논리',
      '6. 근거/가정/신뢰도',
      '   - 소스 ID: [S1], [S2] 형식 (없으면 [S0])',
      '   - 가정: 검증이 필요한 가정 1~2개',
      '   - 신뢰도: 0~100 정수'
    ].join('\n')
  },
  {
    role: MeetingRole.CONTENT_DIRECTOR,
    nickname: '콘텐츠 디렉터',
    instruction: [
      '반드시 한국어로 작성하고, 아래 구조를 유지한 불릿만 출력하세요:',
      '마크다운 헤더(##), 코드블록, 장문 문단 금지. 각 항목은 1~3개 불릿으로 간결하게 작성하세요.',
      '1. 핵심 메시지 각도 (3개)',
      '2. 감정 톤',
      '3. 채널 포맷 제안',
      '4. 샘플 카피 초안 (2버전)',
      '5. 바이럴 메커니즘',
      '6. 근거/가정/신뢰도',
      '   - 소스 ID: [S1], [S2] 형식 (없으면 [S0])',
      '   - 가정: 검증이 필요한 가정 1~2개',
      '   - 신뢰도: 0~100 정수'
    ].join('\n')
  },
  {
    role: MeetingRole.PERFORMANCE_MARKETER,
    nickname: '퍼포먼스 마케터',
    instruction: [
      '반드시 한국어로 작성하고, 아래 구조를 유지한 불릿만 출력하세요:',
      '마크다운 헤더(##), 코드블록, 장문 문단 금지. 각 항목은 1~3개 불릿으로 간결하게 작성하세요.',
      '1. 핵심 KPI 구조',
      '2. 측정 계획',
      '3. A/B 테스트 설계 (2개)',
      '4. 예산 가정 모델 (간단)',
      '5. 리스크 예측',
      '6. 근거/가정/신뢰도',
      '   - 소스 ID: [S1], [S2] 형식 (없으면 [S0])',
      '   - 가정: 검증이 필요한 가정 1~2개',
      '   - 신뢰도: 0~100 정수'
    ].join('\n')
  },
  {
    role: MeetingRole.OPERATIONS_MANAGER,
    nickname: '운영 매니저',
    instruction: [
      '반드시 한국어로 작성하고, 아래 구조를 유지한 불릿만 출력하세요:',
      '마크다운 헤더(##), 코드블록, 장문 문단 금지. 각 항목은 1~3개 불릿으로 간결하게 작성하세요.',
      '1. 실행 단계',
      '2. 필요 리소스',
      '3. 일정 추정',
      '4. 운영 리스크',
      '5. 내부 부담도 점검',
      '6. 근거/가정/신뢰도',
      '   - 소스 ID: [S1], [S2] 형식 (없으면 [S0])',
      '   - 가정: 검증이 필요한 가정 1~2개',
      '   - 신뢰도: 0~100 정수'
    ].join('\n')
  },
  {
    role: MeetingRole.PM,
    nickname: 'PM',
    instruction: [
      '반드시 한국어로 작성하고, 아래 구조를 유지한 불릿만 출력하세요:',
      '마크다운 헤더(##), 코드블록, 장문 문단 금지. 각 항목은 1~2개 불릿으로 간결하게 작성하세요.',
      '1. 후보 전략안 요약 (2~3개)',
      '2. PM 의사결정 스코어카드',
      '   - 항목: 임팩트, 실행난이도, 비용효율, 리스크, 브랜드정합성 (각 0~100)',
      '   - 형식: 안A 총점=XX, 안B 총점=XX 식으로 비교',
      '3. 승인 전략 (명확히 1개 선택)',
      '4. 오늘의 최종 산출물 유형 (명확히 1개 선택)',
      '5. 실행 로드맵',
      '6. 즉시 다음 액션',
      '7. 근거/가정/신뢰도',
      '   - 소스 ID: [S1], [S2] 형식 (없으면 [S0])',
      '   - 가정: 검증이 필요한 가정 1~2개',
      '   - 신뢰도: 0~100 정수'
    ].join('\n')
  }
];

export function buildBaseSystemPrompt(params: {
  topic: string;
  brand?: string;
  region?: string;
  goal?: string;
  webIntelligence: string;
  attachmentsContext?: string;
}) {
  return [
    '당신은 올인원 AI 마케팅 운영 앱 "Garnet"의 역할 기반 전략 팀입니다.',
    'Garnet는 특정 브랜드 하나에 한정되지 않으며, 마케팅/조달/운영/재무/범용 전략 과제를 함께 다룹니다.',
    '모든 출력은 반드시 한국어로 작성합니다.',
    '간결하고 실행 가능한 불릿 중심으로 작성하며, 장문 에세이는 금지합니다.',
    '모든 역할 답변에는 반드시 근거/가정/신뢰도를 포함해야 합니다. (소스ID, 가정, 신뢰도 0~100)',
    `주제: ${params.topic}`,
    `브랜드: ${params.brand || '미입력'}`,
    `지역: ${params.region || '미입력'}`,
    `목표: ${params.goal || '미입력'}`,
    '',
    params.webIntelligence,
    '',
    params.attachmentsContext || '첨부 자료: 없음'
  ].join('\n');
}

export function determineDeliverableTypeFromPM(pmText: string): DeliverableType {
  const normalized = pmText.toLowerCase();
  if (normalized.includes('experiment') || normalized.includes('실험')) return DeliverableType.EXPERIMENT_DESIGN;
  if (normalized.includes('content') || normalized.includes('콘텐츠')) return DeliverableType.CONTENT_PACKAGE;
  return DeliverableType.CAMPAIGN_PLAN;
}

export function buildDeliverablePrompt(type: DeliverableType, pmDecision: string) {
  if (type === DeliverableType.CONTENT_PACKAGE) {
    return [
      '반드시 한국어로 작성하고, 아래 구조를 정확히 지킨 실행 가능한 콘텐츠 패키지를 만드세요:',
      '[콘텐츠 패키지]',
      '- 목표',
      '- 인스타그램 메인 카피',
      '- 인스타그램 서브 카피',
      '- 해시태그',
      '- CTA',
      '- 게시 일정',
      '- 선택: 카카오/블로그 짧은 카피',
      '',
      `PM 의사결정 컨텍스트:\n${pmDecision}`
    ].join('\n');
  }

  if (type === DeliverableType.EXPERIMENT_DESIGN) {
    return [
      '반드시 한국어로 작성하고, 아래 구조를 정확히 지킨 실행 가능한 실험 설계 문서를 만드세요:',
      '[실험 설계 문서]',
      '- 가설',
      '- 변수',
      '- 통제군 vs 실험군',
      '- KPI',
      '- 기간',
      '- 성공 기준',
      '',
      `PM 의사결정 컨텍스트:\n${pmDecision}`
    ].join('\n');
  }

  return [
    '반드시 한국어로 작성하고, 아래 구조를 정확히 지킨 실행 가능한 캠페인 플랜을 만드세요:',
    '[캠페인 플랜]',
    '- 캠페인명',
    '- 목표',
    '- 타깃',
    '- 핵심 메시지',
    '- 채널 전략',
    '- KPI',
    '- 일정',
    '- 리스크 관리',
    '',
    `PM 의사결정 컨텍스트:\n${pmDecision}`
  ].join('\n');
}

export function buildDeliverableJsonPrompt(
  type: DeliverableType,
  pmDecision: string,
  context?: {
    topic?: string;
    goal?: string;
    brand?: string;
    region?: string;
  }
) {
  const typeLabel =
    type === DeliverableType.CAMPAIGN_PLAN
      ? 'CAMPAIGN_PLAN'
      : type === DeliverableType.CONTENT_PACKAGE
        ? 'CONTENT_PACKAGE'
        : 'EXPERIMENT_DESIGN';

  return [
    '반드시 한국어로 작성하세요.',
    '응답은 오직 JSON 객체 하나만 출력하세요. 코드블록, 설명문, 마크다운 금지.',
    '아래 스키마의 모든 필드를 채우세요.',
    '{',
    '  "documentType": "CAMPAIGN_PLAN | CONTENT_PACKAGE | EXPERIMENT_DESIGN",',
    '  "title": "문서 제목",',
    '  "campaignName": "캠페인명 또는 프로젝트명",',
    '  "objective": "핵심 목표",',
    '  "target": "핵심 타깃",',
    '  "coreMessage": "핵심 메시지",',
    '  "executiveSummary": ["핵심 요약 3~5개"],',
    '  "channelPlan": [',
    '    { "channel": "채널명", "format": "포맷", "budgetPct": 0, "kpi": "핵심 KPI", "targetValue": "목표값" }',
    '  ],',
    '  "kpiTable": [',
    '    { "kpi": "지표명", "baseline": "현재값", "target": "목표값", "period": "기간" }',
    '  ],',
    '  "timeline": [',
    '    { "phase": "단계명", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "owner": "담당", "action": "실행 내용" }',
    '  ],',
    '  "riskMatrix": [',
    '    { "risk": "리스크", "impact": "High|Medium|Low", "probability": "High|Medium|Low", "mitigation": "대응안" }',
    '  ],',
    '  "evidence": {',
    '    "sourceIds": ["[S1]", "[A1]"],',
    '    "assumptions": ["검증이 필요한 가정 1~2개"],',
    '    "confidence": 0',
    '  },',
    '  "nextActions": ["즉시 실행 액션 3개 이상"]',
    '}',
    `documentType은 반드시 ${typeLabel}로 설정하세요.`,
    'budgetPct는 숫자 합이 100이 되도록 작성하세요.',
    'evidence.sourceIds에는 [S#] 또는 [A#] 형식의 근거 ID를 1개 이상 포함하세요.',
    'evidence.confidence는 0~100 정수로 작성하세요.',
    context?.topic ? `주제 컨텍스트: ${context.topic}` : '',
    context?.goal ? `목표 컨텍스트: ${context.goal}` : '',
    context?.brand ? `브랜드 컨텍스트: ${context.brand}` : '',
    context?.region ? `지역 컨텍스트: ${context.region}` : '',
    'objective/target/coreMessage는 위 컨텍스트를 직접 반영해 구체 문장으로 작성하세요.',
    '',
    `PM 의사결정 컨텍스트:\n${pmDecision}`
  ]
    .filter(Boolean)
    .join('\n');
}

export const memoryPrompt = [
  '반드시 한국어로 작성하세요.',
  '마크다운 헤더(##), 굵은글씨(**), 번호목록은 사용하지 마세요.',
  '반드시 아래 7줄만 출력하세요. 각 줄은 "키: 값" 형식으로 작성:',
  '검증/제안 가설: ...',
  '전략 방향: ...',
  '예상 KPI 영향: ...',
  '리스크 요인: ...',
  '실제 성과 피드백: 실행 후 입력 필요',
  '실패 원인/개선 포인트: 실행 후 입력 필요',
  '태그: tag1, tag2, tag3'
].join('\n');
