import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('xlsx', () => ({
  read: vi.fn(),
  utils: {
    sheet_to_csv: vi.fn(),
  },
}));

describe('parseXlsx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns ParseResult with text format and title metadata', async () => {
    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    });
    vi.mocked(XLSX.utils.sheet_to_csv).mockReturnValue('col1,col2\nval1,val2');

    const { parseXlsx } = await import('./xlsx');
    const result = await parseXlsx(Buffer.from('fake'), 'data.xlsx');

    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('format', 'text');
    expect(result).toHaveProperty('metadata');
    expect(result.metadata.title).toBe('data.xlsx');
  });

  it('includes sheet name as a markdown heading in the output', async () => {
    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    });
    vi.mocked(XLSX.utils.sheet_to_csv).mockReturnValue('a,b\n1,2');

    const { parseXlsx } = await import('./xlsx');
    const result = await parseXlsx(Buffer.from('fake'), 'data.xlsx');

    expect(result.text).toContain('## Sheet: Sheet1');
  });

  it('includes CSV content from the sheet in the output', async () => {
    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: {} },
    });
    vi.mocked(XLSX.utils.sheet_to_csv).mockReturnValue('Name,Age\nAlice,30\nBob,25');

    const { parseXlsx } = await import('./xlsx');
    const result = await parseXlsx(Buffer.from('fake'), 'data.xlsx');

    expect(result.text).toContain('Name,Age');
    expect(result.text).toContain('Alice,30');
    expect(result.text).toContain('Bob,25');
  });

  it('handles multi-sheet workbooks — includes content from all sheets', async () => {
    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Summary', 'Details'],
      Sheets: { Summary: {}, Details: {} },
    });
    vi.mocked(XLSX.utils.sheet_to_csv).mockReturnValueOnce('Total,100').mockReturnValueOnce('Row1,Row2');

    const { parseXlsx } = await import('./xlsx');
    const result = await parseXlsx(Buffer.from('fake'), 'report.xlsx');

    expect(result.text).toContain('## Sheet: Summary');
    expect(result.text).toContain('Total,100');
    expect(result.text).toContain('## Sheet: Details');
    expect(result.text).toContain('Row1,Row2');
  });

  it('separates multiple sheet sections with double newlines', async () => {
    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['A', 'B'],
      Sheets: { A: {}, B: {} },
    });
    vi.mocked(XLSX.utils.sheet_to_csv).mockReturnValue('data');

    const { parseXlsx } = await import('./xlsx');
    const result = await parseXlsx(Buffer.from('fake'), 'data.xlsx');

    expect(result.text).toContain('\n\n');
  });

  it('calls XLSX.read with the buffer and type:"buffer"', async () => {
    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({ SheetNames: [], Sheets: {} });

    const { parseXlsx } = await import('./xlsx');
    const buffer = Buffer.from('fake xlsx bytes');
    await parseXlsx(buffer, 'file.xlsx');

    expect(XLSX.read).toHaveBeenCalledWith(buffer, { type: 'buffer' });
  });

  it('returns empty text for a workbook with no sheets', async () => {
    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({ SheetNames: [], Sheets: {} });

    const { parseXlsx } = await import('./xlsx');
    const result = await parseXlsx(Buffer.from('empty'), 'empty.xlsx');

    expect(result.text).toBe('');
    expect(result.format).toBe('text');
  });

  it('skips sheets whose worksheet object is undefined', async () => {
    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Missing', 'Present'],
      // Missing is intentionally absent from Sheets
      Sheets: { Present: {} },
    });
    vi.mocked(XLSX.utils.sheet_to_csv).mockReturnValue('real,data');

    const { parseXlsx } = await import('./xlsx');
    const result = await parseXlsx(Buffer.from('fake'), 'data.xlsx');

    expect(result.text).not.toContain('## Sheet: Missing');
    expect(result.text).toContain('## Sheet: Present');
  });

  it('includes numeric cell values in the CSV output', async () => {
    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Numbers'],
      Sheets: { Numbers: {} },
    });
    vi.mocked(XLSX.utils.sheet_to_csv).mockReturnValue('Price,Qty\n9.99,100\n4.50,250');

    const { parseXlsx } = await import('./xlsx');
    const result = await parseXlsx(Buffer.from('fake'), 'prices.xlsx');

    expect(result.text).toContain('9.99');
    expect(result.text).toContain('100');
    expect(result.text).toContain('4.50');
  });

  it('handles special characters in cell values without crashing', async () => {
    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({
      SheetNames: ['Special'],
      Sheets: { Special: {} },
    });
    vi.mocked(XLSX.utils.sheet_to_csv).mockReturnValue('"Hello, world","Line\nbreak","<tag>&amp;"');

    const { parseXlsx } = await import('./xlsx');
    await expect(parseXlsx(Buffer.from('fake'), 'special.xlsx')).resolves.not.toThrow();
  });

  it('uses the filename as the metadata title', async () => {
    const XLSX = await import('xlsx');
    vi.mocked(XLSX.read).mockReturnValue({ SheetNames: [], Sheets: {} });

    const { parseXlsx } = await import('./xlsx');
    const result = await parseXlsx(Buffer.from('fake'), 'quarterly-report.xlsx');

    expect(result.metadata.title).toBe('quarterly-report.xlsx');
  });
});
