# Self-Improve Dashboard Design

> Phase 5 자기 개선 기능들의 전용 UI 페이지

**Date:** 2026-04-13
**Status:** Design

---

## Overview

`/self-improve` 전용 페이지를 신설하여 Phase 5에서 구현한 3가지 자기 개선 기능을 시각화한다.

## Page Structure

### 상단 요약 카드 (4개)

| 카드 | 데이터 소스 |
|------|-----------|
| 총 교훈 / 원칙 승격 | KnowledgeEntry where source contains 'cycle_reflector' |
| 평균 예측 오차 | prediction-calibration.json의 errorHistory 평균 |
| 프롬프트 버전 수 | prompt-versions/ 디렉토리 파일 수 |
| 마지막 개선 일시 | changelog.jsonl 마지막 항목 |

### 탭 1: 사이클 교훈 (Cycle Lessons)

- KnowledgeEntry에서 `source contains 'cycle_reflector'` 필터
- 최신순 타임라인 리스트
- 각 항목: 도메인 뱃지, 패턴, 관찰 내용, 관찰 횟수, 신뢰도
- Level 2(Pattern)은 기본, Level 3(Principle)은 별도 하이라이트 + 배지
- 도메인별 필터 드롭다운

### 탭 2: 예측 보정 (Prediction Calibration)

- prediction-calibration.json 읽어서 시각화
- 목표별 카드: 현재 bias, 오차 히스토리(최근 10개) 바 차트
- bias 양수 = 과대추정(빨간), 음수 = 과소추정(파란), 0 근처 = 정확(초록)
- 마지막 예측 vs 실제 비교 표시

### 탭 3: 프롬프트 진화 (Prompt Evolution)

- prompt-versions/ 디렉토리의 버전 목록 (최신순)
- changelog.jsonl 파싱하여 변경 이유 + 날짜 타임라인
- 현재 활성 프롬프트 미리보기 (접기/펼치기)
- 롤백 버튼 (API 호출 → prompt-manager.rollbackPrompt)

## Files

| 파일 | 작업 |
|------|------|
| `app/(domains)/self-improve/page.tsx` | **신규** — 서버 컴포넌트, 데이터 페칭 |
| `app/(domains)/self-improve/client.tsx` | **신규** — 클라이언트 컴포넌트, 탭/필터/인터랙션 |
| `app/api/self-improve/route.ts` | **신규** — 보정 데이터 + 프롬프트 버전 API |
| `app/api/self-improve/rollback/route.ts` | **신규** — 프롬프트 롤백 API |

## Data Flow

- 탭 1: 서버 컴포넌트에서 Prisma 직접 쿼리 (SSR)
- 탭 2: API route에서 JSON 파일 읽어서 응답
- 탭 3: API route에서 파일시스템 읽어서 응답 + 롤백 POST

## UI Pattern

기존 `/knowledge`, `/evolution` 페이지와 동일한 패턴:
- 다크 테마, 카드 기반 레이아웃
- TailwindCSS 유틸리티
- 탭은 클라이언트 state로 관리
