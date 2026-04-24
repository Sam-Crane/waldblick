// Tiny markdown renderer — no deps, covers the subset foresters actually
// use when writing observation descriptions:
//
//   **bold** / __bold__
//   *italic* / _italic_
//   `inline code` (for GPS coords / plot IDs)
//   - or * list items, blank-line-separated paragraphs
//   ## heading (line starting with 1-6 hashes)
//
// Deliberately omitting: images, links, tables, code blocks. If the user
// wants any of those, the raw paste is preserved and legible anyway.
//
// Input is escaped before parsing, so we never inject raw HTML from user
// content. Output is a DOM tree React can render.

import { Fragment, type ReactNode } from 'react';

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Inline formatters applied inside a single line.
function renderInline(line: string): ReactNode[] {
  const parts: ReactNode[] = [];
  // Single-pass regex picking out bold/italic/code spans; everything
  // between falls through as plain text. Order matters: bold before italic
  // because **x** looks like nested italics.
  const pattern = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*]+)\*|_([^_]+)_)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(line)) !== null) {
    if (match.index > last) parts.push(line.slice(last, match.index));
    const [, , b1, b2, code, i1, i2] = match;
    if (b1 ?? b2) parts.push(<strong key={`b${i}`}>{b1 ?? b2}</strong>);
    else if (code) parts.push(<code key={`c${i}`} className="rounded bg-surface-container px-1 font-mono text-[13px]">{code}</code>);
    else if (i1 ?? i2) parts.push(<em key={`i${i}`}>{i1 ?? i2}</em>);
    last = match.index + match[0].length;
    i++;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts.length > 0 ? parts : [line];
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'p'; text: string };

function parse(src: string): Block[] {
  const lines = escape(src).split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    // Heading
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      blocks.push({ kind: 'heading', level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    // Bullet list — consume consecutive bullet lines.
    if (/^[*-]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[*-]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[*-]\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'list', items });
      continue;
    }
    // Paragraph — join consecutive non-blank, non-structural lines.
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^[*-]\s+/.test(lines[i]) &&
      !/^#{1,6}\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ kind: 'p', text: paraLines.join(' ') });
  }
  return blocks;
}

export default function MarkdownText({
  source,
  className = '',
}: {
  source: string;
  className?: string;
}) {
  if (!source) return null;
  const blocks = parse(source);

  return (
    <div className={`space-y-2 text-body-md leading-relaxed ${className}`}>
      {blocks.map((b, idx) => {
        if (b.kind === 'heading') {
          const sizeClass =
            b.level === 1
              ? 'text-headline-md font-bold'
              : b.level === 2
                ? 'text-body-lg font-bold'
                : 'text-body-md font-bold';
          return (
            <div key={idx} className={sizeClass}>
              {renderInline(b.text)}
            </div>
          );
        }
        if (b.kind === 'list') {
          return (
            <ul key={idx} className="list-inside list-disc space-y-1 pl-2">
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={idx}>
            {renderInline(b.text).map((n, j) => (
              <Fragment key={j}>{n}</Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
