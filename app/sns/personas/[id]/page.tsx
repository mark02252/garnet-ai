'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

type Persona = {
  id: string; name: string; platform: string; brandConcept: string | null
  targetAudience: string | null; writingStyle: string | null; tone: string | null
  keywords: string; sampleSentences: string; instagramHandle: string | null
}

export default function PersonaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [persona, setPersona] = useState<Persona | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/sns/personas/${id}`).then(r => r.json()).then(setPersona)
  }, [id])

  async function handleSave() {
    if (!persona) return
    setSaving(true)
    await fetch(`/api/sns/personas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...persona,
        keywords: (() => { try { return JSON.parse(persona.keywords) } catch { return [] } })(),
        sampleSentences: (() => { try { return JSON.parse(persona.sampleSentences) } catch { return [] } })(),
      }),
    })
    setSaving(false)
    router.push('/sns/personas')
  }

  if (!persona) return <div className="p-6 text-[var(--text-muted)]">불러오는 중...</div>

  const keywords: string[] = (() => { try { return JSON.parse(persona.keywords) } catch { return [] } })()

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <p className="dashboard-eyebrow mb-1">SNS 스튜디오 · 페르소나</p>
      <h1 className="dashboard-title mb-6">{persona.name}</h1>
      <div className="card space-y-4">
        {[
          ['name', '페르소나 이름', persona.name],
          ['brandConcept', '브랜드 컨셉', persona.brandConcept ?? ''],
          ['targetAudience', '타겟 오디언스', persona.targetAudience ?? ''],
          ['writingStyle', '글쓰기 스타일', persona.writingStyle ?? ''],
          ['tone', '톤', persona.tone ?? ''],
          ['instagramHandle', 'Instagram 핸들', persona.instagramHandle ?? ''],
        ].map(([field, label, value]) => (
          <div key={field}>
            <label className="text-sm text-[var(--text-muted)] block mb-1">{label}</label>
            <input
              className="input w-full"
              value={value}
              onChange={e => setPersona(prev => prev ? { ...prev, [field]: e.target.value } : prev)}
            />
          </div>
        ))}
        <div>
          <label className="text-sm text-[var(--text-muted)] block mb-1">키워드 (쉼표 구분)</label>
          <input
            className="input w-full"
            value={keywords.join(', ')}
            onChange={e => setPersona(prev => prev ? {
              ...prev,
              keywords: JSON.stringify(e.target.value.split(',').map(k => k.trim()).filter(Boolean))
            } : prev)}
          />
        </div>
        <div className="flex gap-2 pt-2">
          <button className="button-secondary flex-1" onClick={() => router.back()}>취소</button>
          <button className="button-primary flex-1" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
