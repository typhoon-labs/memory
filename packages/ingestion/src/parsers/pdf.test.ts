import { describe, expect, it } from 'vitest';
import {
  buildHeadingMap,
  buildHtml,
  detectTableRegions,
  escapeHtml,
  getBodyXBaseline,
  getColumnSignature,
  getFontSize,
  groupIntoLines,
  lineToText,
  roundSize,
  signaturesMatch,
} from './pdf';

function makeItem(str: string, x: number, y: number, fontSize: number) {
  return {
    str,
    transform: [fontSize, 0, 0, fontSize, x, y],
    fontName: 'Arial',
    hasEOL: false,
    width: str.length * fontSize * 0.5,
    height: fontSize,
  };
}

describe('getFontSize', () => {
  it('computes hypot of transform[0] and transform[1]', () => {
    expect(getFontSize([12, 0, 0, 12, 0, 0])).toBe(12);
    expect(getFontSize([10, 0, 0, 10, 0, 0])).toBe(10);
  });

  it('handles rotated transforms', () => {
    const size = getFontSize([3, 4, 0, 0, 0, 0]);
    expect(size).toBe(5); // hypot(3,4)=5
  });
});

describe('roundSize', () => {
  it('rounds to 1 decimal place', () => {
    expect(roundSize(12.34)).toBe(12.3);
    expect(roundSize(12.35)).toBe(12.4);
    expect(roundSize(12)).toBe(12);
  });
});

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });

  it('passes plain text through', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('buildHeadingMap', () => {
  it('identifies body size as most frequent', () => {
    const items = [
      makeItem('Body text that is very long to dominate frequency', 0, 100, 12),
      makeItem('Heading', 0, 200, 18),
    ];
    const map = buildHeadingMap(items);
    expect(map.has(12)).toBe(false); // body size not in heading map
    expect(map.get(18)).toBe('h1');
  });

  it('maps multiple heading sizes in descending order', () => {
    const items = [
      makeItem('Body text that is long enough to be the most frequent font size in document', 0, 100, 10),
      makeItem('H1', 0, 200, 20),
      makeItem('H2', 0, 300, 16),
      makeItem('H3', 0, 400, 13),
    ];
    const map = buildHeadingMap(items);
    expect(map.get(20)).toBe('h1');
    expect(map.get(16)).toBe('h2');
    expect(map.get(13)).toBe('h3');
  });

  it('skips whitespace-only items', () => {
    const items = [makeItem('   ', 0, 100, 50), makeItem('Body text repeated many times to dominate', 0, 200, 12)];
    const map = buildHeadingMap(items);
    expect(map.has(50)).toBe(false);
  });

  it('limits to 6 heading levels', () => {
    const items = [
      makeItem('Body text long enough to be dominant font size in frequency analysis', 0, 0, 10),
      ...Array.from({ length: 8 }, (_, i) => makeItem(`H${i}`, 0, (i + 1) * 100, 20 + i)),
    ];
    const map = buildHeadingMap(items);
    expect(map.size).toBeLessThanOrEqual(6);
  });
});

describe('groupIntoLines', () => {
  it('groups items with similar y into same line', () => {
    const items = [
      makeItem('Hello', 10, 100, 12),
      makeItem('World', 60, 101, 12), // within Y_TOLERANCE=2
    ];
    const lines = groupIntoLines(items);
    expect(lines).toHaveLength(1);
    expect(lines[0].items).toHaveLength(2);
  });

  it('separates items with different y', () => {
    const items = [makeItem('Line 1', 10, 100, 12), makeItem('Line 2', 10, 120, 12)];
    const lines = groupIntoLines(items);
    expect(lines).toHaveLength(2);
  });

  it('sorts items by x within each line', () => {
    const items = [makeItem('Second', 60, 100, 12), makeItem('First', 10, 100, 12)];
    const lines = groupIntoLines(items);
    expect(lines[0].items[0].str).toBe('First');
    expect(lines[0].items[1].str).toBe('Second');
  });

  it('skips whitespace-only items', () => {
    const items = [makeItem('Text', 10, 100, 12), makeItem('   ', 50, 100, 12)];
    const lines = groupIntoLines(items);
    expect(lines[0].items).toHaveLength(1);
  });
});

describe('getBodyXBaseline', () => {
  it('returns most common first-item x among non-heading lines', () => {
    const headingMap = new Map([[18, 'h1']]);
    const lines = [
      { y: 100, items: [{ str: 'Body', x: 72, fontSize: 12, fontName: 'Arial', width: 30 }] },
      { y: 120, items: [{ str: 'Body', x: 72, fontSize: 12, fontName: 'Arial', width: 30 }] },
      { y: 80, items: [{ str: 'Heading', x: 50, fontSize: 18, fontName: 'Arial', width: 50 }] },
    ];
    expect(getBodyXBaseline(lines, headingMap)).toBe(72);
  });

  it('defaults to 60 when no body lines', () => {
    expect(getBodyXBaseline([], new Map())).toBe(60);
  });
});

describe('getColumnSignature', () => {
  it('quantizes x positions to 5px tolerance', () => {
    const line = {
      y: 100,
      items: [
        { str: 'A', x: 72, fontSize: 12, fontName: 'Arial', width: 10 },
        { str: 'B', x: 200, fontSize: 12, fontName: 'Arial', width: 10 },
      ],
    };
    const sig = getColumnSignature(line);
    expect(sig).toEqual([70, 200]); // rounded to nearest 5
  });
});

describe('signaturesMatch', () => {
  it('returns true for matching signatures', () => {
    expect(signaturesMatch([70, 200, 350], [70, 200, 350])).toBe(true);
  });

  it('returns true within tolerance', () => {
    expect(signaturesMatch([70, 200], [73, 202])).toBe(true); // within 5
  });

  it('returns false for different lengths', () => {
    expect(signaturesMatch([70, 200], [70])).toBe(false);
  });

  it('returns false when positions differ beyond tolerance', () => {
    expect(signaturesMatch([70, 200], [70, 210])).toBe(false);
  });
});

describe('detectTableRegions', () => {
  function makeLine(y: number, xs: number[], fontSize = 12) {
    return {
      y,
      items: xs.map((x) => ({ str: `col`, x, fontSize, fontName: 'Arial', width: 30 })),
    };
  }

  it('detects 3+ consecutive lines with same column structure', () => {
    const lines = [makeLine(100, [70, 200]), makeLine(120, [70, 200]), makeLine(140, [70, 200])];
    const result = detectTableRegions(lines, new Map());
    expect(result.size).toBe(3);
  });

  it('requires minimum 2 columns', () => {
    const lines = [makeLine(100, [70]), makeLine(120, [70]), makeLine(140, [70])];
    const result = detectTableRegions(lines, new Map());
    expect(result.size).toBe(0);
  });

  it('requires minimum 3 rows', () => {
    const lines = [makeLine(100, [70, 200]), makeLine(120, [70, 200])];
    const result = detectTableRegions(lines, new Map());
    expect(result.size).toBe(0);
  });

  it('excludes heading lines', () => {
    const headingMap = new Map([[18, 'h1']]);
    const lines = [
      {
        y: 100,
        items: [
          { str: 'A', x: 70, fontSize: 18, fontName: 'Arial', width: 10 },
          { str: 'B', x: 200, fontSize: 18, fontName: 'Arial', width: 10 },
        ],
      },
      makeLine(120, [70, 200]),
      makeLine(140, [70, 200]),
    ];
    const result = detectTableRegions(lines, headingMap);
    expect(result.size).toBe(0); // only 2 non-heading rows, not enough
  });
});

describe('lineToText', () => {
  it('joins items with spaces', () => {
    const line = {
      y: 100,
      items: [
        { str: 'Hello', x: 10, fontSize: 12, fontName: 'Arial', width: 30 },
        { str: 'World', x: 50, fontSize: 12, fontName: 'Arial', width: 30 },
      ],
    };
    expect(lineToText(line)).toBe('Hello World');
  });
});

describe('buildHtml', () => {
  function makeLine(y: number, text: string, fontSize = 12, x = 72) {
    return {
      y,
      items: [{ str: text, x, fontSize, fontName: 'Arial', width: text.length * 6 }],
    };
  }

  it('wraps body text in <p> tags', () => {
    const lines = [makeLine(100, 'Hello world')];
    const html = buildHtml(lines, new Map());
    expect(html).toContain('<p>Hello world</p>');
  });

  it('generates heading tags', () => {
    const headingMap = new Map([[18, 'h1']]);
    const lines = [{ y: 100, items: [{ str: 'Title', x: 72, fontSize: 18, fontName: 'Arial', width: 30 }] }];
    const html = buildHtml(lines, headingMap);
    expect(html).toContain('<h1>Title</h1>');
  });

  it('generates table from multi-column lines', () => {
    function tableRow(y: number) {
      return {
        y,
        items: [
          { str: 'A', x: 70, fontSize: 12, fontName: 'Arial', width: 10 },
          { str: 'B', x: 200, fontSize: 12, fontName: 'Arial', width: 10 },
        ],
      };
    }
    const lines = [tableRow(100), tableRow(120), tableRow(140)];
    const html = buildHtml(lines, new Map());
    expect(html).toContain('<table>');
    expect(html).toContain('<thead>');
    expect(html).toContain('<tbody>');
    expect(html).toContain('<th>');
    expect(html).toContain('<td>');
    expect(html).toContain('</table>');
  });

  it('generates list items for indented bullets', () => {
    const lines = [
      // Body text at x=60 establishes baseline
      makeLine(80, 'Some body text', 12, 60),
      makeLine(100, 'More body text', 12, 60),
      // Indented bullet at x=100 → indent=40 > 15
      { y: 120, items: [{ str: '- Item one', x: 100, fontSize: 12, fontName: 'Arial', width: 60 }] },
    ];
    const html = buildHtml(lines, new Map());
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>');
    expect(html).toContain('Item one');
    expect(html).toContain('</ul>');
  });

  it('escapes HTML in output', () => {
    const lines = [makeLine(100, 'a < b & c > d')];
    const html = buildHtml(lines, new Map());
    expect(html).toContain('&lt;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&gt;');
  });

  it('flushes paragraph on large y gap', () => {
    const lines = [
      makeLine(100, 'Paragraph 1'),
      makeLine(200, 'Paragraph 2'), // gap > 12 * 1.8 = 21.6
    ];
    const html = buildHtml(lines, new Map());
    expect(html).toContain('<p>Paragraph 1</p>');
    expect(html).toContain('<p>Paragraph 2</p>');
  });
});
