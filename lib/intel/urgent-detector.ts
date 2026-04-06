import { prisma } from '@/lib/prisma';
import { sendSlackMessage } from '@/lib/integrations/slack';
import { isTelegramConfigured } from '@/lib/telegram';

export async function detectAndAlertUrgent(): Promise<number> {
  const urgentItems = await prisma.marketingIntel.findMany({
    where: { urgency: 'CRITICAL', digestId: null, relevance: { gte: 0.5 } },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  if (urgentItems.length === 0) return 0;

  const digest = await prisma.marketingDigest.create({
    data: {
      type: 'URGENT',
      headline: `긴급 마케팅 인텔 ${urgentItems.length}건 감지`,
      summary: urgentItems.map((item) => `[${item.platform}] ${item.title}`).join('\n'),
      insights: JSON.stringify([]),
      actions: JSON.stringify([]),
      itemCount: urgentItems.length,
    }
  });

  await prisma.marketingIntel.updateMany({
    where: { id: { in: urgentItems.map((i) => i.id) } },
    data: { digestId: digest.id }
  });

  if (isTelegramConfigured()) {
    const message = urgentItems
      .map((item) => `*[${item.platform}]* ${item.title}\n${item.snippet.slice(0, 200)}\n${item.url}`)
      .join('\n\n');

    await sendSlackMessage({ text: `*[긴급 마케팅 인텔]*\n\n${message}` });
    await prisma.marketingDigest.update({
      where: { id: digest.id },
      data: { notifiedAt: new Date() }
    });
  }

  return urgentItems.length;
}
