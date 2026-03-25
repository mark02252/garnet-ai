import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Get latest analytics snapshots
    const latestSnapshots = await prisma.snsAnalyticsSnapshot.findMany({
      orderBy: { date: 'desc' },
      take: 30,
      include: { persona: { select: { name: true, platform: true, instagramHandle: true } } }
    });

    // Get recent content performance
    const recentDrafts = await prisma.snsContentDraft.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      take: 10,
      select: {
        id: true, title: true, type: true, platform: true,
        publishedAt: true, status: true,
      }
    });

    // Get scheduled posts count
    const scheduledCount = await prisma.snsScheduledPost.count({
      where: { status: 'PENDING' }
    });

    // Get total personas
    const personaCount = await prisma.snsPersona.count({ where: { isActive: true } });

    return NextResponse.json({
      snapshots: latestSnapshots,
      recentContent: recentDrafts,
      scheduledCount,
      personaCount,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load SNS overview' }, { status: 500 });
  }
}
