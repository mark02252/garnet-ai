// Scheduler init은 API 라우트에서 lazy init 방식으로 처리
// (Edge runtime에서 Node.js 전용 모듈 로드 이슈로 instrumentation 사용 불가)
export async function register() {
  // no-op
}
