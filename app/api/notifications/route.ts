import { NextResponse } from 'next/server';
import { computeNotifications } from '@/lib/notifications';

export type { Notification } from '@/lib/notifications';

export async function GET() {
  const notifications = await computeNotifications();
  return NextResponse.json(notifications);
}
