import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { analyzePostsForPersona, generatePersonaFromTemplate } from '@/lib/sns/persona-learner'

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const body = await req.json()
    const { mode, posts, brandName, purpose, target, language } = body

    let analysis

    if (mode === 'FROM_POSTS') {
      if (!posts?.length || posts.length < 5) {
        return NextResponse.json({ error: '포스팅 5개 이상 필요합니다.' }, { status: 400 })
      }
      analysis = await analyzePostsForPersona(posts)

      await prisma.snsPersonaPost.createMany({
        data: posts.map((content: string) => ({
          personaId: id,
          content,
          source: 'manual',
        })),
        skipDuplicates: true as never,
      })
    } else {
      if (!brandName || !purpose) {
        return NextResponse.json({ error: '브랜드명과 목적은 필수입니다.' }, { status: 400 })
      }
      analysis = await generatePersonaFromTemplate({ brandName, purpose, target, language: language || '한국어' })
    }

    const updated = await prisma.snsPersona.update({
      where: { id },
      data: {
        learnMode: mode,
        brandConcept: analysis.brandConcept,
        targetAudience: analysis.targetAudience,
        writingStyle: analysis.writingStyle,
        tone: analysis.tone,
        keywords: JSON.stringify(analysis.keywords),
        sampleSentences: JSON.stringify(analysis.sampleSentences),
      },
    })

    return NextResponse.json({ persona: updated, analysis })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '분석 실패'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
