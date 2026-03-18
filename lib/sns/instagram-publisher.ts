// lib/sns/instagram-publisher.ts

const GRAPH_API_VERSION = 'v19.0'
const GRAPH_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`

type PublishResult = {
  success: boolean
  mediaId?: string
  error?: string
}

export async function publishSingleImage(params: {
  accessToken: string
  businessAccountId: string
  imageUrl: string
  caption: string
}): Promise<PublishResult> {
  const { accessToken, businessAccountId, imageUrl, caption } = params

  try {
    // Step 1: Create media container
    const createRes = await fetch(`${GRAPH_BASE}/${businessAccountId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token: accessToken,
      }),
    })
    const createData = (await createRes.json()) as {
      id?: string
      error?: { message: string }
    }
    if (!createRes.ok || !createData.id) {
      return {
        success: false,
        error: createData.error?.message || '미디어 컨테이너 생성 실패',
      }
    }

    // Step 2: Publish
    const publishRes = await fetch(
      `${GRAPH_BASE}/${businessAccountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: createData.id,
          access_token: accessToken,
        }),
      }
    )
    const publishData = (await publishRes.json()) as {
      id?: string
      error?: { message: string }
    }
    if (!publishRes.ok || !publishData.id) {
      return {
        success: false,
        error: publishData.error?.message || '게시 실패',
      }
    }

    return { success: true, mediaId: publishData.id }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '알 수 없는 오류',
    }
  }
}

export async function publishCarousel(params: {
  accessToken: string
  businessAccountId: string
  slides: Array<{ imageUrl: string }>
  caption: string
}): Promise<PublishResult> {
  const { accessToken, businessAccountId, slides, caption } = params

  if (slides.length < 2) {
    return { success: false, error: '캐러셀은 최소 2개 슬라이드가 필요합니다.' }
  }

  try {
    // Step 1: Create child containers for each slide
    const childIds: string[] = []
    for (const slide of slides) {
      if (!slide.imageUrl) {
        return {
          success: false,
          error: '모든 슬라이드에 이미지가 필요합니다.',
        }
      }
      const res = await fetch(`${GRAPH_BASE}/${businessAccountId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: slide.imageUrl,
          is_carousel_item: true,
          access_token: accessToken,
        }),
      })
      const data = (await res.json()) as {
        id?: string
        error?: { message: string }
      }
      if (!res.ok || !data.id) {
        return {
          success: false,
          error: data.error?.message || '슬라이드 컨테이너 생성 실패',
        }
      }
      childIds.push(data.id)
    }

    // Step 2: Create carousel container
    const carouselRes = await fetch(
      `${GRAPH_BASE}/${businessAccountId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'CAROUSEL',
          children: childIds,
          caption,
          access_token: accessToken,
        }),
      }
    )
    const carouselData = (await carouselRes.json()) as {
      id?: string
      error?: { message: string }
    }
    if (!carouselRes.ok || !carouselData.id) {
      return {
        success: false,
        error: carouselData.error?.message || '캐러셀 컨테이너 생성 실패',
      }
    }

    // Step 3: Publish
    const publishRes = await fetch(
      `${GRAPH_BASE}/${businessAccountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: carouselData.id,
          access_token: accessToken,
        }),
      }
    )
    const publishData = (await publishRes.json()) as {
      id?: string
      error?: { message: string }
    }
    if (!publishRes.ok || !publishData.id) {
      return {
        success: false,
        error: publishData.error?.message || '캐러셀 게시 실패',
      }
    }

    return { success: true, mediaId: publishData.id }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '알 수 없는 오류',
    }
  }
}

type DraftForPublish = {
  type: string // 'TEXT' | 'CAROUSEL'
  content?: string | null
  slides?: string | null
  title?: string | null
}

export async function publishDraft(params: {
  accessToken: string
  businessAccountId: string
  draft: DraftForPublish
}): Promise<PublishResult> {
  const { accessToken, businessAccountId, draft } = params

  if (draft.type === 'CAROUSEL' && draft.slides) {
    const slides = JSON.parse(draft.slides) as Array<{
      title?: string
      body?: string
      imageUrl?: string
    }>
    const validSlides = slides.filter((s) => s.imageUrl)
    if (validSlides.length < 2) {
      return {
        success: false,
        error: '이미지가 있는 슬라이드가 2개 이상 필요합니다.',
      }
    }
    const caption = slides
      .map((s) => [s.title, s.body].filter(Boolean).join('\n'))
      .join('\n\n')
    return publishCarousel({
      accessToken,
      businessAccountId,
      slides: validSlides.map((s) => ({ imageUrl: s.imageUrl! })),
      caption: caption.slice(0, 2200), // Instagram caption limit
    })
  }

  // TEXT type: need at least one image
  // Try to find an image from slides if available
  let imageUrl = ''
  if (draft.slides) {
    try {
      const slides = JSON.parse(draft.slides) as Array<{ imageUrl?: string }>
      imageUrl = slides.find((s) => s.imageUrl)?.imageUrl || ''
    } catch {
      /* ignore parse errors */
    }
  }

  if (!imageUrl) {
    return {
      success: false,
      error:
        'Instagram에 게시하려면 이미지가 필요합니다. 콘텐츠에 이미지를 추가해 주세요.',
    }
  }

  const caption = [draft.title, draft.content].filter(Boolean).join('\n\n')
  return publishSingleImage({
    accessToken,
    businessAccountId,
    imageUrl,
    caption: caption.slice(0, 2200),
  })
}
