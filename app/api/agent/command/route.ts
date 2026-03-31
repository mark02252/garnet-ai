import { parseIntent } from '@/lib/agent-intent';
import { fetchGA4Data, fetchSeminarData, fetchIntelData, fetchVideoData, fetchApprovalData } from '@/lib/agent-panel-data';
import { runLLM } from '@/lib/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// IMPORTANT: { event, data } nested structure — matches handleSSEEvent in command-bar.tsx
const encoder = new TextEncoder();
function send(controller: ReadableStreamDefaultController, event: string, data: unknown) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event, data })}\n\n`));
}

export async function POST(req: Request) {
  const { text } = (await req.json()) as { text: string };
  if (!text?.trim()) {
    return new Response(JSON.stringify({ error: 'text required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await processCommand(text.trim(), controller);
      } catch (err) {
        const message = err instanceof Error ? err.message : '알 수 없는 오류';
        send(controller, 'error', { message });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }
  });
}

async function processCommand(text: string, controller: ReadableStreamDefaultController) {
  // Step 1: parse intent (Gemini or keyword fallback)
  const serverEntryId = crypto.randomUUID();
  send(controller, 'step', { entryId: serverEntryId, step: { text: '명령을 분석하는 중...', status: 'running' } });
  const intent = await parseIntent(text);
  send(controller, 'step', { entryId: serverEntryId, step: { text: `의도 파악: ${intent.reasoning}`, status: 'done' } });

  const { action } = intent;

  // Navigate
  if (action.type === 'navigate') {
    send(controller, 'navigate', { url: action.url });
    send(controller, 'done', {});
    return;
  }

  // Text-only
  if (action.type === 'text') {
    send(controller, 'step', { entryId: serverEntryId, step: { text: '답변 생성 중...', status: 'running' } });
    const reply = await runLLM(
      '당신은 Garnet AI 어시스턴트입니다. 간결한 한국어 답변을 마크다운으로 제공하세요.',
      text, 0.5, 800
    );
    send(controller, 'step', { entryId: serverEntryId, step: { text: '답변 완료', status: 'done' } });
    send(controller, 'panel', {
      type: 'generic', title: '응답', status: 'active',
      position: { x: 80, y: 80 }, size: { width: 480, height: 340 },
      data: { markdown: reply }
    });
    send(controller, 'done', {});
    return;
  }

  // Panel — fetch real data server-side
  const { panelType, title } = action;
  send(controller, 'step', { entryId: serverEntryId, step: { text: `${title} 데이터 로드 중...`, status: 'running' } });

  let panelData: unknown = {};
  if (panelType === 'ga4')      panelData = await fetchGA4Data();
  if (panelType === 'seminar')  panelData = await fetchSeminarData();
  if (panelType === 'intel')    panelData = await fetchIntelData();
  if (panelType === 'video')    panelData = await fetchVideoData();
  if (panelType === 'approval') panelData = await fetchApprovalData();

  if (panelType === 'generic') {
    send(controller, 'step', { entryId: serverEntryId, step: { text: '답변 생성 중...', status: 'running' } });
    const reply = await runLLM(
      '당신은 Garnet AI 어시스턴트입니다. 간결한 한국어 답변을 마크다운으로 제공하세요.',
      text, 0.5, 800
    );
    panelData = { markdown: reply };
  }

  send(controller, 'step', { entryId: serverEntryId, step: { text: `${title} 데이터 로드 완료`, status: 'done' } });
  send(controller, 'panel', {
    type: panelType, title, status: 'active',
    position: { x: 80 + Math.floor(Math.random() * 60), y: 80 + Math.floor(Math.random() * 40) },
    size: { width: panelType === 'approval' ? 520 : 400, height: panelType === 'approval' ? 400 : 300 },
    data: panelData
  });
  send(controller, 'done', {});
}
