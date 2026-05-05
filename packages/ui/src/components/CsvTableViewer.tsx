import type React from 'react';
import { useMemo } from 'react';

// ── CSV parsing ────────────────────────────────────────────────

/** Parse a single CSV row, handling quoted fields with commas and escaped quotes. */
export function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

export function parseCsv(text: string): string[][] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map(parseCsvRow);
}

/** Pad or trim all rows to match the column count of the header row. */
export function normalizeRows(rows: string[][]): string[][] {
  if (rows.length === 0) return rows;
  const colCount = rows[0].length;
  return rows.map((row) => {
    if (row.length === colCount) return row;
    if (row.length < colCount) return [...row, ...Array<string>(colCount - row.length).fill('')];
    return row.slice(0, colCount);
  });
}

// ── Search highlighting ────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text: string, terms: string[]): React.ReactNode {
  if (!terms.length) return text;
  const pattern = new RegExp(terms.map(escapeRegex).join('|'), 'gi');
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > lastIndex) nodes.push(text.slice(lastIndex, m.index));
    nodes.push(
      <mark key={`h${m.index}`} className="search-match rounded-sm bg-primary/10 text-inherit">
        {m[0]}
      </mark>,
    );
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length > 0 ? nodes : text;
}

// ── Table component ────────────────────────────────────────────

function CsvSheet({ rows, searchTerms }: { rows: string[][]; searchTerms: string[] }) {
  if (rows.length === 0) return null;

  const normalized = normalizeRows(rows);
  const [header, ...body] = normalized;

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-muted">
          <tr>
            {header.map((cell, i) => (
              <th
                // biome-ignore lint/suspicious/noArrayIndexKey: static CSV columns don't reorder
                key={i}
                className="whitespace-nowrap border-r border-border px-4 py-2 text-left text-[0.8125rem] font-semibold last:border-r-0"
              >
                {highlightText(cell, searchTerms)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static CSV rows don't reorder
            <tr key={ri}>
              {row.map((cell, ci) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static CSV cells don't reorder
                <td key={ci} className="border-t border-r border-border px-4 py-2 text-sm last:border-r-0">
                  {highlightText(cell, searchTerms)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Renders CSV or multi-sheet XLSX content as formatted table(s). */
export function CsvTableViewer({ text, searchTerms = [] }: { text: string; searchTerms?: string[] }) {
  const sheets = useMemo(() => {
    // Multi-sheet XLSX format: "## Sheet: Name\n\ncsv_data"
    const sheetMarker = /^## Sheet: (.+)$/gm;
    const markers: { name: string; markerIndex: number; dataStart: number }[] = [];
    let match: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
    while ((match = sheetMarker.exec(text)) !== null) {
      markers.push({
        name: match[1],
        markerIndex: match.index,
        dataStart: match.index + match[0].length,
      });
    }

    if (markers.length === 0) {
      return [{ name: null, rows: parseCsv(text) }];
    }

    return markers.map((marker, i) => {
      const end = i + 1 < markers.length ? markers[i + 1].markerIndex : text.length;
      const csv = text.slice(marker.dataStart, end).trim();
      return { name: marker.name, rows: parseCsv(csv) };
    });
  }, [text]);

  return (
    <div className="space-y-6">
      {sheets.map((sheet, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static sheet list doesn't reorder
        <div key={i}>
          {sheet.name && <h2 className="mb-2 text-base font-semibold">{sheet.name}</h2>}
          <CsvSheet rows={sheet.rows} searchTerms={searchTerms} />
        </div>
      ))}
    </div>
  );
}
