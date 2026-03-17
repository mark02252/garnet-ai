# Instagram 연동 설정 마법사 Design

**Goal:** Meta 개발자 앱 설정을 앱 안에서 단계별로 안내하여, 최초 1회 셋업 후 이후 Instagram 연동은 버튼 하나로 완료되게 한다.

**Architecture:** 기존 OAuth 흐름(meta-connection.ts)은 그대로 유지. UX 레이어만 개선 — 개발자 설정 마법사를 `/settings` 안에 인라인으로 추가하고, 완료 후에는 마법사를 숨기고 "연결 완료" 상태만 표시.

**Tech Stack:** Next.js 15.2 App Router · 기존 `lib/meta-connection-storage.ts` · `lib/secure-json-store.ts` · 기존 OAuth 팝업 플로우 · BroadcastChannel

---

## 배경 및 현재 문제

현재 Instagram 연동은 사용자가 직접 Meta App ID, App Secret, Redirect URI를 알고 입력해야 한다. Meta 개발자 계정과 앱 생성 경험이 없으면 어디서 이 값들을 가져오는지 전혀 알 수 없다.

사용자 조건:
- Instagram 비즈니스/크리에이터 계정 보유 ✅
- Meta 개발자 계정은 신규 생성 필요
- 한 번 설정하면 이후 재설정 불필요

---

## 설계 결정

### 1. 설정 마법사 위치

`/settings` 페이지 내 인라인. 별도 페이지가 아닌 이유:
- 이미 settings에 `MetaConnectionPanel`이 있음
- 마법사 완료 후 바로 같은 페이지에서 연결 상태 확인 가능

### 2. 연결 모드

마법사는 **`instagram_login` 모드만** 대상으로 한다.
- `instagram_login`: Instagram Professional 계정 직접 연결, 범용적
- `meta_business`: Facebook 페이지 기반 다중 자산 관리 — 고급 사용자용, 기존 수동 입력 방식 유지

마법사 완료 시 `loginMode: 'instagram_login'`을 자동으로 저장한다.

### 3. 마법사 5단계

| 단계 | 제목 | 핵심 액션 |
|------|------|---------|
| 1 | Meta 개발자 계정 만들기 | `developers.facebook.com` 열기 버튼 |
| 2 | Business 앱 만들기 | 앱 유형 "Business" 선택 위치 안내 |
| 3 | Instagram 제품 추가 | 앱 대시보드 → 제품 추가 위치 안내 |
| 4 | App ID / App Secret 입력 | 직접 붙여넣기 input 2개 + Redirect URI 표시 |
| 5 | 연결 테스트 | OAuth 팝업 실행 → 성공 감지 → 저장 |

각 단계: 설명 텍스트 + 외부 링크 버튼 + "다음"/"이전" 내비게이션.

**Step 4 Redirect URI 처리:**
- Garnet이 자동으로 올바른 URI를 표시한다: 개발 시 `http://localhost:3000/meta/connect`, Electron 빌드 시 `process.env.NEXT_PUBLIC_REDIRECT_URI || window.location.origin + '/meta/connect'`
- 사용자는 이 URI를 Meta 콘솔 → Instagram → OAuth 설정에 그대로 붙여넣기
- 입력 필드가 아니라 **복사 버튼이 있는 읽기 전용 표시**

### 4. `isConfigured` 판단 기준

별도 필드를 추가하지 않는다. **`Boolean(draft.appId && draft.appSecret)`** 로 도출한다.
- `MetaConnectionDraft` 타입 변경 없음
- `lib/meta-connection.ts` 변경 없음

### 5. Step 5 성공 감지

기존 `BroadcastChannel('instagram-connect')` 이벤트를 마법사에서 직접 구독한다.

```
마법사 컴포넌트 mount 시:
  const ch = new BroadcastChannel('instagram-connect')
  ch.onmessage = (e) => {
    if (e.data?.type === 'instagram-connection-complete') {
      저장() → 마법사 완료 상태로 전환
    }
    if (e.data?.type === 'instagram-connection-error') {
      에러 표시 → Step 4로 되돌아가기
    }
  }
```

