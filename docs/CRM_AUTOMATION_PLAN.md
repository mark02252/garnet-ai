# Garnet CRM 자동화 설계 문서

> 앱 출시 후 구현 예정. GA4 학습 데이터 기반 CRM 자동화.

## 원칙

```
학습은 자동, 실행은 confidence 기반 단계적 자동화

confidence 0.8 이상 → 자동 발송 (Governor LOW 리스크)
confidence 0.6~0.8 → 사람 확인 후 발송 (Governor MEDIUM)
confidence 0.6 미만 → 제안만 (Governor HIGH)
```

---

## 전제 조건 (앱 출시 후 확인)

```
□ Firebase 프로젝트(monoplex-489801) → GA4(311669926) 연결 완료
□ iOS/Android 데이터 스트림 생성 확인
□ Firebase Cloud Messaging(FCM) 설정 완료
□ Firebase setUserId() 호출 → 웹↔앱 유저 통합
□ User Property 등록:
  - preferred_theater: 선호 극장
  - preferred_region: 선호 지역
  - total_purchases: 누적 구매 수
□ 앱 이벤트 파라미터 웹과 동일하게 전송 확인
```

---

## CRM 액션 타입

### 1. 이탈 리타겟팅 (cart_abandonment)

```
트리거: add_shipping_info 발생 후 1시간 내 purchase 미발생
대상: 좌석 선택까지 갔다가 이탈한 유저
채널: 앱 푸시

메시지 예시:
  "선택하신 [극장명] [영화명] 좌석이 곧 마감됩니다"

학습 연동:
  GA4 패턴 "좌석선택 후 이탈 유저 72%가 24시간 내 재방문"
  → confidence 0.8 이상이면 자동 발송
  → 발송 후 purchase 전환율 측정 → auto-learner 검증

구현:
  - Governor에 kind: 'crm_push_cart_abandonment' 추가
  - FCM 토픽 또는 개인 토큰으로 발송
  - 발송 기록 → PendingOutcome으로 효과 측정
```

### 2. 선호 극장 신작 알림 (new_movie_alert)

```
트리거: preferred_theater에 새 영화 스케줄 등록 시
대상: 해당 극장을 선호 극장으로 설정한 유저
채널: 앱 푸시

메시지 예시:
  "JSW씨네라운지에 새 영화 [영화명]이 등록됐어요"

학습 연동:
  GA4 패턴 "신작 알림 후 24시간 내 예매율 15%"
  → confidence 축적 → 알림 타이밍/문구 자동 최적화

구현:
  - 스케줄 등록 감지 (DB 폴링 또는 웹훅)
  - preferred_theater 매칭 유저 세그먼트
  - FCM 토픽: theater_{코드} 구독 기반
```

### 3. 재방문 유도 (re_engagement)

```
트리거: 마지막 방문 후 7일 미접속
대상: 1회 이상 purchase 이력 유저
채널: 앱 푸시

메시지 예시:
  "이번 주 [선호극장] 인기 영화를 확인해보세요"

학습 연동:
  GA4 패턴 "7일 미접속 유저 리텐션 푸시 → 재방문율 12%"
  → 최적 재방문 유도 시점 자동 학습 (7일 vs 5일 vs 10일)

구현:
  - Firebase User Property: last_active 기반
  - 일 배치로 대상 유저 추출
  - Governor MEDIUM → 초기엔 사람 확인, 효과 검증 후 자동화
```

### 4. 비회원 → 회원 전환 (member_conversion)

```
트리거: 비회원 예매 3회 이상
대상: /booking/non-user-orders 반복 방문 유저
채널: 예매 완료 화면 팝업 + 앱 설치 유도

메시지 예시:
  "회원가입하면 다음 예매 3,000원 할인"

학습 연동:
  GA4 패턴 "비회원 3회+ 유저 회원 전환 시 LTV 2배"
  → 최적 전환 시점/혜택 자동 학습

구현:
  - 비회원 주문 횟수 카운트 (phone 기반)
  - 3회차 예매 시 팝업 트리거
  - 회원 전환 후 purchase 추적
```

### 5. 무료관람 → 유료 전환 (free_to_paid)

```
트리거: 무료 관람(소피텔 등) 완료 후 3일
대상: 무료 관람만 한 유저 (유료 purchase 이력 없음)
채널: 앱 푸시

메시지 예시:
  "프라이빗 시네마가 마음에 드셨나요?
   다른 지점에서도 특별한 영화를 만나보세요"

학습 연동:
  GA4 패턴 "무료관람 유저의 15%가 2주 내 유료 예매"
  → 최적 전환 메시지/타이밍 학습

구현:
  - 소피텔 유입 + purchase(value=0) 유저 세그먼트
  - 3일 후 다른 지점 추천 푸시
  - 유료 전환 추적
```

