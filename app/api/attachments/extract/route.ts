import { NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createOcrJob } from '@/lib/attachment-ocr-jobs';

export const runtime = 'nodejs';
const execFileAsync = promisify(execFile);

type SourceType = 'CSV' | 'JSON' | 'TEXT' | 'XLSX' | 'PDF' | 'DOCX' | 'IMAGE' | 'UNKNOWN';

function detectSourceType(name: string, mimeType: string): SourceType {
  const lower = name.toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'XLSX';
  if (lower.endsWith('.pdf') || mime.includes('application/pdf')) return 'PDF';
  if (
    lower.endsWith('.doc') ||
    lower.endsWith('.docx') ||
    mime.includes('application/msword') ||
    mime.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  )
    return 'DOCX';
  if (mime.startsWith('image/') || /\.(png|jpg|jpeg|webp|bmp|gif|heic)$/i.test(lower)) return 'IMAGE';
  if (lower.endsWith('.csv')) return 'CSV';
  if (lower.endsWith('.json')) return 'JSON';
  if (
    lower.endsWith('.txt') ||
    lower.endsWith('.md') ||
    lower.endsWith('.markdown') ||
    lower.endsWith('.log') ||
    lower.endsWith('.tsv')
  )
    return 'TEXT';
  return 'UNKNOWN';
}

function limitText(text: string, maxChars: number) {
  const compact = String(text || '').replace(/\u0000/g, '').trim();
  if (compact.length <= maxChars) return { content: compact, truncated: false };
  return {
    content: `${compact.slice(0, maxChars)}\n\n[...생략: 원본이 길어 ${maxChars}자까지만 전달됨]`,
    truncated: true
  };
}

function stripHtml(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTablesFromHtml(html: string) {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  const lines: string[] = [];

  tables.slice(0, 8).forEach((table, tableIndex) => {
    const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const renderedRows = rows
      .slice(0, 25)
      .map((row) => {
        const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => stripHtml(String(m[1] || '')));
        return cells.filter(Boolean);
      })
      .filter((cells) => cells.length > 0);

    if (!renderedRows.length) return;
    lines.push(`표 ${tableIndex + 1}`);
    renderedRows.forEach((cells) => {
      lines.push(`| ${cells.join(' | ')} |`);
    });
  });

  return {
    tableCount: tables.length,
    tableText: lines.join('\n')
  };
}

