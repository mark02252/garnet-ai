import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { text } = await req.json() as { text: string };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify({ event, data })}\n\n`)
        );
      };

      // Route simple navigation commands
      const lower = text.toLowerCase();
      if (lower.includes('캠페인')) {
        send('navigate', { url: '/campaigns' });
        send('done', {});
        controller.close();
        return;
      }
      if (lower.includes('analytics') || lower.includes('분석') || lower.includes('ga4')) {
        send('navigate', { url: '/analytics' });
        send('done', {});
        controller.close();
        return;
      }

      // Generic response — spawn a generic panel
      const entryId = `entry-${Date.now()}`;
      send('step', { entryId, step: { text: '명령을 처리하는 중...', status: 'running' } });

      await new Promise((r) => setTimeout(r, 600));

      send('step', { entryId, step: { text: '응답 생성 완료', status: 'done' } });
      send('panel', {
        type: 'generic',
        title: text.slice(0, 30),
        status: 'active',
        position: { x: 20, y: 20 },
        size: { width: 380, height: 260 },
        data: { markdown: `**명령:** ${text}\n\n*Phase UI-2에서 LLM 연동 예정*` }
      });
      send('done', { entryId });

      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}
