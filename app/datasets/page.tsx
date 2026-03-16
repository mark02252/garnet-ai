'use client';

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageSectionTabs } from '@/components/page-section-tabs';
import { extractFilePayload } from '@/lib/file-extract';

type Dataset = {
  id: string;
  name: string;
  type: 'CSV' | 'JSON' | 'TEXT' | 'XLSX';
  notes?: string | null;
  rawData: string;
  analysis?: string | null;
  createdAt: string;
  updatedAt: string;
};

const QUICK_QUESTIONS = [
  '채널별 CAC와 전환율 기준으로 다음주 예산 재배분안을 제안해줘',
  '유입-전환 병목 구간을 찾아서 우선 개선 액션 3개를 제시해줘',
  'ROAS 개선을 위한 A/B 테스트 실험안을 제안해줘'
];

function detectTypeFromFilename(name: string): 'CSV' | 'JSON' | 'TEXT' | 'XLSX' {
  const lower = name.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'XLSX';
  if (lower.endsWith('.csv')) return 'CSV';
  if (lower.endsWith('.json')) return 'JSON';
  return 'TEXT';
}

function parseCsvRows(raw: string) {
  const text = raw.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => value.trim().length > 0)) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim().length > 0)) rows.push(row);
  }

  return rows;
}

function parseCsvPreview(raw: string) {
  const rows = parseCsvRows(raw);
  if (rows.length < 2) return null;
  const headers = rows[0].map((value) => value.trim());
  const previewRows = rows.slice(1, 13).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      obj[header] = (cells[index] || '').trim();
    });
    return obj;
  });
  return { headers, rows: previewRows };
}

function toNum(value: unknown) {
  const num = Number(String(value ?? '').replace(/[,\s]/g, ''));
  return Number.isFinite(num) ? num : 0;
}

function inferMetrics(raw: string) {
  const parsed = parseCsvPreview(raw);
  if (!parsed) return null;
  const lowerMap = parsed.headers.reduce<Record<string, string>>((acc, header) => {
    acc[header.toLowerCase()] = header;
    return acc;
  }, {});
  const keyCost = lowerMap.cost;
  const keyClick = lowerMap.click;
  const keyConv = lowerMap.conversion;
  if (!keyCost && !keyClick && !keyConv) return null;

  const rows = parseCsvRows(raw)
    .slice(1)
    .map((cells) => {
      const obj: Record<string, string> = {};
      parsed.headers.forEach((header, index) => {
        obj[header] = cells[index] || '';
      });
      return obj;
    });

  const totalCost = rows.reduce((acc, row) => acc + toNum(keyCost ? row[keyCost] : 0), 0);
  const totalClick = rows.reduce((acc, row) => acc + toNum(keyClick ? row[keyClick] : 0), 0);
  const totalConv = rows.reduce((acc, row) => acc + toNum(keyConv ? row[keyConv] : 0), 0);
  const cvr = totalClick > 0 ? (totalConv / totalClick) * 100 : 0;
  const cac = totalConv > 0 ? totalCost / totalConv : 0;

  return {
    totalCost,
    totalClick,
    totalConv,
    cvr,
    cac
  };
}

function extractRecommendedActions(analysis?: string | null) {
  if (!analysis) return [];
  const lines = analysis
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^[-*]\s+|^\d+\.\s+/.test(line));
  return lines
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 4);
}

