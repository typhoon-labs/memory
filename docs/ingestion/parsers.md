# Document Parsers

## Overview

Binary and markup formats are converted to plain text (typically markdown) before chunking. Plain text, markdown, and JSON are passed directly to Mastra's `MDocument` without custom parsing.

The parser for a given file is selected by `getParser(filename)` from the parser registry. The `needsCustomParser(filename)` check determines whether a file needs custom parsing or can be passed through as-is.

## Parser Table

| Format              | Parser Library                   | Output Format | MDocument Method           |
| ------------------- | -------------------------------- | ------------- | -------------------------- |
| PDF                 | `unpdf` + spatial analysis       | Markdown      | `MDocument.fromMarkdown()` |
| DOCX                | `mammoth` to HTML, then turndown | Markdown      | `MDocument.fromMarkdown()` |
| XLSX                | SheetJS to CSV                   | Text          | `MDocument.fromText()`     |
| HTML (.html/.htm)   | turndown + GFM tables            | Markdown      | `MDocument.fromMarkdown()` |
| Markdown (.md/.mdx) | Native (no parsing)              | Markdown      | `MDocument.fromMarkdown()` |
| Plain text          | Native (no parsing)              | Text          | `MDocument.fromText()`     |
| JSON                | Native (no parsing)              | JSON          | `MDocument.fromJSON()`     |

## Parser Details

### PDF

Uses the `unpdf` library with spatial analysis to detect document structure:

- **Headings** are inferred from font size and weight.
- **Tables** are reconstructed from spatial positioning of text blocks.
- **Lists** are detected from indentation and bullet/number patterns.

The output is markdown with proper heading hierarchy, markdown tables, and list formatting.

### DOCX

Two-stage conversion:

1. **mammoth** converts DOCX to HTML, preserving semantic structure (headings, tables, lists, bold/italic).
2. **turndown** converts the HTML to markdown with the GFM tables plugin enabled for proper table formatting.

### XLSX

Uses SheetJS to read the spreadsheet and convert each sheet to CSV format. The CSV text is then passed to `MDocument.fromText()` for sentence-based chunking.

### HTML

Uses turndown with the GFM tables plugin to convert HTML to clean markdown. The turndown configuration preserves heading hierarchy (h1 through h6) and converts HTML tables to GitHub Flavored Markdown table syntax.

### Markdown / MDX

Passed directly to `MDocument.fromMarkdown()` with no transformation. MDX files (`.mdx`) are treated the same as standard markdown.

### JSON

The raw JSON string is passed to `MDocument.fromJSON()`, which handles token-based chunking of the JSON structure.

### Plain Text

The raw UTF-8 text is passed to `MDocument.fromText()` for sentence-based chunking.

## Parser Registry

The parser registry (`packages/ingestion/src/parsers/registry.ts`) maps file extensions to parser functions and `MDocument` format identifiers:

- `needsCustomParser(filename)` -- returns `true` for PDF, DOCX, XLSX, and HTML files that require binary or markup parsing.
- `getParser(filename)` -- returns the parser function for a given filename, or `null` if no custom parser is registered.
- `getMDocFormat(filename)` -- returns the `MDocument` format (`'text'`, `'html'`, `'markdown'`, `'json'`) for files that do not need custom parsing.

## Key Files

- `packages/ingestion/src/parsers/registry.ts` -- parser registry and format detection
- `packages/ingestion/src/parsers/pdf.ts` -- PDF parser
- `packages/ingestion/src/parsers/docx.ts` -- DOCX parser
- `packages/ingestion/src/parsers/xlsx.ts` -- XLSX parser
- `packages/ingestion/src/parsers/html.ts` -- HTML parser