### 6. 관람 후 리뷰 유도 (post_viewing_review)

```
트리거: 상영일 다음날 오전 10시
대상: 해당 날짜 purchase 유저
채널: 앱 푸시

메시지 예시:
  "[영화명] 어떠셨나요? 리뷰 남기고 쿠폰 받기"

학습 연동:
  GA4 패턴 "리뷰 작성 유저 재예매율 35% vs 미작성 18%"
  → 리뷰 유도 메시지 최적화

구현:
  - purchase 이벤트의 date 파라미터로 상영일 파악
  - 상영일+1 오전 배치
  - 리뷰 작성 이벤트 추적 → 재예매 전환 측정
```

### 7. 요일/시간 맞춤 프로모션 (time_based_promo)

```
트리거: GA4 학습에서 특정 요일 매출 저조 패턴 감지
대상: 해당 요일 예매 가능 유저
채널: 앱 푸시 + 인앱 배너

메시지 예시:
  "화요일 특가! [극장명] 영화 20% 할인"

학습 연동:
  GA4 패턴 "화요일 매출 최저(91만) vs 금요일(361만)"
  → 할인율/메시지 효과 자동 측정
  → confidence 높아지면 매주 자동 발송

구현:
  - ga4-insight-extractor 요일 패턴 → 자동 트리거
  - Governor LOW (검증된 패턴) → 자동 발송
  - 프로모션 코드 생성 → 사용률 추적
```

---

## 발송 제한 규칙 (Fatigue Control)

```
핵심 원칙: 유저가 "또 왔네" 하는 순간 실패

1. 유저당 발송 한도
   - 하루 최대 1건
   - 주간 최대 3건
   - 월간 최대 8건
   - 한도 초과 시 우선순위 높은 것만 발송, 나머지 큐에 대기

2. 우선순위 (높은 순)
   ① cart_abandonment — 이탈 직후, 타이밍이 생명
   ② new_movie_alert — 유저가 직접 설정한 관심사
   ③ post_viewing_review — 관람 직후 자연스러운 맥락
   ④ re_engagement — 이미 이탈 중이라 리스크 낮음
   ⑤ time_based_promo — 프로모션성
   ⑥ free_to_paid — 전환 유도
   ⑦ member_conversion — 가입 유도

   같은 날 cart_abandonment와 time_based_promo가 겹치면
   cart_abandonment만 발송

3. 쿨다운
   - 같은 종류 메시지: 최소 72시간 간격
   - 프로모션성 메시지: 주 1회 한도
   - 유저가 푸시 무시 3회 연속 시: 2주간 발송 중단

4. 시간대 제한
   - 발송 가능: 09:00 ~ 21:00
   - 금지: 21:00 ~ 09:00 (야간 푸시 금지)
   - 유저 타임존 기준

5. 자동 학습 연동
   - 푸시 오픈율이 5% 미만인 메시지 유형 → 자동 중단
   - 푸시 후 앱 삭제율 증가 감지 → 해당 유형 즉시 중단
   - 오픈율 높은 시간대/요일 학습 → 발송 타이밍 자동 최적화

6. 유저 컨트롤
   - 앱 설정에서 알림 종류별 on/off
   - "예매 알림만 받기" / "프로모션 안 받기" 선택 가능
   - 수신 거부 시 해당 유형 즉시 중단 + 다시 보내지 않음
```

```typescript
// lib/crm/fatigue-control.ts (예정)

type FatigueCheck = {
  canSend: boolean
  reason?: string  // 차단 사유
  nextAvailable?: Date  // 다음 발송 가능 시점
}

async function checkFatigue(userId: string, actionKind: string): Promise<FatigueCheck> {
  // 1. 일일 한도 체크
  // 2. 주간 한도 체크
  // 3. 같은 종류 쿨다운 체크
  // 4. 연속 무시 체크
  // 5. 시간대 체크
  // 6. 유저 수신 설정 체크
}
```

## Governor 연동

```typescript
// lib/governor.ts에 CRM 액션 타입 추가

type CRMActionKind =
  | 'crm_push_cart_abandonment'
  | 'crm_push_new_movie'
  | 'crm_push_re_engagement'
  | 'crm_push_member_conversion'
  | 'crm_push_free_to_paid'
  | 'crm_push_review'
  | 'crm_push_time_promo'

// confidence 기반 리스크 레벨 자동 결정
function getCRMRiskLevel(confidence: number): GovernorRiskLevel {
  if (confidence >= 0.8) return 'LOW'      // 자동 발송
  if (confidence >= 0.6) return 'MEDIUM'   // 사람 확인
  return 'HIGH'                             // 제안만
}
```

