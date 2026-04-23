import type { ParseResult } from './registry';

export async function parseXlsx(buffer: Buffer, filename: string): Promise<ParseResult> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sections: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet);
    sections.push(`## Sheet: ${sheetName}\n\n${csv}`);
  }

  return {
    text: sections.join('\n\n'),
    format: 'text',
    metadata: {
      title: filename,
    },
  };
}
