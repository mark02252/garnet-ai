import { NextRequest, NextResponse } from 'next/server'
import { sendSlackMessage } from '@/lib/integrations/slack'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const result = await sendSlackMessage({ text: body.text || '', blocks: body.blocks })
  return NextResponse.json(result)
}
