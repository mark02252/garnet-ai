import PptxGenJS from 'pptxgenjs';

type SlideDeliverable = {
  title: string;
  campaignName: string;
  objective: string;
  target: string;
  coreMessage: string;
  executiveSummary: string[];
  channelPlan: Array<{
    channel: string;
    format: string;
    budgetPct: number;
    kpi: string;
    targetValue: string;
  }>;
  kpiTable: Array<{
    kpi: string;
    baseline: string;
    target: string;
    period: string;
  }>;
  timeline: Array<{
    phase: string;
    start: string;
    end: string;
    owner: string;
    action: string;
  }>;
  riskMatrix: Array<{
    risk: string;
    impact: string;
    probability: string;
    mitigation: string;
  }>;
  nextActions: string[];
};

const BRAND_COLOR = '3182F6';
const TEXT_COLOR = '333D4B';
const MUTED_COLOR = '6B7684';

function addTitleSlide(pptx: PptxGenJS, data: SlideDeliverable) {
  const slide = pptx.addSlide();
  slide.background = { color: BRAND_COLOR };
  slide.addText(data.title || data.campaignName, {
    x: 0.8, y: 1.5, w: 8.4, h: 1.2,
    fontSize: 32, fontFace: 'Arial', color: 'FFFFFF', bold: true
  });
  slide.addText(data.objective, {
    x: 0.8, y: 3.0, w: 8.4, h: 0.8,
    fontSize: 16, fontFace: 'Arial', color: 'E0E8F0'
  });
  slide.addText(`타깃: ${data.target}`, {
    x: 0.8, y: 4.0, w: 8.4, h: 0.5,
    fontSize: 14, fontFace: 'Arial', color: 'C0D0E0'
  });
}

function addSummarySlide(pptx: PptxGenJS, data: SlideDeliverable) {
  const slide = pptx.addSlide();
  slide.addText('Executive Summary', {
    x: 0.8, y: 0.4, w: 8.4, h: 0.6,
    fontSize: 24, fontFace: 'Arial', color: BRAND_COLOR, bold: true
  });
  slide.addText(data.coreMessage, {
    x: 0.8, y: 1.2, w: 8.4, h: 0.6,
    fontSize: 14, fontFace: 'Arial', color: MUTED_COLOR, italic: true
  });

  const bullets = (data.executiveSummary || []).map((s) => ({ text: s, options: { bullet: true, fontSize: 13 } }));
  if (bullets.length > 0) {
    slide.addText(bullets as PptxGenJS.TextProps[], {
      x: 0.8, y: 2.0, w: 8.4, h: 3.5,
      fontFace: 'Arial', color: TEXT_COLOR, lineSpacingMultiple: 1.4
    });
  }
}

function addChannelSlide(pptx: PptxGenJS, data: SlideDeliverable) {
  if (!data.channelPlan?.length) return;
  const slide = pptx.addSlide();
  slide.addText('Channel Plan', {
    x: 0.8, y: 0.4, w: 8.4, h: 0.6,
    fontSize: 24, fontFace: 'Arial', color: BRAND_COLOR, bold: true
  });

  const rows: PptxGenJS.TableRow[] = [
    [
      { text: '채널', options: { bold: true, fill: { color: 'EFF6FF' }, color: BRAND_COLOR } },
      { text: '포맷', options: { bold: true, fill: { color: 'EFF6FF' }, color: BRAND_COLOR } },
      { text: '예산%', options: { bold: true, fill: { color: 'EFF6FF' }, color: BRAND_COLOR } },
      { text: 'KPI', options: { bold: true, fill: { color: 'EFF6FF' }, color: BRAND_COLOR } },
      { text: '목표', options: { bold: true, fill: { color: 'EFF6FF' }, color: BRAND_COLOR } }
    ]
  ];

  for (const ch of data.channelPlan.slice(0, 8)) {
    rows.push([
      { text: ch.channel },
      { text: ch.format },
      { text: `${ch.budgetPct}%` },
      { text: ch.kpi },
      { text: ch.targetValue }
    ]);
  }

  slide.addTable(rows, {
    x: 0.8, y: 1.2, w: 8.4,
    fontSize: 11, fontFace: 'Arial', color: TEXT_COLOR,
    border: { type: 'solid', pt: 0.5, color: 'D1D5DB' },
    colW: [2, 1.8, 1, 1.8, 1.8]
  });
}

