import de from './de.json';
import en from './en.json';

type Dict = typeof de;
type Lang = 'de' | 'en';

const dicts: Record<Lang, Dict> = { de, en };

// Detect once at module load. Browser locale → de if anything German, else en.
const detected: Lang = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en';

let current: Lang = detected;

function get(obj: unknown, path: string): string {
  const parts = path.split('.');
  let node: unknown = obj;
  for (const p of parts) {
    if (node && typeof node === 'object' && p in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[p];
    } else {
      return path;
    }
  }
  return typeof node === 'string' ? node : path;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export function t(key: string, vars?: Record<string, string | number>): string {
  return interpolate(get(dicts[current], key), vars);
}

export function setLang(lang: Lang) {
  current = lang;
}

export function useTranslation() {
  return t;
}
