import { NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({ url: z.string().url() })

function extractMeta(html: string): { title: string; description: string } {
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1]
  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)?.[1]
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]

  const title = (ogTitle || titleTag || '').trim().slice(0, 200)
  const description = (ogDesc || '').trim().slice(0, 500)

  return { title, description }
}

export async function POST(req: Request) {
  try {
    const { url } = schema.parse(await req.json())

    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Garnet/1.0)' },
    })

    if (!res.ok) {
      return NextResponse.json({ title: '', description: '' })
    }

    const html = await res.text()
    const meta = extractMeta(html)

    return NextResponse.json(meta)
  } catch {
    return NextResponse.json({ title: '', description: '' })
  }
}
