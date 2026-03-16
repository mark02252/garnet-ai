export type StructuredDeliverable = {
  documentType: string;
  title: string;
  campaignName: string;
  objective: string;
  target: string;
  coreMessage: string;
  executiveSummary: string[];
  channelPlan: Array<{ channel: string; format: string; budgetPct: number; kpi: string; targetValue: string }>;
  kpiTable: Array<{ kpi: string; baseline: string; target: string; period: string }>;
  timeline: Array<{ phase: string; start: string; end: string; owner: string; action: string }>;
  riskMatrix: Array<{ risk: string; impact: string; probability: string; mitigation: string }>;
  evidence: { sourceIds: string[]; assumptions: string[]; confidence: number };
  nextActions: string[];
};

export function parseStructuredDeliverable(raw?: string | null): StructuredDeliverable | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StructuredDeliverable>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.channelPlan) || !Array.isArray(parsed.kpiTable)) return null;

    return {
      documentType: String(parsed.documentType || ''),
      title: String(parsed.title || ''),
      campaignName: String(parsed.campaignName || ''),
      objective: String(parsed.objective || ''),
      target: String(parsed.target || ''),
      coreMessage: String(parsed.coreMessage || ''),
      executiveSummary: Array.isArray(parsed.executiveSummary) ? parsed.executiveSummary.map((v) => String(v)) : [],
      channelPlan: parsed.channelPlan.map((row) => ({
        channel: String(row.channel || ''),
        format: String(row.format || ''),
        budgetPct: Number(row.budgetPct || 0),
        kpi: String(row.kpi || ''),
        targetValue: String(row.targetValue || '')
      })),
      kpiTable: parsed.kpiTable.map((row) => ({
        kpi: String(row.kpi || ''),
        baseline: String(row.baseline || ''),
        target: String(row.target || ''),
        period: String(row.period || '')
      })),
      timeline: Array.isArray(parsed.timeline)
        ? parsed.timeline.map((row) => ({
            phase: String(row.phase || ''),
            start: String(row.start || ''),
            end: String(row.end || ''),
            owner: String(row.owner || ''),
            action: String(row.action || '')
          }))
        : [],
      riskMatrix: Array.isArray(parsed.riskMatrix)
        ? parsed.riskMatrix.map((row) => ({
            risk: String(row.risk || ''),
            impact: String(row.impact || ''),
            probability: String(row.probability || ''),
            mitigation: String(row.mitigation || '')
          }))
        : [],
      evidence:
        parsed.evidence && typeof parsed.evidence === 'object'
          ? {
              sourceIds: Array.isArray((parsed.evidence as { sourceIds?: unknown }).sourceIds)
                ? ((parsed.evidence as { sourceIds: unknown[] }).sourceIds || []).map((v) => String(v))
                : [],
              assumptions: Array.isArray((parsed.evidence as { assumptions?: unknown }).assumptions)
                ? ((parsed.evidence as { assumptions: unknown[] }).assumptions || []).map((v) => String(v))
                : [],
              confidence: Number((parsed.evidence as { confidence?: unknown }).confidence || 0)
            }
          : { sourceIds: [], assumptions: [], confidence: 0 },
      nextActions: Array.isArray(parsed.nextActions) ? parsed.nextActions.map((v) => String(v)) : []
    };
  } catch {
    return null;
  }
}