---

## 효과 측정 (Auto-Learner 연동)

```
각 CRM 액션 발송 후:
1. PendingOutcome 생성 (발송 시점 지표 스냅샷)
2. 24~72시간 후 결과 측정:
   - 푸시 오픈율
   - 푸시 → 앱 오픈 → purchase 전환율
   - 해당 세그먼트 매출 변화
3. impactScore 계산 → Knowledge Store confidence 조정
4. 효과 있는 CRM 액션은 confidence 상승 → 자동 발송 전환
5. 효과 없는 CRM 액션은 confidence 하락 → 사람 확인으로 전환
```

---

## 단계적 이양 (사람 → Garnet)

```
Phase 0: 사람이 CRM 운영 (앱 출시 ~ 1개월)

  마케터가 직접:
  - 푸시 메시지 작성, 세그먼트 선택, 발송 시간 결정

  Garnet은 관찰만:
  - 모든 발송 로그 자동 수집 (메시지, 대상, 시간, 결과)
  - 오픈율, 전환율, 이탈률 패턴 축적
  - Knowledge Store에 학습만, 실행 안 함

  전환 조건: 발송 로그 50건 이상 축적 → Phase 1


Phase 1: Garnet이 제안 (1~2개월)

  마케터가 여전히 실행하지만,
  Garnet이 학습 데이터 기반으로 제안 시작:

  "지난 4주 데이터 기준:
   목요일 18시 JSW 유저 푸시 → 오픈율 15%, 전환 8%
   이번 주도 보내는 건 어떨까요?
   메시지 제안: '이번 주 JSW씨네라운지 금요일 신작 확인하기'"

  마케터가 👍/❌로 피드백 → 제안 정확도 학습

  전환 조건: 특정 패턴 confidence 0.8 이상 + 마케터 1회 승인 → Phase 2


Phase 2: 검증된 패턴만 자동 발송 (2~3개월)

  confidence 0.8 이상 패턴만 자동:
  - "목요일 18시 JSW 재방문 유저 푸시" → 4주 검증 → 자동 전환
  - 새로운 유형은 항상 Phase 1(제안)부터 시작

  전환 조건: 자동 발송 4주 연속 목표 전환율 유지 → Phase 3


Phase 3: 자기 최적화 (3개월~)

  자동 발송 패턴도 계속 측정:
  - 오픈율 하락 → 메시지 변형 제안
  - 시간대 변화 → 발송 시간 조정 제안
  - 새 세그먼트 발견 → Phase 1로 새 CRM 액션 제안

  사람은 새로운 제안 검토 + 예외 상황 판단만

  안전장치:
  - 어느 Phase에서든 마케터가 즉시 수동 전환 가능
  - 오픈율 5% 미만 → 자동 중단 + 마케터 알림
  - 앱 삭제율 증가 → 전체 자동 발송 일시 중지
```

```
CRM 발송 로그 (Garnet 관찰 데이터):

model CRMSendLog {
  id            String   @id @default(cuid())
  userId        String
  actionKind    String   // cart_abandonment, new_movie_alert 등
  segment       String   // 세그먼트명
  messageTitle  String
  messageBody   String
  sentAt        DateTime
  openedAt      DateTime?
  clickedAt     DateTime?
  convertedAt   DateTime?  // purchase 발생 시
  uninstalled   Boolean  @default(false)
  phase         String   // manual | suggested | auto
  confidence    Float?   // 발송 시점 패턴 confidence
  createdAt     DateTime @default(now())
}
```

---

## 데이터 수집 구조 (Firebase 연결만으로는 부족)

```
Garnet이 CRM 자동화를 위해 필요한 데이터와 수집 경로:

┌─────────────────────────────────────────────────┐
│ 1. GA4 Data API (이미 연결됨 ✅)                   │
│    - 퍼널 전환율, 채널별 ROI, 지점별 전환율           │
│    - 요일/시간 패턴, 신규 vs 재방문                   │
│    - 이벤트 기반 행동 데이터                         │
│    → Garnet이 "언제, 누구에게, 무슨 맥락에서"를 학습   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 2. Firebase Cloud Messaging (개발팀 연결 필요)      │
│    - 푸시 발송 기능                                │
│    - FCM 토큰 관리 (유저별 디바이스 토큰)             │
│    - 토픽 구독 (선호 극장별 그룹)                     │
│    → Garnet이 "보내는 행위" 자체                     │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 3. Firebase Analytics User Property (개발팀 세팅)   │
│    - preferred_theater: 선호 극장                  │
│    - preferred_region: 선호 지역                   │
│    - total_purchases: 누적 구매 수                  │
│    - last_purchase_date: 마지막 구매일               │
│    - membership_tier: 회원 등급                    │
│    → GA4 User Property로 전송되면                  │
│      Garnet이 "누구에게 보낼지" 세그먼트 판단          │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 4. 푸시 결과 이벤트 (개발팀 세팅)                    │
│    - push_received: 푸시 수신                     │
│    - push_opened: 푸시 클릭                       │
│    - push_dismissed: 푸시 무시                     │
│    → GA4 이벤트로 전송되면                          │
│      Garnet이 "효과 있었는지" 자동 측정              │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ 5. 자체 DB — CRM 발송 로그 (Garnet 서버)           │
│    - 어떤 메시지를, 누구에게, 언제 보냈는지            │
│    - 사람이 보냈는지 / Garnet이 보냈는지              │
│    - 발송 시점의 confidence                        │
│    → Phase 판단 + 효과 분석의 기준                   │
└─────────────────────────────────────────────────┘
```

