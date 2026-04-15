import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

const CONFIG_DIR = path.join(process.cwd(), '.garnet-config')
const CALIBRATION_PATH = path.join(CONFIG_DIR, 'prediction-calibration.json')
const PROMPTS_DIR = path.join(CONFIG_DIR, 'prompt-versions')
const CHANGELOG_PATH = path.join(PROMPTS_DIR, 'changelog.jsonl')
const ACTIVE_PROMPT_PATH = path.join(PROMPTS_DIR, 'reasoner-active.txt')

export async function GET() {
  try {
    // 1. Prediction Calibration
    let calibration = { goals: {} as Record<string, unknown> }
    try {
      if (fs.existsSync(CALIBRATION_PATH)) {
        calibration = JSON.parse(fs.readFileSync(CALIBRATION_PATH, 'utf-8'))
      }
    } catch { /* */ }

    // 2. Prompt versions
    let promptVersions: Array<{ filename: string; date: string }> = []
    let changelog: Array<{ timestamp: string; reason: string; promptLength: number }> = []
    let activePrompt = ''
    try {
      if (fs.existsSync(PROMPTS_DIR)) {
        promptVersions = fs.readdirSync(PROMPTS_DIR)
          .filter(f => f.startsWith('reasoner-') && f !== 'reasoner-active.txt')
          .sort()
          .reverse()
          .map(f => ({ filename: f, date: f.replace('reasoner-', '').replace('.txt', '') }))
      }
      if (fs.existsSync(CHANGELOG_PATH)) {
        changelog = fs.readFileSync(CHANGELOG_PATH, 'utf-8')
          .trim()
          .split('\n')
          .filter(Boolean)
          .map(line => { try { return JSON.parse(line) } catch { return null } })
          .filter(Boolean)
          .reverse()
      }
      if (fs.existsSync(ACTIVE_PROMPT_PATH)) {
        activePrompt = fs.readFileSync(ACTIVE_PROMPT_PATH, 'utf-8')
      }
    } catch { /* */ }

    // Sub-Reasoner 최근 결과
    let subReasoners: unknown = null
    try {
      const { getLatestSubReasonerResults } = await import('@/lib/agent-loop/sub-reasoners')
      subReasoners = getLatestSubReasonerResults()
    } catch { /* */ }

    return NextResponse.json({
      calibration,
      promptVersions,
      changelog,
      activePrompt,
      activePromptLength: activePrompt.length,
      subReasoners,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
