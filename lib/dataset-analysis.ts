import { runLLM } from '@/lib/llm';

export async function analyzeDataset(input: {
  name: string;
  type: string;
  notes?: string;
  rawData: string;
  question?: string;
}) {
  const systemPrompt = [
    '당신은 시니어 마케팅 데이터 분석가입니다.',
    '모든 답변은 한국어로 작성하세요.',
    '실행 가능한 분석 결과를 구조화된 불릿으로 제공하세요.',
    '숫자 근거가 불충분하면 가정임을 명시하세요.'
  ].join('\n');

  const userPrompt = [
    '[데이터셋 정보]',
    `- 이름: ${input.name}`,
    `- 유형: ${input.type}`,
    `- 메모: ${input.notes || '없음'}`,
    '',
    '[원본 데이터]',
    input.rawData,
    '',
    '[요청]',
    input.question || '데이터를 종합 분석하고 마케팅 관점 실행안을 제시해줘.',
    '',
    '[출력 형식]',
    '1. 데이터 품질 진단',
    '2. 핵심 패턴 5개',
    '3. 이상치/리스크 시그널',
    '4. 기회 영역 3개',
    '5. 실행 우선순위 액션 플랜 (오늘/이번주/이번달)',
    '6. 추적 KPI와 대시보드 권장 항목'
  ].join('\n');

  return runLLM(systemPrompt, userPrompt, 0.2, 2200);
}
