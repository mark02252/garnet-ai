# Garnet

### A marketer with zero coding experience built a team of 5 AI specialists that run 24/7.

They analyze data, monitor competitors, find problems you'd miss, and get smarter every day — all built with Claude Code.

> **Every morning at 7am, this lands in Slack:**
>
> Revenue. Conversion funnels. Competitor changes. Per-location anomalies.
>
> Not a dashboard you check. A briefing that comes to you.

[![GitHub stars](https://img.shields.io/github/stars/mark02252/garnet-ai?style=social)](https://github.com/mark02252/garnet-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/mark02252/garnet-ai)](https://github.com/mark02252/garnet-ai/releases)

[한국어 README](README.ko.md) · [Roadmap](docs/GARNET_ROADMAP.md)

---

## The 5 AI Specialists

| | Specialist | What They Do |
|---|---|---|
| 📊 | **Data Analyst** | Catches anomalies across all locations — "This branch dropped 40% yesterday" |
| 🎬 | **Content Strategist** | Proposes content ideas backed by engagement data |
| 💰 | **CRO Expert** | Finds conversion bottlenecks — "79% drop-off at seat selection" |
| 🧠 | **Marketing Psychologist** | Applies behavioral science — "Choice overload is causing abandonment" |
| 🧭 | **Strategy Lead** | Market positioning — "B2B workshop season, time to pivot focus" |

They talk to each other. CRO asks Psychology: *"Why are users dropping off here?"*

They call tools on their own. If they need more data, they query GA4, crawl competitor sites, or search the knowledge base — without being told.

---

## Screenshots

| Daily Slack Briefing | Self-Improvement Dashboard |
|:---:|:---:|
| ![Slack Briefing](docs/screenshots/01-agent-loop.png) | ![Self-Improve](docs/screenshots/03-self-improve.png) |

| Role Manager (5 AI Specialists) | GA4 Analytics |
|:---:|:---:|
| ![Roles](docs/screenshots/02-evolution.png) | ![Analytics](docs/screenshots/04-analytics.png) |

---

## Why Garnet?

**Most AI tools wait for commands. Garnet doesn't.**

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

### Runs on Your Machine
```
No cloud subscription. No monthly fees. Your data stays on your machine.

Garnet runs locally on:
  Mac Mini (recommended) — always-on, low power, runs 24/7 quietly
  MacBook — works fine, just needs to be running
  Any machine with Node.js 18+ — Linux, Windows (WSL)

What you need:
  Free Gemini API key (ai.google.dev)
  GA4 service account (if you want analytics)
  Slack webhook (if you want morning briefings)
  That's it. No paid subscriptions.
```

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

## Apply to Your Company in 5 Minutes

### Step 1: Describe your business

Edit `config/company.md`:

```markdown
---
name: "Your Company"
industry: "ecommerce"
---

# Business Context

We sell handmade candles online.
Main channels: Instagram + Google Ads.
KPIs: revenue, conversion rate, CAC, retention.
Current challenge: conversion rate stuck at 2%.
```

That's it. Write in plain language. Garnet reads this and configures itself.

### Step 2: Connect your data

Add to `.env`:
```
GEMINI_API_KEY=your_key          # Free at ai.google.dev
GA4_PROPERTY_ID=123456789        # Your GA4 property
GA4_CLIENT_EMAIL=...             # GA4 service account
GA4_PRIVATE_KEY=...              # GA4 service account key
SLACK_WEBHOOK_URL=...            # For daily briefings
```

No GA4? Garnet still works — it just won't have analytics data. It can still monitor competitors and provide strategic insights.

### Step 3: Start

```bash
git clone https://github.com/mark02252/garnet-ai.git
cd garnet-ai
npm install
npx prisma db push
npm run dev
```

First Slack briefing arrives at 7am next morning.

### What happens next

```
Day 1:    Garnet starts collecting data, learning your business
Day 3:    Insights start getting specific to your situation
Week 2:   Knowledge store has 50+ learned patterns
Month 1:  Garnet knows your priorities, gives relevant advice
Month 3:  400+ insights, tailored to how you think
```

### Works for any business

```
SaaS:        Track MRR, churn, trial conversion
E-commerce:  Track revenue, cart abandonment, channel ROI
Hospitality: Track bookings, per-location performance
Agency:      Track client campaigns, deliverables
Any:         If you have GA4, Garnet can analyze it
```

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

### Self-Learning with Bounded Confidence

Garnet automatically verifies its own insights against real data — no human labeling required.

```
Every cycle:
  1. Garnet generates insights with testable predictions
  2. After 24-168 hours, compares predictions against actual data
  3. Correct → confidence +0.08 (max 0.95)
     Wrong  → confidence -0.08 (min 0.10)
  4. Knowledge Store evolves without human intervention

Safe domains (auto-learn):   analytics, competitive, retention, marketing...
Manual domains (human only):  pricing, finance, paid advertising
```

No runaway learning — confidence moves ±0.08 per verification, capped at [0.10, 0.95]. The system learns what works, forgets what doesn't, and never touches pricing or budget decisions without you.

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
