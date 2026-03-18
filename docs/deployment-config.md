# Garnet 배포 설정 가이드

## 환경변수 설정

배포 시 사용자가 직접 입력하지 않도록 아래 환경변수를 설정하세요:

### 필수
- `NEXT_PUBLIC_META_APP_ID` — Meta 개발자 앱 ID
- `NEXT_PUBLIC_META_APP_SECRET` — Meta 앱 시크릿
- `GEMINI_API_KEY` — Google Gemini API 키 (이미지 생성 + LLM)

### 선택
- `NEXT_PUBLIC_META_REDIRECT_URI` — OAuth 리다이렉트 URI (기본: `{origin}/meta/connect`)
- `INSTAGRAM_ACCESS_TOKEN` — 서버 사이드 폴백 토큰
- `INSTAGRAM_BUSINESS_ACCOUNT_ID` — 서버 사이드 폴백 계정 ID

### 설정 방법

#### 로컬 개발
`.env` 파일에 추가:
```
NEXT_PUBLIC_META_APP_ID=1481016583739643
NEXT_PUBLIC_META_APP_SECRET=your_app_secret
GEMINI_API_KEY=your_gemini_key
```

#### Vercel/클라우드 배포
환경변수 설정 → 위 키 입력

### 사용자 경험

환경변수가 설정된 경우:
- App ID / App Secret이 자동으로 채워짐
- 사용자는 Instagram 로그인(OAuth) 버튼만 클릭
- 토큰은 자동 발급 + 자동 갱신

환경변수가 없는 경우:
- 사용자가 설정 페이지에서 직접 입력 (현재 방식)
