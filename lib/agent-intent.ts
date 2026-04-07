// lib/agent-intent.ts

export type IntentAction =
  | { type: 'panel';    panelType: 'ga4' | 'seminar' | 'intel' | 'video' | 'approval' | 'generic'; title: string }
  | { type: 'navigate'; url: string }
  | { type: 'text';     content: string }
  | { type: 'flow-create';   projectDescription: string; autoRun?: boolean }
  | { type: 'flow-run';      userInput: string }
  | { type: 'flow-list' }
  | { type: 'flow-converse';  question: string };

export interface ParsedIntent {
  action: IntentAction;
  reasoning: string;
}

const INTENT_SYSTEM_PROMPT = `
당신은 Garnet 마케팅 플랫폼의 명령 해석기입니다.
사용자의 텍스트 명령을 분석하여 아래 JSON 형식 하나만 반환하세요. 다른 텍스트는 절대 포함하지 마세요.

가능한 action 타입:
1. panel  — 패널을 열어야 할 때
   panelType 값: "ga4" | "seminar" | "intel" | "video" | "approval" | "generic"
   - ga4: 트래픽, 방문자, GA4, 세션, 분석 관련
   - seminar: 세미나, 토론, 라운드 관련
   - intel: 트렌드, 인텔리전스, 마케팅 동향 관련
   - video: 영상 생성, 비디오 관련
   - approval: 승인, 결재, 대기 항목 관련
   - generic: 그 외 질문/대화

2. navigate — 페이지로 이동해야 할 때
   url 값: "/operations" | "/campaigns" | "/analytics" | "/sns/studio" | "/seminar" | "/intel" | "/settings"

3. text — 패널이나 네비게이션 없이 텍스트 답변만 할 때

4. flow-create — 플로우를 새로 만들거나 에이전트 팀을 구성해야 할 때
   projectDescription: 프로젝트 설명 텍스트

5. flow-run — 기존 플로우를 실행해야 할 때
   userInput: 사용자 입력 원문

6. flow-list — 저장된 플로우 목록을 보여줘야 할 때

7. flow-converse — 플로우 생성을 위해 추가 정보가 필요할 때
   question: 사용자에게 물어볼 질문

응답 형식 (JSON only):
{
  "action": { "type": "panel", "panelType": "ga4", "title": "GA4 트래픽 현황" },
  "reasoning": "사용자가 트래픽 현황을 요청했습니다"
}
또는:
{ "action": { "type": "flow-create", "projectDescription": "카페 창업 마케팅" }, "reasoning": "플로우 생성 요청" }
`;

export async function parseIntent(command: string): Promise<ParsedIntent> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

  if (!apiKey) return keywordFallback(command);

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INTENT_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: command }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 300 }
      })
    });
    if (!response.ok) return keywordFallback(command);

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = (data.candidates ?? [])
      .flatMap((c) => c.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();

    return safeParseIntent(raw) ?? keywordFallback(command);
  } catch {
    return keywordFallback(command);
  }
}

function safeParseIntent(raw: string): ParsedIntent | null {
  try {
    const start = raw.indexOf('{');
    const end   = raw.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    const obj = JSON.parse(raw.slice(start, end + 1)) as {
      action?: { type?: string; panelType?: string; title?: string; url?: string; content?: string };
      reasoning?: string;
    };
    if (!obj.action?.type) return null;
    const t = obj.action.type;
    if (t === 'panel' && obj.action.panelType) {
      const validPanels = ['ga4','seminar','intel','video','approval','generic'] as const;
      const pt = obj.action.panelType as typeof validPanels[number];
      if (!(validPanels as readonly string[]).includes(pt)) return null;
      return { action: { type: 'panel', panelType: pt, title: obj.action.title ?? '패널' }, reasoning: obj.reasoning ?? '' };
    }
    if (t === 'navigate' && obj.action.url) {
      return { action: { type: 'navigate', url: obj.action.url }, reasoning: obj.reasoning ?? '' };
    }
    if (t === 'text') {
      return { action: { type: 'text', content: obj.action.content ?? '' }, reasoning: obj.reasoning ?? '' };
    }
    if (t === 'flow-create') {
      return { action: { type: 'flow-create', projectDescription: (obj.action as Record<string, string>).projectDescription ?? '' }, reasoning: obj.reasoning ?? '' }
    }
    if (t === 'flow-run') {
      return { action: { type: 'flow-run', userInput: (obj.action as Record<string, string>).userInput ?? '' }, reasoning: obj.reasoning ?? '' }
    }
    if (t === 'flow-list') {
      return { action: { type: 'flow-list' }, reasoning: obj.reasoning ?? '' }
    }
    if (t === 'flow-converse') {
      return { action: { type: 'flow-converse', question: (obj.action as Record<string, string>).question ?? '' }, reasoning: obj.reasoning ?? '' }
    }
    return null;
  } catch { return null; }
}

function keywordFallback(command: string): ParsedIntent {
  const lower = command.toLowerCase();
  if (/캠페인|campaign/.test(lower)) return { action: { type: 'navigate', url: '/campaigns' }, reasoning: '캠페인 키워드' };
  if (/설정|settings/.test(lower))   return { action: { type: 'navigate', url: '/settings' },  reasoning: '설정 키워드' };
  if (/운영|브리핑|operations/.test(lower)) return { action: { type: 'navigate', url: '/operations' }, reasoning: '운영 키워드' };
  if (/sns|소셜|콘텐츠/.test(lower))  return { action: { type: 'navigate', url: '/sns/studio' }, reasoning: 'SNS 키워드' };
  if (/ga4|트래픽|방문자/.test(lower)) return { action: { type: 'panel', panelType: 'ga4',      title: 'GA4 트래픽 현황' }, reasoning: 'GA4 키워드' };
  if (/세미나|토론|라운드/.test(lower)) return { action: { type: 'panel', panelType: 'seminar',  title: '세미나 현황' },     reasoning: '세미나 키워드' };
  if (/트렌드|인텔|intel/.test(lower)) return { action: { type: 'panel', panelType: 'intel',    title: '마케팅 인텔리전스' }, reasoning: '인텔 키워드' };
  if (/영상|비디오|video/.test(lower)) return { action: { type: 'panel', panelType: 'video',    title: '영상 생성 현황' },   reasoning: '영상 키워드' };
  if (/승인|결재|approval/.test(lower)) return { action: { type: 'panel', panelType: 'approval', title: '승인 대기 항목' },  reasoning: '승인 키워드' };
  if (/플로우.*(만들|생성|구성|설계)|에이전트.*팀/.test(lower)) return { action: { type: 'flow-create', projectDescription: command }, reasoning: '플로우 생성 키워드' };
  if (/플로우.*(실행|돌려|돌리|시작|run)/.test(lower)) return { action: { type: 'flow-run', userInput: command }, reasoning: '플로우 실행 키워드' };
  if (/플로우.*(목록|리스트|저장|보여|list)/.test(lower)) return { action: { type: 'flow-list' }, reasoning: '플로우 목록 키워드' };
  return { action: { type: 'panel', panelType: 'generic', title: '응답' }, reasoning: '기본 generic' };
}