async function extractPdf(buffer: Buffer) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aimd-pdf-'));
  const pdfPath = path.join(tempDir, 'upload.pdf');
  const extractorScriptPath = path.join(process.cwd(), 'scripts', 'extract-pdf.mjs');
  try {
    await writeFile(pdfPath, buffer);
    const { stdout } = await execFileAsync(process.execPath, [extractorScriptPath, pdfPath, '30'], {
      maxBuffer: 16 * 1024 * 1024
    });
    const parsed = JSON.parse(String(stdout || '{}')) as { text?: string; tableText?: string; tableCount?: number };
    const text = String(parsed.text || '');
    const tableText = String(parsed.tableText || '');
    const tableCount = Number(parsed.tableCount || 0);
    const combined = tableText ? `${text}\n\n[표 추출 ${tableCount}개]\n${tableText}` : text;
    return {
      text: combined,
      note: tableText ? `PDF 표 ${tableCount}개를 텍스트로 추출했습니다.` : ''
    };
  } catch {
    const { stdout } = await execFileAsync('strings', [pdfPath], {
      maxBuffer: 16 * 1024 * 1024
    });
    return {
      text: String(stdout || ''),
      note: 'PDF 구조 파싱 실패로 문자열 기반 추출(strings)로 대체했습니다.'
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function extractDocx(buffer: Buffer) {
  const mammoth = (await import('mammoth')) as unknown as {
    extractRawText: (input: { buffer: Buffer }) => Promise<{ value?: string }>;
    convertToHtml: (input: { buffer: Buffer }) => Promise<{ value?: string }>;
  };
  const [result, htmlResult] = await Promise.all([mammoth.extractRawText({ buffer }), mammoth.convertToHtml({ buffer })]);
  const rawText = String(result?.value || '');
  const html = String(htmlResult?.value || '');
  const tableInfo = extractTablesFromHtml(html);
  return {
    text: tableInfo.tableText ? `${rawText}\n\n[표 추출 ${tableInfo.tableCount}개]\n${tableInfo.tableText}` : rawText,
    note: tableInfo.tableCount > 0 ? `DOCX 표 ${tableInfo.tableCount}개를 텍스트로 추출했습니다.` : ''
  };
}

async function extractImageOCR(buffer: Buffer) {
  const tesseract = (await import('tesseract.js')) as unknown as {
    createWorker: (langs?: string) => Promise<{
      recognize: (image: Buffer) => Promise<{ data?: { text?: string } }>;
      terminate: () => Promise<void>;
    }>;
  };
  const worker = await tesseract.createWorker('eng+kor');
  try {
    const recognition = await worker.recognize(buffer);
    return String(recognition?.data?.text || '');
  } finally {
    await worker.terminate();
  }
}

async function readAsText(file: File) {
  return await file.text();
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const maxCharsRaw = String(formData.get('maxChars') || '15000');
    const maxChars = Math.max(2000, Math.min(180000, Number(maxCharsRaw) || 15000));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '파일이 전달되지 않았습니다.' }, { status: 400 });
    }

    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: '파일 용량이 15MB를 초과했습니다.' }, { status: 400 });
    }

    const sourceType = detectSourceType(file.name, file.type || '');
    const mimeType = file.type || 'application/octet-stream';
    const buffer = Buffer.from(await file.arrayBuffer());

    let extracted = '';
    let note = '';

    if (sourceType === 'PDF') {
      const result = await extractPdf(buffer);
      extracted = result.text;
      note = result.note;
    } else if (sourceType === 'DOCX') {
      const result = await extractDocx(buffer);
      extracted = result.text;
      note = result.note;
    } else if (sourceType === 'IMAGE') {
      const job = createOcrJob({
        name: file.name,
        mimeType,
        maxAttempts: 2,
        run: async () => {
          const text = await Promise.race([
            extractImageOCR(buffer),
            new Promise<string>((_, reject) =>
              setTimeout(() => reject(new Error('OCR 처리 시간이 길어 중단되었습니다.')), 35000)
            )
          ]);
          const limited = limitText(text || '', maxChars);
          return {
            content: limited.content,
            note: limited.truncated ? '이미지 OCR 결과가 길어 일부만 반영되었습니다.' : undefined
          };
        }
      });
      return NextResponse.json({
        ok: true,
        queued: true,
        jobId: job.id,
        name: file.name,
        mimeType,
        sourceType,
        note: '이미지 OCR 큐에 등록했습니다. 완료까지 잠시 대기해 주세요.'
      });
    } else if (sourceType === 'XLSX') {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
      extracted = firstSheet ? XLSX.utils.sheet_to_csv(firstSheet, { blankrows: false }) : '';
      note = firstSheetName
        ? `엑셀 첫 시트(${firstSheetName})를 반영했습니다.${workbook.SheetNames.length > 1 ? ` (총 ${workbook.SheetNames.length}개 시트)` : ''}`
        : '엑셀 시트를 찾지 못했습니다.';
    } else {
      extracted = await readAsText(file);
    }

    const limited = limitText(extracted || '(추출된 내용 없음)', maxChars);
    if (limited.truncated) {
      note = note ? `${note} / 내용이 길어 일부만 반영되었습니다.` : '내용이 길어 일부만 반영되었습니다.';
    }

    return NextResponse.json({
      ok: true,
      name: file.name,
      mimeType,
      sourceType,
      content: limited.content,
      note: note || undefined
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : '파일 분석 실패' },
      { status: 500 }
    );
  }
}
