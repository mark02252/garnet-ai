import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const DEFAULT_TEMPLATES = [
  { name: '주간 팁', category: 'TIP', type: 'CAROUSEL' as const, promptTemplate: '이번 주 {topic}에 대한 실용적인 팁 5가지를 카드뉴스로 만들어줘', slideCount: 5 },
  { name: '비하인드 스토리', category: 'BEHIND', type: 'TEXT' as const, promptTemplate: '{topic}의 비하인드 스토리를 진솔하고 감성적으로 작성해줘' },
  { name: '이벤트/프로모션', category: 'EVENT', type: 'CAROUSEL' as const, promptTemplate: '{topic} 이벤트를 홍보하는 카드뉴스를 만들어줘. 참여 방법과 혜택을 명확하게', slideCount: 4 },
  { name: '고객 후기/리뷰', category: 'REVIEW', type: 'TEXT' as const, promptTemplate: '{topic}에 대한 고객 후기를 바탕으로 신뢰감 있는 게시물을 작성해줘' },
  { name: '트렌드 분석', category: 'TREND', type: 'CAROUSEL' as const, promptTemplate: '최근 {topic} 트렌드를 분석하고 인사이트를 카드뉴스로 정리해줘', slideCount: 5 },
  { name: 'Q&A / FAQ', category: 'QNA', type: 'CAROUSEL' as const, promptTemplate: '{topic}에 대해 자주 묻는 질문 5가지와 답변을 카드뉴스로 만들어줘', slideCount: 6 },
  { name: '신제품/서비스 소개', category: 'LAUNCH', type: 'CAROUSEL' as const, promptTemplate: '{topic} 신제품/서비스의 핵심 특징과 장점을 카드뉴스로 소개해줘', slideCount: 5 },
  { name: '병맛/밈 콘텐츠', category: 'MEME', type: 'TEXT' as const, promptTemplate: '{topic}을 재미있고 병맛 넘치는 밈 스타일로 작성해줘. 트렌디하고 웃긴 톤으로' },
]

export async function POST() {
  const existing = await prisma.snsContentTemplate.count()
  if (existing > 0) {
    return NextResponse.json({ message: 'Templates already seeded', count: existing })
  }

  const created = await prisma.snsContentTemplate.createMany({
    data: DEFAULT_TEMPLATES.map(t => ({
      name: t.name,
      category: t.category,
      type: t.type,
      promptTemplate: t.promptTemplate,
      slideCount: t.slideCount || 5,
      hashtags: '[]',
    })),
  })

  return NextResponse.json({ message: 'Seeded default templates', count: created.count }, { status: 201 })
}
