import { NextRequest, NextResponse } from 'next/server';
import { runLLM } from '@/lib/llm';
import { prisma } from '@/lib/prisma';

const CONTENT_PROMPTS: Record<string, { label: string; system: string }> = {
  instagram_caption: {
    label: '인스타그램 캡션',
    system: `당신은 한국 인스타그램 마케팅 전문가입니다. 브랜드 톤에 맞는 매력적인 캡션을 작성하세요.
규칙:
- 150자 내외의 메인 캡션 (이모지 포함)
- 관련 해시태그 10~15개
- 첫 줄은 클릭을 유도하는 훅으로 시작
- 한국어로 작성, 자연스럽고 친근한 톤`
  },
  ad_copy: {
    label: '광고 카피',
    system: `당신은 퍼포먼스 마케팅 카피라이터입니다. 클릭률을 높이는 광고 카피를 작성하세요.
규칙:
- 헤드라인 (30자 이내) 3가지 제안
- 서브카피 (70자 이내) 각 헤드라인에 맞게 3가지
- CTA 문구 5가지
- 핵심 혜택과 차별점을 명확하게 표현`
  },
  email_copy: {
    label: '이메일 카피',
    system: `당신은 이메일 마케팅 전문가입니다. 오픈율과 클릭률을 높이는 이메일을 작성하세요.
규칙:
- 제목 줄 (40자 이내) 3가지 제안
- 프리헤더 텍스트 3가지
- 본문 (인사말 → 핵심 메시지 → CTA 순)
- 전문적이지만 친근한 한국어 톤`
  },
  blog_post: {
    label: '블로그 포스트',
    system: `당신은 콘텐츠 마케팅 전문가입니다. SEO에 최적화된 블로그 포스트 초안을 작성하세요.
규칙:
- 제목 (SEO 키워드 포함)
- 도입부 (150자)
- H2 소제목 4~5개와 각 섹션 내용 요약
- 결론 및 CTA
- 자연스러운 한국어로 작성`
  },
  press_release: {
    label: '보도자료',
    system: `당신은 PR 전문가입니다. 언론에서 채택하기 쉬운 보도자료 형식으로 작성하세요.
규칙:
- 제목 (핵심 뉴스 가치 포함)
- 부제목
- 리드 문단 (5W1H)
- 본문 2~3 단락
- 인용구 1개
- 회사 소개 (보일러플레이트)
- 언론 연락처 자리표시자`
  },
  sms_push: {
    label: 'SMS/푸시 알림',
    system: `당신은 모바일 마케팅 전문가입니다. 짧고 임팩트 있는 메시지를 작성하세요.
규칙:
- SMS: 40자 이내 메시지 5가지
- 푸시 알림: 제목(20자) + 본문(40자) 조합 3가지
- 즉각적인 행동을 유도하는 문구
- 개인화 요소 포함 (예: {이름})`
  }
};

export async function GET() {
  const drafts = await prisma.contentDraft.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20
  });
  return NextResponse.json(drafts);
}

export async function POST(req: NextRequest) {
  try {
    const { contentType, brand, target, tone, keyMessage, additionalContext } = await req.json();

    if (!contentType || !CONTENT_PROMPTS[contentType]) {
      return NextResponse.json({ error: '콘텐츠 타입을 선택해 주세요.' }, { status: 400 });
    }

    const userPrompt = [
      brand && `브랜드: ${brand}`,
      target && `타겟 오디언스: ${target}`,
      tone && `톤앤매너: ${tone}`,
      keyMessage && `핵심 메시지: ${keyMessage}`,
      additionalContext && `추가 맥락: ${additionalContext}`
    ]
      .filter(Boolean)
      .join('\n');

    if (!userPrompt.trim()) {
      return NextResponse.json({ error: '브랜드 또는 핵심 메시지를 입력해 주세요.' }, { status: 400 });
    }

    const { system } = CONTENT_PROMPTS[contentType];
    const result = await runLLM(system, userPrompt, 0.75, 2000);

    const draft = await prisma.contentDraft.create({
      data: {
        contentType,
        brand: brand || '',
        target: target || '',
        tone: tone || '',
        keyMessage,
        additionalContext: additionalContext || '',
        result
      }
    });

    return NextResponse.json({ content: result, contentType, id: draft.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '생성 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });
  await prisma.contentDraft.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
