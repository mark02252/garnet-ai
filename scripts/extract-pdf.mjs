import { readFile } from 'node:fs/promises';
import { PDFParse } from 'pdf-parse';

function sanitizeCell(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderTable(tableRows, tableIndex) {
  if (!Array.isArray(tableRows)) return '';
  const rows = tableRows
    .map((row) => (Array.isArray(row) ? row.map(sanitizeCell).filter(Boolean) : []))
    .filter((row) => row.length > 0)
    .slice(0, 20);
  if (!rows.length) return '';
  return [`표 ${tableIndex + 1}`, ...rows.map((cells) => `| ${cells.join(' | ')} |`)].join('\n');
}

async function main() {
  const pdfPath = process.argv[2];
  const maxPages = Math.max(1, Math.min(60, Number(process.argv[3] || '30') || 30));
  if (!pdfPath) {
    process.stdout.write(JSON.stringify({ text: '', tableText: '', tableCount: 0 }));
    return;
  }

  const buffer = await readFile(pdfPath);
  const parser = new PDFParse({ data: buffer });
  const textResult = await parser.getText({ first: maxPages });
  let tableText = '';
  let tableCount = 0;

  try {
    const tableResult = await parser.getTable({ first: maxPages });
    const rendered = [];
    const pages = Array.isArray(tableResult?.pages) ? tableResult.pages : [];
    pages.slice(0, maxPages).forEach((page) => {
      const tables = Array.isArray(page?.tables) ? page.tables : [];
      tables.forEach((table) => {
        const output = renderTable(table, tableCount);
        if (output) {
          rendered.push(output);
          tableCount += 1;
        }
      });
    });
    tableText = rendered.join('\n\n');
  } catch {
    tableText = '';
    tableCount = 0;
  }

  await parser.destroy();
  process.stdout.write(
    JSON.stringify({
      text: String(textResult?.text || ''),
      tableText,
      tableCount
    })
  );
}

main().catch((error) => {
  process.stderr.write(String(error?.message || error));
  process.exit(1);
});