function addKpiSlide(pptx: PptxGenJS, data: SlideDeliverable) {
  if (!data.kpiTable?.length) return;
  const slide = pptx.addSlide();
  slide.addText('KPI Targets', {
    x: 0.8, y: 0.4, w: 8.4, h: 0.6,
    fontSize: 24, fontFace: 'Arial', color: BRAND_COLOR, bold: true
  });

  const rows: PptxGenJS.TableRow[] = [
    [
      { text: 'KPI', options: { bold: true, fill: { color: 'EFF6FF' }, color: BRAND_COLOR } },
      { text: 'Baseline', options: { bold: true, fill: { color: 'EFF6FF' }, color: BRAND_COLOR } },
      { text: 'Target', options: { bold: true, fill: { color: 'EFF6FF' }, color: BRAND_COLOR } },
      { text: 'Period', options: { bold: true, fill: { color: 'EFF6FF' }, color: BRAND_COLOR } }
    ]
  ];

  for (const k of data.kpiTable.slice(0, 8)) {
    rows.push([
      { text: k.kpi },
      { text: k.baseline },
      { text: k.target },
      { text: k.period }
    ]);
  }

  slide.addTable(rows, {
    x: 0.8, y: 1.2, w: 8.4,
    fontSize: 11, fontFace: 'Arial', color: TEXT_COLOR,
    border: { type: 'solid', pt: 0.5, color: 'D1D5DB' },
    colW: [2.5, 2, 2, 1.9]
  });
}

function addTimelineSlide(pptx: PptxGenJS, data: SlideDeliverable) {
  if (!data.timeline?.length) return;
  const slide = pptx.addSlide();
  slide.addText('Timeline', {
    x: 0.8, y: 0.4, w: 8.4, h: 0.6,
    fontSize: 24, fontFace: 'Arial', color: BRAND_COLOR, bold: true
  });

  const rows: PptxGenJS.TableRow[] = [
    [
      { text: 'Phase', options: { bold: true, fill: { color: 'EFF6FF' }, color: BRAND_COLOR } },
      { text: 'Start', options: { bold: true, fill: { color: 'EFF6FF' }, color: BRAND_COLOR } },
      { text: 'End', options: { bold: true, fill: { color: 'EFF6FF' }, color: BRAND_COLOR } },
      { text: 'Owner', options: { bold: true, fill: { color: 'EFF6FF' }, color: BRAND_COLOR } },
      { text: 'Action', options: { bold: true, fill: { color: 'EFF6FF' }, color: BRAND_COLOR } }
    ]
  ];

  for (const t of data.timeline.slice(0, 8)) {
    rows.push([
      { text: t.phase },
      { text: t.start },
      { text: t.end },
      { text: t.owner },
      { text: t.action }
    ]);
  }

  slide.addTable(rows, {
    x: 0.8, y: 1.2, w: 8.4,
    fontSize: 10, fontFace: 'Arial', color: TEXT_COLOR,
    border: { type: 'solid', pt: 0.5, color: 'D1D5DB' },
    colW: [1.4, 1.2, 1.2, 1.2, 3.4]
  });
}

function addNextActionsSlide(pptx: PptxGenJS, data: SlideDeliverable) {
  if (!data.nextActions?.length) return;
  const slide = pptx.addSlide();
  slide.addText('Next Actions', {
    x: 0.8, y: 0.4, w: 8.4, h: 0.6,
    fontSize: 24, fontFace: 'Arial', color: BRAND_COLOR, bold: true
  });

  const bullets = data.nextActions.map((a) => ({
    text: a,
    options: { bullet: true, fontSize: 14 }
  }));

  slide.addText(bullets as PptxGenJS.TextProps[], {
    x: 0.8, y: 1.2, w: 8.4, h: 4.0,
    fontFace: 'Arial', color: TEXT_COLOR, lineSpacingMultiple: 1.5
  });
}

export async function generatePptxBuffer(deliverable: SlideDeliverable): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'Garnet AI';
  pptx.title = deliverable.title || deliverable.campaignName;

  addTitleSlide(pptx, deliverable);
  addSummarySlide(pptx, deliverable);
  addChannelSlide(pptx, deliverable);
  addKpiSlide(pptx, deliverable);
  addTimelineSlide(pptx, deliverable);
  addNextActionsSlide(pptx, deliverable);

  const output = await pptx.write({ outputType: 'nodebuffer' });
  return output as Buffer;
}