```
정리:

Firebase만으로 되는 것:
  ✅ 푸시 발송 (FCM)
  ✅ 유저 속성 저장 (User Property)
  ✅ 앱 이벤트 → GA4 전송

Firebase만으로 안 되는 것 (추가 필요):
  □ 푸시 결과 이벤트 (push_opened 등) → 개발팀이 앱 코드에 추가
  □ User Property 세팅 (preferred_theater 등) → 개발팀이 앱 코드에 추가
  □ CRM 발송 로그 DB → Garnet 서버에 테이블 추가
  □ FCM 토큰 저장 API → 서버 엔드포인트 개발
```

---

## 개발팀 요청 사항 (CRM용)

```
앱 출시 시 또는 직후 필요한 세팅:

1. FCM 토큰 관리
   - 앱 실행 시 FCM 토큰 발급
   - 서버에 전송: POST /api/user/fcm-token { userId, token, platform }
   - 토큰 갱신 시 업데이트

2. User Property 설정 (Firebase Analytics)
   Analytics.setUserProperty("preferred_theater", "JSW씨네라운지")
   Analytics.setUserProperty("preferred_region", "서울")
   Analytics.setUserProperty("total_purchases", "5")
   Analytics.setUserProperty("last_purchase_date", "2026-05-04")

3. 토픽 구독 (FCM)
   선호 극장 선택 시:
   FirebaseMessaging.subscribeToTopic("theater_jsw")
   변경 시 이전 토픽 unsubscribe + 새 토픽 subscribe

4. 푸시 결과 이벤트 (Firebase Analytics)
   Analytics.logEvent("push_received", { message_id, action_kind })
   Analytics.logEvent("push_opened", { message_id, action_kind })
   Analytics.logEvent("push_dismissed", { message_id, action_kind })

5. 딥링크 처리
   푸시 클릭 시 payload의 link 값으로 화면 이동
   예: { "link": "/movie/booking?movieId=xxx" }
```

---

## 구현 순서

```
Phase 1 (앱 출시 직후):
  1. FCM 연결 + 푸시 발송 모듈
  2. cart_abandonment (가장 직접적인 매출 효과)
  3. new_movie_alert (유저 가치 높음)

Phase 2 (데이터 2주 축적 후):
  4. re_engagement (리텐션)
  5. post_viewing_review (리뷰 → 재방문)

Phase 3 (1개월 후, 패턴 검증 완료):
  6. free_to_paid (소피텔 등 제휴)
  7. time_based_promo (요일별 자동 프로모션)
  8. member_conversion (비회원 전환)
```

---

## 파일 구조 (예정)

```
lib/
  crm/
    crm-engine.ts          — CRM 액션 실행 엔진
    crm-triggers.ts        — 트리거 감지 (이벤트 기반)
    crm-segments.ts        — 유저 세그먼트 생성
    crm-messages.ts        — 메시지 템플릿 + 개인화
    fcm-sender.ts          — Firebase Cloud Messaging 발송
  agent-loop/
    crm-optimizer.ts       — Knowledge Store 기반 CRM 최적화
    (기존) auto-learner.ts — CRM 효과 측정 연동
    (기존) ga4-insight-extractor.ts — 트리거 패턴 감지
```

---

## 기대 효과

```
cart_abandonment:
  현재 좌석→결제 이탈 52% (주 658명)
  → 리타겟 전환 10% 가정 시 주 +66건, 월 +264건

new_movie_alert:
  재방문 전환율 6.9% → 알림 수신 유저 10% 가정 시
  월 +40건 추가 예매

time_based_promo:
  화요일 매출 91만 → 금요일 수준(361만)의 50%만 달성해도
  주 +18건, 월 +72건

합계 예상: 월 +370건 이상 추가 결제
```
