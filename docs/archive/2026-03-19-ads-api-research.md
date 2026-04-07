# Meta Marketing API 연동 조사 결과

> 작성일: 2026-03-19 | 상태: 향후 개발 예정 (Facebook Login 해결 후)

---

## API 구조

```
Campaign (캠페인)
  POST /act_{ad_account_id}/campaigns
  필수: name, objective, special_ad_categories
  목표: REACH, OUTCOME_ENGAGEMENT, OUTCOME_TRAFFIC 등

  └── Ad Set (광고 세트)
      POST /act_{ad_account_id}/adsets
      필수: name, campaign_id, targeting, billing_event, bid_amount
      설정: 타겟(연령/지역/관심사), 예산(일일/총), 기간

      └── Ad (광고)
          POST /act_{ad_account_id}/ads
          필수: name, adset_id, creative, status
```

## 기존 Instagram 게시물 부스트 방법

```
POST /act_{AD_ACCOUNT_ID}/adcreatives
  source_instagram_media_id: {게시물 ID}
  instagram_user_id: {Instagram 계정 ID}
  name: "Boosted Post"
```

## 필수 조건

- 활성 광고 계정 (act_{id})
- Facebook User Token 또는 System User Token
- `ads_management` + `ads_read` 권한
- **Instagram Login 토큰으로는 불가 — Facebook Login 필수**

## 구현 계획 (Facebook Login 해결 후)

1. 광고 계정 연결 (act_ ID 가져오기)
2. "이 게시물 부스트" — 게시물 상세에서 원클릭 부스트
3. 간편 캠페인 생성 (목표 선택 → 타겟 → 예산 → 실행)
4. 광고 성과 대시보드 (도달, 클릭, 비용, ROAS)
5. AI 광고 예산 최적화 제안 연동
