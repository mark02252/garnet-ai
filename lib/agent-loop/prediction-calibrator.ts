import * as fs from 'fs'
import * as path from 'path'

type GoalCalibration = {
  bias: number
  lastPredicted: number | null
  lastActual: number | null
  errorHistory: number[]
  updatedAt: string
}

type CalibrationData = {
  goals: Record<string, GoalCalibration>
}

const CALIBRATION_PATH = path.join(process.cwd(), '.garnet-config', 'prediction-calibration.json')
const ALPHA = 0.3           // 지수이동평균 가중치 (최근 값에 더 큰 가중)
const MAX_HISTORY = 10      // 오차 이력 최대 보관

function loadCalibration(): CalibrationData {
  try {
    if (fs.existsSync(CALIBRATION_PATH)) {
      return JSON.parse(fs.readFileSync(CALIBRATION_PATH, 'utf-8'))
    }
  } catch { /* corrupted file */ }
  return { goals: {} }
}

function saveCalibration(data: CalibrationData): void {
  try {
    fs.writeFileSync(CALIBRATION_PATH, JSON.stringify(data, null, 2), 'utf-8')
  } catch { /* write failure — non-critical */ }
}

/**
 * 이전 예측과 현재 실제값을 비교하여 오차 기록 + bias 갱신
 */
export function recordAndCalibrate(goalName: string, currentActual: number): void {
  const data = loadCalibration()
  const goal = data.goals[goalName]

  if (!goal || goal.lastPredicted === null) {
    // 첫 사이클 — 기록만 하고 보정 없음
    if (!data.goals[goalName]) {
      data.goals[goalName] = {
        bias: 0,
        lastPredicted: null,
        lastActual: currentActual,
        errorHistory: [],
        updatedAt: new Date().toISOString(),
      }
    } else {
      data.goals[goalName].lastActual = currentActual
      data.goals[goalName].updatedAt = new Date().toISOString()
    }
    saveCalibration(data)
    return
  }

  // 오차 계산: 예측 - 실제 (양수 = 과대추정)
  const error = goal.lastPredicted - currentActual

  // 오차 이력 업데이트
  goal.errorHistory.push(error)
  if (goal.errorHistory.length > MAX_HISTORY) {
    goal.errorHistory = goal.errorHistory.slice(-MAX_HISTORY)
  }

  // 지수이동평균으로 bias 갱신
  goal.bias = ALPHA * error + (1 - ALPHA) * goal.bias

  goal.lastActual = currentActual
  goal.updatedAt = new Date().toISOString()

  saveCalibration(data)
}

/**
 * 현재 보정 bias 조회
 */
export function getCalibratedBias(goalName: string): number {
  const data = loadCalibration()
  return data.goals[goalName]?.bias ?? 0
}

/**
 * 예측값을 기록 (다음 사이클에서 실제값과 비교하기 위해)
 */
export function recordPrediction(goalName: string, predicted: number): void {
  const data = loadCalibration()
  if (!data.goals[goalName]) {
    data.goals[goalName] = {
      bias: 0,
      lastPredicted: predicted,
      lastActual: null,
      errorHistory: [],
      updatedAt: new Date().toISOString(),
    }
  } else {
    data.goals[goalName].lastPredicted = predicted
    data.goals[goalName].updatedAt = new Date().toISOString()
  }
  saveCalibration(data)
}
