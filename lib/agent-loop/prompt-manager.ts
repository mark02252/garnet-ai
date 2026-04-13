import * as fs from 'fs'
import * as path from 'path'

const PROMPTS_DIR = path.join(process.cwd(), '.garnet-config', 'prompt-versions')
const ACTIVE_FILE = path.join(PROMPTS_DIR, 'reasoner-active.txt')

const DEFAULT_PROMPT = `당신은 Garnet의 추론 엔진입니다. 비즈니스 전략, 마케팅, 데이터 분석, 경쟁 정보, 운영 등 다영역에 걸쳐 현재 상황을 분석하고 최적의 액션을 결정합니다. 활성화된 역할에 따라 판단 범위가 확장됩니다.

규칙:
1. 반드시 JSON만 출력하세요. 코드블록(\`\`\`)으로 감싸지 마세요.
2. **반드시 1개 이상의 액션을 제안하세요.** 아무리 상황이 어려워도 할 수 있는 것이 있습니다.
3. 각 액션의 riskLevel은 반드시 LOW, MEDIUM, HIGH 중 하나입니다.
4. LOW: 데이터 분석, 리포트 생성, 내부 메모리 갱신 등
5. MEDIUM: 콘텐츠 발행, 외부 API 호출, Flow 실행 등
6. HIGH: 예산 변경, 캠페인 중단, 대량 발행 등
7. 이전에 제안한 것과 같은 제목은 피하되, 같은 방향이라도 더 구체적인 실행안이면 제안하세요.
8. 데이터가 부족하면 "데이터 수집"이 아니라, 부족한 데이터를 채우기 위한 구체적 방법을 제안하세요.

출력 형식:
{
  "situationSummary": "현재 상황 1-2문장 요약",
  "actions": [
    {
      "kind": "report_generation | playbook_update | content_publish | budget_adjust | flow_trigger | alert",
      "title": "액션 제목",
      "rationale": "근거",
      "expectedEffect": "예상 효과",
      "riskLevel": "LOW | MEDIUM | HIGH",
      "goalAlignment": "기여하는 전략 목표",
      "payload": {}
    }
  ],
  "noActionReason": "액션 불필요 시 이유"
}`

/**
 * 현재 활성 Reasoner 시스템 프롬프트를 로드
 * 파일이 없으면 기본값 사용 + 파일 생성
 */
export function loadReasonerPrompt(): string {
  try {
    if (fs.existsSync(ACTIVE_FILE)) {
      const content = fs.readFileSync(ACTIVE_FILE, 'utf-8').trim()
      if (content.length > 50) return content
    }
  } catch { /* read failure */ }

  // 파일 없으면 기본값으로 초기화
  saveReasonerPrompt(DEFAULT_PROMPT, 'initial')
  return DEFAULT_PROMPT
}

/**
 * 새 프롬프트를 저장하고 이전 버전을 백업
 */
export function saveReasonerPrompt(prompt: string, reason: string): void {
  try {
    if (!fs.existsSync(PROMPTS_DIR)) {
      fs.mkdirSync(PROMPTS_DIR, { recursive: true })
    }

    // 현재 활성 프롬프트가 있으면 백업
    if (fs.existsSync(ACTIVE_FILE)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const backupPath = path.join(PROMPTS_DIR, `reasoner-${timestamp}.txt`)
      fs.copyFileSync(ACTIVE_FILE, backupPath)
    }

    fs.writeFileSync(ACTIVE_FILE, prompt, 'utf-8')

    // 변경 로그 기록
    const logPath = path.join(PROMPTS_DIR, 'changelog.jsonl')
    const logEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      reason,
      promptLength: prompt.length,
    })
    fs.appendFileSync(logPath, logEntry + '\n', 'utf-8')
  } catch { /* write failure — non-critical */ }
}

/**
 * 버전 목록 조회
 */
export function listPromptVersions(): Array<{ filename: string; date: string }> {
  try {
    const files = fs.readdirSync(PROMPTS_DIR)
      .filter(f => f.startsWith('reasoner-') && f !== 'reasoner-active.txt')
      .sort()
      .reverse()
    return files.map(f => ({
      filename: f,
      date: f.replace('reasoner-', '').replace('.txt', '').replace(/-/g, ':').slice(0, 19),
    }))
  } catch {
    return []
  }
}

/**
 * 특정 버전으로 롤백
 */
export function rollbackPrompt(filename: string): boolean {
  try {
    const versionPath = path.join(PROMPTS_DIR, filename)
    if (!fs.existsSync(versionPath)) return false
    const content = fs.readFileSync(versionPath, 'utf-8')
    saveReasonerPrompt(content, `rollback to ${filename}`)
    return true
  } catch {
    return false
  }
}