기존 팝업 플로우(meta/connect 페이지)가 이미 이 메시지를 broadcast하고 있으므로 추가 변경 없음.

### 6. 완료 후 상태

`Boolean(appId && appSecret)` === true 인 경우:
- 마법사 UI 완전히 숨김
- "✅ Meta 앱 설정됨" 상태 칩만 표시
- App ID / App Secret 값 UI에 노출하지 않음 (보안)
- "다시 설정" 링크 → 클릭 시 `appId`, `appSecret`, `loginMode`, `connectedAccounts`, `accessToken` 전부 초기화 → 마법사 Step 1로 돌아감

### 7. 페르소나 연동 버튼

`app/sns/personas/[id]/page.tsx` 및 `app/sns/personas/new/page.tsx` 에서:

```
셋업 미완료: "Instagram 연동 설정이 필요합니다 →" 링크 → /settings
셋업 완료:   [ Instagram 계정 연결 ] 버튼 → OAuth 팝업 → 계정 선택 → 페르소나에 instagramHandle 저장
```

---

## 변경 파일

| 파일 | 변경 내용 |
|------|---------|
| `components/meta-connection-panel.tsx` | 마법사 5단계 UI 추가, 완료 후 간소화 뷰, BroadcastChannel 구독 |
| `app/settings/page.tsx` | 마법사 진입점 — MetaConnectionPanel에 `mode="wizard"` prop 또는 조건부 렌더 |
| `app/sns/personas/[id]/page.tsx` | "Instagram 연결" 버튼 추가 (셋업 상태 조건부) |
| `app/sns/personas/new/page.tsx` | 동일 |

새 파일 없음 — 기존 컴포넌트/라이브러리만 활용.

---

## 데이터 흐름

```
사용자 → 마법사 Step 4에서 App ID + Secret 입력
       → Step 5에서 OAuth 팝업 열림 (기존 흐름)
       → meta/connect 페이지에서 BroadcastChannel로 성공 이벤트 발송
       → 마법사가 이벤트 수신 → appId, appSecret, loginMode 저장
       → 마법사 완료 뷰로 전환
       → 이후 페르소나 페이지에서 "Instagram 연결" 버튼 표시
       → 클릭 → 기존 OAuth 팝업 플로우 (변경 없음)
       → 토큰 + 계정 정보 저장 (기존 로직 그대로)
```

---

## 오류 처리

- Step 4 → Step 5 진입 시 App ID/Secret 빈값·공백 검증
- Step 5 OAuth 실패 → "앱 설정을 다시 확인해 주세요" + Step 4로 돌아가기
- Redirect URI 불일치 오류 → 등록해야 할 정확한 URI를 강조 표시하고 복사 버튼 제공
- BroadcastChannel 미지원 브라우저 → `window.addEventListener('message')` 폴백

---

## 구현 시 주의사항

**BroadcastChannel 정리:** 마법사 컴포넌트 unmount 시 반드시 `ch.close()` 호출. useEffect cleanup에 포함.

**Step 4 값 보존:** OAuth 실패로 Step 4로 돌아갈 때 appId, appSecret 입력값은 유지. 사용자가 재입력하지 않아도 됨.

**Electron Redirect URI:** Electron 빌드에서도 Next.js standalone 서버가 `http://127.0.0.1:{PORT}`로 로컬 HTTP 서버를 실행하므로 `window.location.origin`은 유효한 HTTP URL이 된다 (예: `http://127.0.0.1:3123`). 따라서 `window.location.origin + '/meta/connect'`는 Meta OAuth에 유효한 Redirect URI로 사용 가능. `NEXT_PUBLIC_REDIRECT_URI` 환경변수는 커스텀 포트를 사용할 때만 오버라이드.

---

## 비고

- Meta 개발자 앱은 "Development" 모드로 자신의 계정에 대해 앱 심사 없이 작동
- Step 3에서 추가해야 하는 Instagram 제품: "Instagram" (Instagram Login for Business)
- 기존 `INSTAGRAM_LOGIN_SCOPES`에 필요한 스코프 모두 포함돼 있음 (`instagram_basic`, `instagram_manage_insights`, `instagram_manage_comments`, `instagram_content_publish` 등)
