import type { RefObject } from 'react';
import { useTranslation } from '@/i18n';

type Action = 'bold' | 'italic' | 'bullet' | 'heading';

// Minimal format buttons sitting above a textarea. Wraps or prepends the
// Markdown delimiters around the current selection. Modifies the textarea's
// value via its ref + an onChange handler so the component stays controlled.
export default function MarkdownToolbar({
  textareaRef,
  value,
  onChange,
}: {
  textareaRef: RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (next: string) => void;
}) {
  const t = useTranslation();

  const apply = (action: Action) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end);

    let before = value.slice(0, start);
    let insert = '';
    let after = value.slice(end);
    let cursorOffset = 0;

    switch (action) {
      case 'bold':
        insert = `**${selected || 'Fett'}**`;
        cursorOffset = selected ? insert.length : 2 + 'Fett'.length;
        break;
      case 'italic':
        insert = `*${selected || 'kursiv'}*`;
        cursorOffset = selected ? insert.length : 1 + 'kursiv'.length;
        break;
      case 'bullet': {
        // Prepend "- " to the current line(s) in the selection.
        const lineStart = before.lastIndexOf('\n') + 1;
        before = value.slice(0, lineStart);
        const block = value.slice(lineStart, end);
        const prefixed = block
          .split('\n')
          .map((ln) => (ln.length > 0 ? `- ${ln}` : ln))
          .join('\n');
        insert = prefixed;
        after = value.slice(end);
        cursorOffset = insert.length;
        break;
      }
      case 'heading': {
        const lineStart = before.lastIndexOf('\n') + 1;
        before = value.slice(0, lineStart);
        const line = value.slice(lineStart, end);
        insert = line.startsWith('## ') ? line : `## ${line}`;
        cursorOffset = insert.length;
        break;
      }
    }

    const next = before + insert + after;
    onChange(next);
    // Restore focus + cursor on next tick.
    requestAnimationFrame(() => {
      const newPos = before.length + cursorOffset;
      el.focus();
      el.setSelectionRange(newPos, newPos);
    });
  };

  const btn = (label: string, icon: string, action: Action) => (
    <button
      type="button"
      onClick={() => apply(action)}
      aria-label={label}
      className="touch-safe flex items-center justify-center rounded-md hover:bg-surface-container"
    >
      <span className="material-symbols-outlined text-[18px] text-primary-container">{icon}</span>
    </button>
  );

  return (
    <div className="flex items-center gap-1 rounded-t-md border-b border-outline-variant bg-surface-container-low px-2 py-1">
      {btn(t('markdown.bold'), 'format_bold', 'bold')}
      {btn(t('markdown.italic'), 'format_italic', 'italic')}
      {btn(t('markdown.bullet'), 'format_list_bulleted', 'bullet')}
      {btn(t('markdown.heading'), 'title', 'heading')}
    </div>
  );
}
