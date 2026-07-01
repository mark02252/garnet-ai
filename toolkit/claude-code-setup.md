# Claude Code 세팅 가이드

새 환경에서 현재와 동일한 Claude Code 분석 환경을 구축하는 가이드.

## 1. Claude Code 설치

```bash
# Claude Code CLI 설치
npm install -g @anthropic-ai/claude-code
```

## 2. 설정 파일

### ~/.claude/settings.json

```json
{
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "your_github_pat"
  },
  "enabledPlugins": {
    "superpowers@claude-plugins-official": true,
    "frontend-design@claude-plugins-official": true
  },
  "effortLevel": "xhigh"
}
```

### ~/.claude/.mcp.json (MCP 서버)

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    }
  }
}
```

MCP 서버 추가 가능:
- Notion: `@modelcontextprotocol/server-notion`
- Slack: `@modelcontextprotocol/server-slack`
- Google Drive: `@anthropic-ai/mcp-server-google-drive`
- Playwright: `@anthropic-ai/mcp-server-playwright`

## 3. 프로젝트별 CLAUDE.md

프로젝트 루트에 `CLAUDE.md` 파일을 생성하면 Claude Code가 자동으로 읽습니다.

```markdown
# Project Context

## 기술 스택
- Next.js / TypeScript
- GA4 / BigQuery / GTM
- Slack Webhook

## 주요 경로
- toolkit/lib/ — API 클라이언트
- toolkit/scripts/ — 분석 스크립트
- .env — 환경변수 (커밋 X)

## 컨벤션
- BQ 쿼리는 toolkit/lib/bq.ts의 query() 사용
- 슬랙 전송은 toolkit/lib/slack.ts의 sendToSlack() 사용
- 날짜는 YYYYMMDD 형식 (KST 기준)
```

## 4. 메모리 시스템

Claude Code는 `~/.claude/projects/[프로젝트경로]/memory/` 에 세션 간 메모리를 저장합니다.

### MEMORY.md (자동 로드)

```markdown
# Memory Index

- [GA4/GTM 현황](./ga4_status.md)
- [사용자 프로필](./user_role.md)
- [분석 히스토리](./analysis_history.md)
```

메모리는 자동 생성되지만, 초기에 핵심 컨텍스트를 미리 작성해두면 좋습니다.

## 5. 주요 사용 패턴

### 데이터 분석

```bash
# Claude Code 실행
claude

# 분석 요청 예시
> #bq체크
> #헬스체크
> 6월 전체 분석 진행해
> 퍼널 이탈 분석해봐
> 슬랙으로 보내
```

### GTM 관리

```bash
> GTM 현재 태그 목록 확인해봐
> content_group 변수 업데이트해
> referral exclusion 추가해
> v34로 배포해
```

### GA4 Admin

```bash
> 커스텀 디멘션 등록해
> 전환 이벤트 추가해
> 현재 등록 현황 확인해봐
```

## 6. 필수 npm 패키지

```bash
npm install @google-cloud/bigquery
npm install @google-analytics/data
npm install googleapis
npm install -D tsx typescript
```

## 7. 환경변수 (.env)

```
# 서비스 계정
GA4_CLIENT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GA4_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# GA4
GA4_PROPERTY_ID=123456789
GA4_MEASUREMENT_ID=G-XXXXXXXXXX

# BigQuery
BQ_PROJECT_ID=project-id
BQ_DATASET=project-id.analytics_123456789

# GTM
GTM_ACCOUNT_ID=1234567890
GTM_CONTAINER_ID=123456789
GTM_WORKSPACE_ID=1

# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
```

## 8. 새 프로젝트 세팅 순서

```
1. Claude Code 설치 + 설정 파일 복사
2. GitHub repo clone
3. toolkit/ 폴더의 .env 설정
4. npm install
5. npx tsx toolkit/scripts/bq-health-check.ts (연결 확인)
6. CLAUDE.md 작성 (프로젝트 컨텍스트)
7. claude 실행 → "#bq체크" 로 동작 확인
```
