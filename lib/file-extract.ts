export type ExtractedFilePayload = {
  name: string;
  mimeType: string;
  content: string;
  sourceType: 'CSV' | 'JSON' | 'TEXT' | 'XLSX' | 'PDF' | 'DOCX' | 'IMAGE' | 'UNKNOWN';
  note?: string;
};

function limitText(text: string, maxChars: number) {
  const compact = text.replace(/\u0000/g, '').trim();
  if (compact.length <= maxChars) {
    return { content: compact, truncated: false };
  }
  return {
    content: `${compact.slice(0, maxChars)}\n\n[...생략: 원본이 길어 ${maxChars}자까지만 전달됨]`,
    truncated: true
  };
}

function detectSourceType(fileName: string): ExtractedFilePayload['sourceType'] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'XLSX';
  if (lower.endsWith('.pdf')) return 'PDF';
  if (lower.endsWith('.doc') || lower.endsWith('.docx')) return 'DOCX';
  if (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.bmp') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.heic')
  )
    return 'IMAGE';
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

async function extractViaServer(file: File, maxChars: number): Promise<ExtractedFilePayload> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const pollQueuedJob = async (jobId: string, sourceType: ExtractedFilePayload['sourceType']) => {
    const maxPoll = 45;
    for (let i = 0; i < maxPoll; i += 1) {
      await sleep(1200);
      const statusRes = await fetch(`/api/attachments/extract/status/${jobId}`, { method: 'GET' });
      const statusPayload = await statusRes.json();
      if (statusRes.ok && statusPayload?.status === 'completed') {
        return {
          name: String(statusPayload.name || file.name),
          mimeType: String(statusPayload.mimeType || file.type || 'application/octet-stream'),
          content: String(statusPayload.content || ''),
          sourceType: (statusPayload.sourceType || sourceType) as ExtractedFilePayload['sourceType'],
          note: typeof statusPayload.note === 'string' ? statusPayload.note : undefined
        } satisfies ExtractedFilePayload;
      }
      if (statusPayload?.status === 'failed') {
        throw new Error(typeof statusPayload?.error === 'string' ? statusPayload.error : 'OCR 작업이 실패했습니다.');
      }
    }
    throw new Error('OCR 작업 대기 시간이 초과되었습니다. 다시 시도해 주세요.');
  };

  const formData = new FormData();
  formData.append('file', file);
  formData.append('maxChars', String(maxChars));
  const res = await fetch('/api/attachments/extract', {
    method: 'POST',
    body: formData
  });
  const payload = await res.json();
  if (!res.ok) {
    const errorMessage = typeof payload?.error === 'string' ? payload.error : '서버 파일 분석에 실패했습니다.';
    throw new Error(errorMessage);
  }

  if (payload?.queued && typeof payload.jobId === 'string' && payload.jobId) {
    const queuedSourceType = (payload.sourceType || detectSourceType(file.name)) as ExtractedFilePayload['sourceType'];
    const completed = await pollQueuedJob(payload.jobId, queuedSourceType);
    if (payload.note && !completed.note) {
      completed.note = String(payload.note);
    }
    return completed;
  }

  return {
    name: String(payload.name || file.name),
    mimeType: String(payload.mimeType || file.type || 'application/octet-stream'),
    content: String(payload.content || ''),
    sourceType: (payload.sourceType || detectSourceType(file.name)) as ExtractedFilePayload['sourceType'],
    note: typeof payload.note === 'string' ? payload.note : undefined
  };
}

export async function extractFilePayload(file: File, maxChars = 15000): Promise<ExtractedFilePayload> {
  const sourceType = detectSourceType(file.name);

  if (sourceType === 'PDF' || sourceType === 'DOCX' || sourceType === 'IMAGE') {
    try {
      return await extractViaServer(file, maxChars);
    } catch (error) {
      return {
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        content: `파일명: ${file.name}\n원문 추출 실패로 본문 대신 메타데이터만 반영되었습니다.`,
        sourceType,
        note: error instanceof Error ? error.message : '파일 추출 실패'
      };
    }
  }

  if (sourceType === 'XLSX') {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
    const csv = firstSheet ? XLSX.utils.sheet_to_csv(firstSheet, { blankrows: false }) : '';
    const limited = limitText(csv || '(빈 시트)', maxChars);
    const totalSheets = workbook.SheetNames.length;

    return {
      name: file.name,
      mimeType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      content: limited.content,
      sourceType,
      note: limited.truncated
        ? `엑셀(${firstSheetName || '시트1'}) 내용이 길어 일부만 반영되었습니다.`
        : `엑셀 첫 시트(${firstSheetName || '시트1'})를 텍스트로 변환했습니다.${totalSheets > 1 ? ` (총 ${totalSheets}개 시트)` : ''}`
    };
  }

  const text = await file.text();
  const limited = limitText(text, maxChars);
  return {
    name: file.name,
    mimeType: file.type || 'text/plain',
    content: limited.content,
    sourceType,
    note: limited.truncated ? '파일 원본이 길어 일부만 반영되었습니다.' : undefined
  };
}
