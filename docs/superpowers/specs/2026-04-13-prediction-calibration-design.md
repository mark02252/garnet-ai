# Phase 5-2: Prediction Model Self-Calibration

> Goal Predictor의 예측 정확도를 자동으로 보정

**Date:** 2026-04-13
**Status:** Design
**Depends on:** Phase 3 Goal Predictor

---

## Problem

현재 Goal Predictor는 단순 선형 회귀로 예측하지만, 예측 오차를 기록하거나 보정하지 않는다. 반복적으로 과대/과소 추정해도 같은 방식으로 계속 예측한다.

## Solution

매 routine-cycle에서 이전 예측과 실제값을 비교하여 오차를 기록하고, 목표별 보정 계수(bias)를 자동 조정하여 다음 예측에 반영한다.

## Architecture

```
routine-cycle:
  predictGoals() 호출
    → 보정 데이터 로드 (.garnet-config/prediction-calibration.json)
    → 이전 예측 vs 현재 실제 비교 → 오차 기록
    → 지수이동평균으로 bias 갱신
    → 예측값에 bias 적용
    → 보정 데이터 저장
```

## Storage: `.garnet-config/prediction-calibration.json`

DB 마이그레이션 없이 파일 기반 저장:

```json
{
  "goals": {
    "웹 트래픽 성장": {
      "bias": 2.5,
      "lastPredicted": 95,
      "lastActual": 92,
      "errorHistory": [3, -1, 2, 5, 1],
      "updatedAt": "2026-04-13T08:00:00Z"
    }
  }
}
```

- `bias`: 예측값에서 빼야 할 보정값 (양수 = 과대추정 경향)
- `errorHistory`: 최근 10개 오차 (predicted - actual)
- 지수이동평균 alpha = 0.3 (최근 값에 더 큰 가중치)

## Module: `lib/agent-loop/prediction-calibrator.ts`

### Functions

1. `loadCalibration()` — JSON 파일 로드
2. `saveCalibration()` — JSON 파일 저장
3. `recordAndCalibrate(goalName, predicted, actual)` — 오차 기록 + bias 갱신
4. `getCalibratedBias(goalName)` — 현재 bias 조회

### Bias 계산 (지수이동평균)

```
error = predicted - actual
newBias = alpha * error + (1 - alpha) * oldBias
alpha = 0.3
```

## Integration into goal-predictor.ts

`predictGoals()` 함수에서:
1. 예측값 계산 후 `getCalibratedBias(goalName)`으로 bias 조회
2. `calibratedPrediction = rawPrediction - bias`
3. 이전 예측값과 현재 실제값으로 `recordAndCalibrate()` 호출

## Files

| 파일 | 작업 |
|------|------|
| `lib/agent-loop/prediction-calibrator.ts` | **신규** — 보정 로직 |
| `lib/agent-loop/goal-predictor.ts` | **수정** — 보정 적용 |

## Cost

- LLM 호출 없음 (순수 수학)
- 파일 I/O 1회/사이클
- 메모리/CPU 무시 가능