function formatDate(value: string) {
  try {
    const date = new Date(value);
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(date);
  } catch {
    return value;
  }
}

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [message, setMessage] = useState('');
  const [question, setQuestion] = useState('');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({
    name: '',
    type: 'CSV' as 'CSV' | 'JSON' | 'TEXT' | 'XLSX',
    notes: '',
    rawData: ''
  });

  const selected = datasets.find((item) => item.id === selectedId) || null;
  const draftCsvPreview = useMemo(
    () => ((form.type === 'CSV' || form.type === 'XLSX') && form.rawData.trim() ? parseCsvPreview(form.rawData) : null),
    [form.type, form.rawData]
  );
  const draftMetrics = useMemo(
    () => ((form.type === 'CSV' || form.type === 'XLSX') && form.rawData.trim() ? inferMetrics(form.rawData) : null),
    [form.type, form.rawData]
  );
  const selectedCsvPreview = useMemo(
    () => (selected?.type === 'CSV' || selected?.type === 'XLSX' ? parseCsvPreview(selected.rawData) : null),
    [selected?.type, selected?.rawData]
  );
  const selectedMetrics = useMemo(
    () => (selected?.type === 'CSV' || selected?.type === 'XLSX' ? inferMetrics(selected.rawData) : null),
    [selected?.type, selected?.rawData]
  );
  const activeMetrics = draftMetrics || selectedMetrics;
  const actionCards = useMemo(() => extractRecommendedActions(selected?.analysis), [selected?.analysis]);
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return datasets;
    return datasets.filter((dataset) => `${dataset.name} ${dataset.notes || ''} ${dataset.type}`.toLowerCase().includes(keyword));
  }, [datasets, query]);

  const stats = useMemo(() => {
    const analyzedCount = datasets.filter((dataset) => Boolean(dataset.analysis?.trim())).length;
    const csvCount = datasets.filter((dataset) => dataset.type === 'CSV' || dataset.type === 'XLSX').length;
    const latest = datasets[0];
    return {
      total: datasets.length,
      analyzedCount,
      csvCount,
      latestUpdatedAt: latest ? formatDate(latest.updatedAt) : '-'
    };
  }, [datasets]);

  async function refresh() {
    const res = await fetch('/api/datasets');
    const data = (await res.json()) as Dataset[];
    setDatasets(data);
    if (data.length > 0 && !data.find((dataset) => dataset.id === selectedId)) {
      setSelectedId(data[0].id);
    }
    setInitialLoading(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      if (!form.rawData.trim()) {
        throw new Error('파일을 먼저 업로드해 주세요.');
      }

      const res = await fetch('/api/datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || '데이터셋 저장 실패');

      setForm({ name: '', type: 'CSV', notes: '', rawData: '' });
      setUploadedFileName('');
      setMessage('데이터셋이 저장되었습니다.');
      await refresh();
      setSelectedId(data.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '데이터셋 저장 실패');
    } finally {
      setLoading(false);
    }
  }

  async function runAnalysis() {
    if (!selected) return;
    setAnalyzing(true);
    setMessage('');

    try {
      const res = await fetch(`/api/datasets/${selected.id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() || undefined })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '분석 실패');

      setMessage('AI 분석이 완료되었습니다.');
      await refresh();
      setSelectedId(selected.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '분석 실패');
    } finally {
      setAnalyzing(false);
    }
  }

  async function onUploadFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const extracted = await extractFilePayload(file, 120000);
    const inferredType = detectTypeFromFilename(file.name);
    setUploadedFileName(file.name);
    setForm((prev) => ({
      ...prev,
      name: prev.name || file.name.replace(/\.[^.]+$/, ''),
      type: inferredType,
      rawData: extracted.content
    }));
    if (extracted.note) setMessage(extracted.note);
    e.target.value = '';
  }

  async function onDropFile(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const extracted = await extractFilePayload(file, 120000);
    const inferredType = detectTypeFromFilename(file.name);
    setUploadedFileName(file.name);
    setForm((prev) => ({
      ...prev,
      name: prev.name || file.name.replace(/\.[^.]+$/, ''),
      type: inferredType,
      rawData: extracted.content
    }));
    if (extracted.note) setMessage(extracted.note);
  }

  function setSampleData() {
    setUploadedFileName('샘플 데이터');
    setForm((prev) => ({
      ...prev,
      name: prev.name || '강남_채널성과_샘플',
      type: 'CSV',
      rawData: [
        'date,channel,impression,click,conversion,cost',
        '2026-02-20,instagram,54210,1840,109,980000',
        '2026-02-20,naver,38100,1290,96,760000',
        '2026-02-20,kakao,27400,810,41,540000',
        '2026-02-21,instagram,59800,1960,124,1030000',
        '2026-02-21,naver,40200,1360,110,790000',
        '2026-02-21,kakao,26100,790,39,525000'
      ].join('\n')
    }));
  }

  return (
    <div className="space-y-5">
      <section className="dashboard-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="dashboard-eyebrow">Data Studio</p>
            <h1 className="dashboard-title">데이터 스튜디오</h1>
            <p className="dashboard-copy">데이터를 올리고 바로 질문과 액션으로 이어갑니다.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={setSampleData} className="button-primary">
                샘플 불러오기
              </button>
              <Link href="/" className="button-secondary">
                캠페인 스튜디오
              </Link>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="accent-pill">데이터 {stats.total}개</span>
              <span className="pill-option">분석 완료 {stats.analyzedCount}개</span>
              <span className="pill-option">표 형식 {stats.csvCount}개</span>
            </div>
          </div>

          <div className="min-w-[220px] rounded-[22px] border border-slate-200 bg-white/92 p-4 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">오늘 포인트</p>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-950">질문 문장을 짧게 구체화할수록 AI 분석 결과가 더 좋아집니다.</p>
          </div>
        </div>
        <PageSectionTabs
          items={[
            { label: '입력', href: '#upload' },
            { label: '라이브러리', href: '#library' },
            { label: 'AI 분석', href: '#analysis' },
            { label: '인사이트', href: '#insights' }
          ]}
        />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="status-tile">
          <p className="metric-label">총 데이터셋</p>
          <p className="mt-2 text-base font-semibold text-slate-950">{stats.total}</p>
          <p className="mt-1 text-xs text-slate-500">현재 워크스페이스에 저장된 데이터</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">분석 완료</p>
          <p className="mt-2 text-base font-semibold text-slate-950">{stats.analyzedCount}</p>
          <p className="mt-1 text-xs text-slate-500">AI 분석 결과가 있는 데이터셋</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">표 형식 데이터</p>
          <p className="mt-2 text-base font-semibold text-slate-950">{stats.csvCount}</p>
          <p className="mt-1 text-xs text-slate-500">CSV/XLSX 기반 분석 가능 데이터</p>
        </div>
        <div className="status-tile">
          <p className="metric-label">최근 업데이트</p>
          <p className="mt-2 text-base font-semibold text-slate-950">{stats.latestUpdatedAt}</p>
          <p className="mt-1 text-xs text-slate-500">가장 최근 수정된 데이터셋 기준</p>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_380px]">
        <div className="space-y-5">
          <section id="upload" className="panel space-y-4 scroll-mt-24">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Upload Studio</p>
                <h2 className="section-title">데이터 입력</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">파일을 넣고 이름과 메모만 저장하면 됩니다.</p>
              </div>
              <span className="accent-pill">{uploadedFileName || '파일 대기'}</span>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">데이터셋 이름</label>
                  <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">유형</label>
                  <select
                    className="input"
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as 'CSV' | 'JSON' | 'TEXT' | 'XLSX' })}
                  >
                    <option value="CSV">CSV</option>
                    <option value="XLSX">XLSX</option>
                    <option value="JSON">JSON</option>
                    <option value="TEXT">TEXT</option>
                  </select>
                </div>
              </div>

              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDropFile}
                className={`flex min-h-[136px] cursor-pointer flex-col items-center justify-center rounded-[24px] border-2 border-dashed px-5 py-5 text-center transition ${
                  dragging ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-slate-50/80'
                }`}
              >
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.json,.txt,.md,text/plain,application/json,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={onUploadFile}
                />
                <p className="text-sm font-semibold text-slate-950">여기에 파일을 끌어다 놓으세요</p>
                <p className="mt-2 text-xs text-slate-500">또는 클릭해서 CSV / XLSX / JSON / TXT 파일 선택</p>
              </label>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">설명 / 메모</label>
                <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>

              <button type="submit" disabled={loading} className="button-primary">
                {loading ? '저장 중...' : '데이터 저장'}
              </button>
            </form>
          </section>

          <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <div id="library" className="panel space-y-4 scroll-mt-24">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Dataset Library</p>
                  <h2 className="section-title">라이브러리</h2>
                </div>
                <span className="pill-option">{filtered.length}개</span>
              </div>
              <input className="input" placeholder="이름 / 메모 / 유형 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="max-h-[420px] space-y-3 overflow-auto pr-1">
                {initialLoading && <div className="soft-panel text-sm text-slate-600">데이터셋을 불러오는 중입니다.</div>}
                {!initialLoading && filtered.length === 0 && <div className="soft-panel text-sm text-slate-600">저장된 데이터셋이 없습니다.</div>}
                {filtered.map((dataset) => {
                  const active = dataset.id === selectedId;
                  return (
                    <button
                      key={dataset.id}
                      type="button"
                      onClick={() => setSelectedId(dataset.id)}
                      className={`w-full rounded-[18px] border p-3.5 text-left transition ${
                        active ? 'border-sky-200 bg-sky-50/80' : 'border-slate-200 bg-white/90 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-950">{dataset.name}</p>
                        <span className="pill-option">{dataset.type}</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">{formatDate(dataset.updatedAt)}</p>
                      {dataset.notes && <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{dataset.notes}</p>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div id="analysis" className="panel space-y-4 scroll-mt-24">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">AI Analysis</p>
                  <h2 className="section-title">AI 분석</h2>
                </div>
                <span className="accent-pill">{selected ? 'dataset ready' : 'select dataset'}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK_QUESTIONS.map((item) => (
                  <button key={item} type="button" onClick={() => setQuestion(item)} className="button-secondary text-xs">
                    {item}
                  </button>
                ))}
              </div>
              <textarea
                className="input min-h-[110px]"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="예) 채널별 CAC와 전환율 기준으로 다음주 예산 재배분안을 제안해줘"
              />
              <button onClick={runAnalysis} type="button" disabled={!selected || analyzing} className="button-primary">
                {analyzing ? 'AI 분석 중...' : 'AI 분석 실행'}
              </button>
              {message && <p className="text-sm text-slate-600">{message}</p>}

              <div className="soft-panel">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-950">추천 액션</p>
                  <span className="pill-option">{actionCards.length}개</span>
                </div>
                {actionCards.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-600">분석 실행 후 우선 실행 액션이 자동 추출됩니다.</p>
                ) : (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {actionCards.map((action, index) => (
                      <div key={`${action}-${index}`} className="list-card">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Action {index + 1}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-700">{action}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

              {draftCsvPreview && (
            <section className="panel">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Draft Preview</p>
                  <h2 className="section-title">업로드 미리보기</h2>
                </div>
                <span className="pill-option">{draftCsvPreview.rows.length} rows</span>
              </div>
              <div className="mt-3 max-h-[280px] overflow-auto rounded-[22px] border border-slate-200">
                <table className="min-w-full table-fixed text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      {draftCsvPreview.headers.map((header) => (
                        <th key={header} className="px-3 py-2 font-semibold">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {draftCsvPreview.rows.map((row, index) => (
                      <tr key={index} className="border-t border-slate-100">
                        {draftCsvPreview.headers.map((header) => (
                          <td key={`${index}-${header}`} className="max-w-[340px] whitespace-pre-wrap break-words px-3 py-2 text-slate-700">
                            {row[header]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {selectedCsvPreview && (
            <section className="panel">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Selected Preview</p>
                  <h2 className="section-title">선택 데이터 미리보기</h2>
                </div>
                <span className="pill-option">{selectedCsvPreview.rows.length} rows</span>
              </div>
              <div className="mt-3 max-h-[280px] overflow-auto rounded-[22px] border border-slate-200">
                <table className="min-w-full table-fixed text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      {selectedCsvPreview.headers.map((header) => (
                        <th key={header} className="px-3 py-2 font-semibold">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCsvPreview.rows.map((row, index) => (
                      <tr key={index} className="border-t border-slate-100">
                        {selectedCsvPreview.headers.map((header) => (
                          <td key={`${index}-${header}`} className="max-w-[340px] whitespace-pre-wrap break-words px-3 py-2 text-slate-700">
                            {row[header]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="grid gap-5 xl:grid-cols-[0.96fr_1.04fr]">
            <div className="panel">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Raw Data</p>
                  <h2 className="section-title">원본</h2>
                </div>
                <span className="pill-option">{selected?.type || form.type}</span>
              </div>
              <pre className="mt-3 max-h-[300px] overflow-auto rounded-[22px] bg-slate-950 p-4 text-xs leading-6 text-slate-100">
                {selected?.rawData || form.rawData || '선택된 데이터셋이 없습니다.'}
              </pre>
            </div>

            <div className="panel">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">AI Result</p>
                  <h2 className="section-title">AI 결과</h2>
                </div>
                <span className="accent-pill">{selected?.analysis ? 'ready' : 'pending'}</span>
              </div>
              <pre className="mt-3 max-h-[300px] overflow-auto whitespace-pre-wrap rounded-[22px] bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                {selected?.analysis || '분석 결과가 없습니다. 질문을 입력하고 "AI 분석 실행"을 눌러주세요.'}
              </pre>
            </div>
          </section>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <section id="insights" className="panel space-y-4 scroll-mt-24">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Insight Rail</p>
              <h2 className="section-title">핵심 수치</h2>
            </div>
            <div className="grid gap-3">
              <div className="list-card">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">총 비용</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {activeMetrics ? activeMetrics.totalCost.toLocaleString('ko-KR') : '-'}
                </p>
              </div>
              <div className="list-card">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">총 클릭</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {activeMetrics ? activeMetrics.totalClick.toLocaleString('ko-KR') : '-'}
                </p>
              </div>
              <div className="list-card">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">총 전환</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {activeMetrics ? activeMetrics.totalConv.toLocaleString('ko-KR') : '-'}
                </p>
              </div>
              <div className="list-card">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">CAC / CVR</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {activeMetrics ? `${activeMetrics.cac.toFixed(0)} / ${activeMetrics.cvr.toFixed(2)}%` : '-'}
                </p>
              </div>
            </div>
          </section>

          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Selected Dataset</p>
              <h2 className="section-title">현재 선택 정보</h2>
            </div>
            {selected ? (
              <div className="space-y-3">
                <div className="soft-panel">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Name</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{selected.name}</p>
                  <p className="mt-2 text-xs text-slate-500">{selected.notes || '메모 없음'}</p>
                </div>
                <div className="grid gap-3">
                  <div className="list-card">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">유형</p>
                    <p className="mt-2 text-sm text-slate-700">{selected.type}</p>
                  </div>
                  <div className="list-card">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">업데이트</p>
                    <p className="mt-2 text-sm text-slate-700">{formatDate(selected.updatedAt)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="soft-panel text-sm text-slate-600">왼쪽 라이브러리에서 데이터셋을 선택하면 요약 정보가 표시됩니다.</div>
            )}
          </section>

          <section className="panel space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Question Guide</p>
              <h2 className="section-title">질문 팁</h2>
            </div>
            <div className="grid gap-3">
              <div className="soft-panel">
                <p className="text-sm leading-6 text-slate-700">채널별 `CAC`, `CVR`, `ROAS`, `예산 재배분`처럼 비교 기준을 명확히 넣으면 결과가 더 좋아집니다.</p>
              </div>
              <div className="soft-panel">
                <p className="text-sm leading-6 text-slate-700">수치 원인 분석과 액션 도출을 같이 요청하면, 단순 리포트보다 바로 실행 가능한 답을 얻기 쉽습니다.</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
