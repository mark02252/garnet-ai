import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { publishDraft } from '@/lib/sns/instagram-publisher'
import { sendSlackMessage, buildPublishNotification } from '@/lib/integrations/slack'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    accessToken?: string
    businessAccountId?: string
  }

  if (!body.accessToken || !body.businessAccountId) {
    return NextResponse.json(
      { error: 'accessToken과 businessAccountId가 필요합니다.' },
      { status: 400 }
    )
  }

  const now = new Date()
  const pendingPosts = await prisma.snsScheduledPost.findMany({
    where: { status: 'PENDING', scheduledAt: { lte: now } },
    include: { draft: true, persona: true },
  })

  const results = await Promise.allSettled(
    pendingPosts.map(async (post) => {
      try {
        const result = await publishDraft({
          accessToken: body.accessToken!,
          businessAccountId: body.businessAccountId!,
          draft: post.draft,
        })

        if (result.success) {
          await prisma.snsScheduledPost.update({
            where: { id: post.id },
            data: { status: 'PUBLISHED', publishedAt: now },
          })
          await prisma.snsContentDraft.update({
            where: { id: post.draftId },
            data: { status: 'PUBLISHED', publishedAt: now },
          })
          void sendSlackMessage(buildPublishNotification(post.draft?.title || '게시물', 'success'))
        } else {
          await prisma.snsScheduledPost.update({
            where: { id: post.id },
            data: { status: 'FAILED', errorMsg: result.error },
          })
          void sendSlackMessage(buildPublishNotification(post.draft?.title || '게시물', 'failed'))
        }
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
