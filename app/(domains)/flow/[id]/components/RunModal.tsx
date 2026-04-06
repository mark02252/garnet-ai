'use client'

import { useState } from 'react'
import { useFlowRunStore } from '@/lib/flow/run-store'
import type { FlowRunEvent } from '@/lib/flow/types'

type Props = {
  templateId: string
  defaultTopic: string
  onClose: () => void
}

export default function RunModal({ templateId, defaultTopic, onClose }: Props) {
  const [topic, setTopic] = useState(defaultTopic)
  const [brand, setBrand] = useState('')
  const [region, setRegion] = useState('')
  const [goal, setGoal] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { startRun, setNodeStatus, setNodeOutput, finishRun, resetRun } = useFlowRunStore()

  async function handleRun() {
    if (!topic.trim()) return
    setRunning(true)
    setError(null)
    resetRun()  // clear any previous run state before starting

    try {
      const res = await fetch(`/api/flow-templates/${templateId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), brand: brand || undefined, region: region || undefined, goal: goal || undefined }),
      })

      if (!res.ok || !res.body) {
        setError('실행 요청에 실패했습니다.')
        setRunning(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      onClose() // Close modal, let canvas show status

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event: FlowRunEvent = JSON.parse(line.slice(6))

            if (event.type === 'run-start') {
              startRun(event.runId)
            } else if (event.type === 'node-start') {
              setNodeStatus(event.nodeId, 'running')
            } else if (event.type === 'node-done') {
              setNodeStatus(event.nodeId, 'done')
              setNodeOutput(event.nodeId, event.output)
            } else if (event.type === 'node-error') {
              setNodeStatus(event.nodeId, 'error')
            } else if (event.type === 'flow-complete') {
              finishRun()  // sets isRunning=false, runId stored in Zustand — editor page shows "결과 보기" link
            } else if (event.type === 'flow-error') {
              resetRun()  // clear runId so editor doesn't show "결과 보기" for a failed run
            }
          } catch { /* ignore malformed line */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-2xl border border-[var(--surface-border)] bg-[var(--surface-raised)] p-6 shadow-2xl">
        <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">플로우 실행</h2>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-muted)]">토론 주제 *</label>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="주제를 입력하세요"
              className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-muted)]">브랜드 (선택)</label>
            <input
              value={brand}
              onChange={e => setBrand(e.target.value)}
              placeholder="예: 쿠팡, 당근마켓"
              className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-muted)]">지역 (선택)</label>
            <input
              value={region}
              onChange={e => setRegion(e.target.value)}
              placeholder="예: 서울, 한국"
              className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--text-muted)]">목표 (선택)</label>
            <input
              value={goal}
              onChange={e => setGoal(e.target.value)}
              placeholder="예: 신규 고객 유치"
              className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            취소
          </button>
          <button
            onClick={handleRun}
            disabled={running || !topic.trim()}
            className="rounded-lg bg-[var(--accent)] px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {running ? '실행 중…' : '실행'}
          </button>
        </div>
      </div>
    </div>
  )
}
