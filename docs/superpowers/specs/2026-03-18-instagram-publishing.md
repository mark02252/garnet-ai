# Instagram 실제 게시 구현 Design

**Goal:** 예약된 SNS 콘텐츠를 Instagram Graph API를 통해 실제로 발행한다. 현재 DB 상태만 변경하는 스텁을 실제 API 호출로 교체한다.

**Architecture:** `lib/sns/instagram-publisher.ts`에 발행 로직을 집중하고, `schedule/process` 라우트에서 호출한다. 이미지 URL은 Supabase 공개 URL을 그대로 사용한다.

**Tech Stack:** Instagram Graph API v19.0 · 기존 `lib/meta-connection-storage.ts` · Supabase Storage 공개 URL

---

## Instagram Graph API 발행 흐름

### 단일 이미지 게시 (TEXT 타입 — 캡션 + 대표 이미지)

```
1. POST /{ig-user-id}/media
   - image_url: Supabase 공개 URL
   - caption: 콘텐츠 텍스트
   → creation_id 반환

2. POST /{ig-user-id}/media_publish
   - creation_id: 위에서 받은 ID
   → 게시물 ID 반환
```

### 캐러셀 게시 (CAROUSEL 타입)

```
1. 각 슬라이드별:
   POST /{ig-user-id}/media
   - image_url: 슬라이드 imageUrl
   - is_carousel_item: true
   → child_id 반환 (슬라이드 수만큼 반복)

2. POST /{ig-user-id}/media
   - media_type: CAROUSEL
   - children: [child_id1, child_id2, ...]
   - caption: 첫 슬라이드 title + body 조합
   → creation_id 반환

3. POST /{ig-user-id}/media_publish
   - creation_id
   → 게시물 ID 반환
```

### 주의사항

- Instagram은 **텍스트만** 게시할 수 없음 — 반드시 이미지 필요
- `image_url`은 **공개 접근 가능한 HTTPS URL**이어야 함 (Supabase Storage 공개 URL 사용)
- Graph API v19.0 사용 (기존 analytics와 동일)
- 앱이 Development 모드면 본인 계정에만 게시 가능 (테스터 등록 필요 — 이미 완료)

---

## 변경 파일

| 파일 | 유형 | 내용 |
|------|------|------|
| `lib/sns/instagram-publisher.ts` | 신규 | 단일 이미지/캐러셀 발행 함수 |
| `app/api/sns/schedule/process/route.ts` | 수정 | 스텁 → 실제 발행 호출 |
| `app/api/sns/content/[id]/publish/route.ts` | 신규 | 즉시 발행 엔드포인트 |

---

## `lib/sns/instagram-publisher.ts` 함수 설계

```typescript
// 단일 이미지 게시
publishSingleImage(params: {
  accessToken: string;
  businessAccountId: string;
  imageUrl: string;
  caption: string;
}): Promise<{ success: boolean; mediaId?: string; error?: string }>

// 캐러셀 게시
publishCarousel(params: {
  accessToken: string;
  businessAccountId: string;
  slides: Array<{ imageUrl: string }>;
  caption: string;
}): Promise<{ success: boolean; mediaId?: string; error?: string }>

// 통합 발행 (draft 타입에 따라 자동 분기)
publishDraft(params: {
  accessToken: string;
  businessAccountId: string;
  draft: { type: 'TEXT' | 'CAROUSEL'; content?: string; slides?: string; title?: string };
}): Promise<{ success: boolean; mediaId?: string; error?: string }>
```

---

## `schedule/process` 수정 범위

현재:
```typescript
// TODO: Instagram Graph API 발행 연동
await prisma.snsScheduledPost.update({ ... status: 'PUBLISHED' })
```

변경 후:
```typescript
const result = await publishDraft({ accessToken, businessAccountId, draft })
if (result.success) {
  await prisma.snsScheduledPost.update({ ... status: 'PUBLISHED', publishedAt: new Date() })
} else {
  await prisma.snsScheduledPost.update({ ... status: 'FAILED', errorMsg: result.error })
}
```

accessToken과 businessAccountId는 서버에서 직접 읽을 수 없으므로(localStorage 기반), 호출자가 body로 전달하거나, 해당 페르소나의 instagramHandle로 연결된 계정 정보를 조회한다.

**채택:** process 엔드포인트 호출 시 body에 `accessToken`과 `businessAccountId`를 포함. Electron 백그라운드 타이머가 호출할 때 localStorage에서 읽어 전달.

---

## 즉시 발행 엔드포인트

`POST /api/sns/content/[id]/publish` — 스케줄 없이 바로 발행.

요청: `{ accessToken, businessAccountId }`
응답: `{ success, mediaId?, error? }`

내부: draft 조회 → publishDraft 호출 → 성공 시 status='PUBLISHED' + publishedAt 업데이트

---

## 에러 처리

- 이미지 URL 접근 불가 → "이미지를 불러올 수 없습니다. Supabase Storage 설정을 확인하세요."
- Graph API 권한 부족 → "instagram_content_publish 권한이 필요합니다."
- 토큰 만료 → "액세스 토큰이 만료되었습니다. 재연결이 필요합니다."
- 캐러셀 슬라이드 이미지 없음 → "모든 슬라이드에 이미지가 필요합니다."
- TEXT 타입인데 이미지 없음 → 첫 번째 슬라이드 이미지 사용하거나, 에러 반환
