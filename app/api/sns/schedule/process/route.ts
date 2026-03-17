import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST() {
  const now = new Date()
  const pendingPosts = await prisma.snsScheduledPost.findMany({
    where: { status: 'PENDING', scheduledAt: { lte: now } },
    include: { draft: true, persona: true },
  })

  const results = await Promise.allSettled(
    pendingPosts.map(async (post) => {
      try {
        // TODO: Instagram Graph API 발행 연동 (ig-mcp 또는 직접 호출)
        await prisma.snsScheduledPost.update({
          where: { id: post.id },
          data: { status: 'PUBLISHED', publishedAt: now },
        })
        await prisma.snsContentDraft.update({
          where: { id: post.draftId },
          data: { status: 'PUBLISHED', publishedAt: now },
        })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '발행 실패'
        await prisma.snsScheduledPost.update({
          where: { id: post.id },
          data: { status: 'FAILED', errorMsg: msg },
        })
      }
    })
  )

  return NextResponse.json({ processed: results.length })
}
