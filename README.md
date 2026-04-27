# Garnet

**Your autonomous marketing advisor that learns your business.**

Garnet is an open-source AI agent system that runs 24/7, analyzes your marketing data, monitors competitors, and advises you with insights that get smarter every day.

Built by a solo marketer with no coding experience, using Claude Code.

> [한국어 README](README.ko.md) · [Roadmap](docs/GARNET_ROADMAP.md)

## Screenshots

| Daily Slack Briefing | Self-Improvement Dashboard |
|:---:|:---:|
| ![Slack Briefing](docs/screenshots/01-agent-loop.png) | ![Self-Improve](docs/screenshots/03-self-improve.png) |

| Role Manager (5 AI Specialists) | GA4 Analytics |
|:---:|:---:|
| ![Roles](docs/screenshots/02-evolution.png) | ![Analytics](docs/screenshots/04-analytics.png) |

## Why Garnet?

**Most AI marketing tools wait for your commands. Garnet doesn't.**

- **Runs 24/7** — 5 AI specialists analyze your data every cycle, automatically
- **Learns your judgment** — Give feedback (👍 Noted / ❌ Pass), Garnet learns what matters to you
- **Finds what you'd miss** — Detects anomalies across all locations, channels, and funnels daily
- **Portable** — Switch companies with one config file. Your AI advisor follows your career

## How It Works

```
Every 30 minutes:
  Scanner → collects GA4, SNS, competitor data
  ↓
  5 Sub-Reasoners (parallel):
    📊 Data Analyst — finds patterns and anomalies
    🎬 Content Strategist — proposes content ideas with rationale
    🧭 Marketing Strategist — market positioning and growth strategy
    💰 CRO Expert — conversion bottlenecks and quick wins
    🧠 Marketing Psychologist — behavioral insights and cognitive biases
  ↓
  Reasoner → synthesizes into actionable insights
  ↓
  Advisor Inbox → You decide: 👍 Noted / ❌ Pass + optional feedback
  ↓
  Garnet learns → next cycle is more accurate
```

## Key Features

### Agentic Tool Harness
Sub-Reasoners don't just analyze pre-collected data — they **actively call tools** when they need more information:
- GA4 queries, funnel analysis, per-location breakdowns
- Knowledge Store semantic search (400+ learned insights)
- Competitor website crawling via Playwright
- Instagram post/account analytics
- Web search for real-time trends
- **ask_expert** — CRO specialist asks Psychology specialist: "What's causing this drop-off?"

### Advisor Mode
Garnet doesn't tell you what to do. It tells you what's happening and suggests what to consider.
- **👍 Noted** — "Good point, I'll consider this" → Garnet learns this direction is right
- **❌ Pass** + text — "Not now, focusing on B2B" → Garnet learns your priorities
- **No execution tracking** — Garnet advises, you decide and execute

### Domain Portability
```
Engine (domain-agnostic) → never changes
Config (per-company)     → swap when you move
Knowledge (learned)      → accumulates over time

Switch companies:
1. Write config/company.md (your new business context)
2. Run bootstrap → auto-generates domain.yaml + tools.yaml
3. Start → Garnet begins learning your new domain
```

### Intelligence Collection
- 18 watch keywords monitoring competitors and trends
- Auto-collected from web/news every 2 hours
- AI-tagged by relevance and urgency (CRITICAL alerts)
- Tech Radar scans GitHub Trending daily for applicable tools

### Memory Systems
- **Knowledge Store** — 400+ business insights with embedding-based semantic search (LightRAG pattern)
- **Episodic Memory** — 1,500+ decision records for pattern matching
- **Failure Registry** — Time-weighted avoidance rules

### Daily Slack Briefing
Every morning at 7am:
- Revenue, purchasers, conversion rate, new vs returning
- 6-stage purchase funnel with drop-off analysis
- Per-location revenue breakdown
- AI-generated insights and recommendations

## Quick Start

```bash
# Clone
git clone https://github.com/mark02252/garnet-ai.git
cd garnet-ai

# Install
npm install

# Configure
cp config/company.md.example config/company.md
# Edit company.md with your business context

# Set environment variables
cp .env.example .env
# Add: GEMINI_API_KEY, GA4 credentials, SLACK_WEBHOOK_URL

# Generate Prisma client
npx prisma db push

# Start (Agent Loop + Scheduler auto-start)
npm run dev
```

First Slack briefing arrives at 7am next morning.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Agent Loop (50+ modules)                                     │
│                                                               │
│  Scanner → 5 Sub-Reasoners (with Tool Harness) → Reasoner    │
│                ↕ ask_expert (A2A)                              │
│            Reflective Critic → Advisor Inbox → Feedback Loop  │
│                                                               │
│  World Model (config-driven, domain-portable)                │
│                                                               │
│  Cycles: 30min urgency / 1hr routine / 7am briefing          │
│          6pm evening / Mon 9am weekly review                  │
└──────────────────────────────────────────────────────────────┘
```

### Evolution Phases (all active simultaneously)

| Phase | Name | What It Does |
|-------|------|-------------|
| 1 | Knowledge Engine | Measures outcomes, accumulates knowledge, learns from feedback |
| 2 | Curiosity Engine | Reads articles, tracks macro trends, cross-domain insights |
| 3 | Causal Reasoning | Causal models, confidence scoring, goal prediction |
| 4 | Reflective Roles | Self-critique, capability benchmarks, proactive questions |
| 5 | Self-Coding | Cycle reflection, prediction calibration, prompt evolution |
| 6 | Agent Organization | 5 parallel Sub-Reasoners with domain expertise |
| 7 | Agentic Tool Harness | Active tool calling, A2A cross-queries, domain portability |
| 8 | WorldModel Portability | Config-driven prompts, company.md bootstrap |

## Tech Stack

- **Runtime:** Next.js (App Router, TypeScript)
- **LLM:** Gemini 2.5 Flash-Lite (primary) → Gemma4 local (fallback) — free tier only
- **Embeddings:** Ollama nomic-embed-text (local)
- **Database:** PostgreSQL (Supabase) + Prisma
- **Tool Harness:** Cache + whitelist + sliding window rate limit + observability
- **Function Calling:** Gemini/Groq native tool-use, Gemma4 JSON fallback
- **Analytics:** GA4 Data API + Admin API
- **Notifications:** Slack Webhook + Telegram Bot API
- **Competitor Monitoring:** Playwright headless browser
- **MCP:** 28 preset connections (expandable)

## Built With No Coding Experience

Garnet was built by a solo marketer using Claude Code. Every line of code was written by AI, directed by a marketer who knew **what** needed to exist but not **how** to build it.

The entire system — 50+ modules, 12 registered tools, 8 evolution phases — was built through natural language conversations with Claude Code.

If you're a marketer who wants to build your own AI advisor, you can. [Start here →](docs/GARNET_ROADMAP.md)

## License

MIT

## Author

**Jung Jaeho** — Solo marketer who built this with Claude Code.

- [LinkedIn](https://www.linkedin.com/in/jung-jaeho-9a72a3325)
- [Portfolio](https://mark02252.github.io)

Questions, feedback, or collaboration? Open an [Issue](https://github.com/mark02252/garnet-ai/issues) or reach out on LinkedIn.

## Links

- [Roadmap](docs/GARNET_ROADMAP.md)
- [Agent Workflows](docs/AGENT_WORKFLOWS.md)
