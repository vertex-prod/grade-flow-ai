/**
 * Accuracy checks for class details (school, adviser, section, school year, grade level...) that the AI reads from a sheet.
 * The model can misread or invent a name, so every short text value it returns is checked against the sheet's own cells, and
 * labelled cells such as "School Year: 2024-2025" are read by code. Same idea as the grade check: the sheet is the source of truth.
 */
import type { Grid } from '@/server/import/extract';

export const norm = (v: unknown) => String(v ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export interface SheetText { phrases: string; words: Set<string> }

export function sheetText(grid: Grid): SheetText {
  const parts = grid.rows.flatMap((row) => row.map(norm).filter(Boolean));
  return { phrases: ` ${parts.join(' | ')} `, words: new Set(parts.flatMap((p) => p.split(' '))) };
}

/** True when the value is written in the sheet: as a phrase, or (when joined from several cells) every word of it is. */
export function appears(value: unknown, text: SheetText): boolean {
  const n = norm(value);
  if (!n) return false;
  if (text.phrases.includes(` ${n} `)) return true;
  const words = n.split(' ');
  return words.every((w) => text.words.has(w));
}

/** "SY 2024 - 2025", "2024-25", "2024/2025" -> "2024-2025". Empty when it is not a school year. */
export function normSy(value: unknown): string {
  const m = /(?<!\d)(20\d{2})\s*(?:[-–—/]|to)\s*(20)?(\d{2})(?!\d)/i.exec(String(value ?? ''));
  if (!m) return '';
  const start = Number(m[1]);
  const end = Number(`${m[2] ?? String(start).slice(0, 2)}${m[3]}`);
  return end === start + 1 ? `${start}-${end}` : '';
}

const ROMAN: Record<string, string> = { xi: '11', xii: '12', x: '10' };
/** "Grade 12", "G-12", "XII" -> "12". Empty when no grade number can be found. */
export function normGrade(value: unknown): string {
  const t = String(value ?? '').trim().toLowerCase();
  const d = /(?<!\d)(\d{1,2})(?!\d)/.exec(t);
  if (d) return String(Number(d[1]));
  const r = /\b(xii|xi|x)\b/.exec(t);
  return r ? ROMAN[r[1]] : '';
}

/** "1st", "First semester", "2" -> "1" or "2". */
export function normSem(value: unknown): string {
  const t = String(value ?? '').trim().toLowerCase();
  if (/\b(1|1st|first|i)\b/.test(t)) return '1';
  if (/\b(2|2nd|second|ii)\b/.test(t)) return '2';
  return '';
}

const LABELS: [string, RegExp][] = [
  ['year', /^(?:school\s*year|s\.?\s?y\.?|academic\s*year|a\.?\s?y\.?)$/],
  ['teacher', /^(?:class\s*)?(?:adviser|advisor)(?:\s*name)?$/],
  ['principal', /^(?:school\s*)?(?:principal|head)(?:\s*name)?$|^school\s*head$/],
  ['section', /^section(?:\s*name)?$/],
  ['gradeLevel', /^grade(?:\s*level)?$|^year\s*level$/],
  ['strand', /^strand$/],
  ['track', /^track(?:\s*(?:\/|and|&)\s*strand)?$/],
  ['schoolName', /^(?:name\s*of\s*)?school(?:\s*name)?$/],
  ['region', /^region$/],
  ['division', /^division$/],
  ['schoolAddress', /^(?:school\s*)?address$/]
];

/**
 * Values the sheet states with a label ("Adviser: MS. GALLO", or the label in one cell and the value in the next).
 * Only the title area is searched, so a learner's own cells are never mistaken for class details.
 */
export function readLabels(grid: Grid, maxRows = 25): Record<string, string> {
  const found: Record<string, string> = {};
  const put = (label: string, value: string) => {
    const v = value.trim();
    if (!v) return;
    const key = LABELS.find(([, re]) => re.test(label.toLowerCase().replace(/[:.]+$/, '').replace(/\s+/g, ' ').trim()))?.[0];
    if (key && !found[key]) found[key] = v;
  };
  grid.rows.slice(0, maxRows).forEach((row) => {
    row.forEach((cell, i) => {
      const t = String(cell ?? '').trim();
      if (!t) return;
      const inline = /^([^:]{2,30}):\s*(.+)$/.exec(t);
      if (inline) { put(inline[1], inline[2]); return; }
      if (t.endsWith(':')) { // only an explicit "Label:" claims the next cell
        const next = row.slice(i + 1).map((c) => String(c ?? '').trim()).find(Boolean);
        if (next) put(t, next);
      }
    });
  });
  return found;
}

/** Fields compared by meaning, not by wording. */
function canonical(key: string, value: string): string {
  if (key === 'year') return normSy(value);
  if (key === 'gradeLevel') return normGrade(value);
  return value.trim();
}

/**
 * Class details = what the AI read, checked against the sheet, plus labelled cells read by code.
 * A value the sheet does not contain is dropped; when the AI and the label disagree the label (the sheet's own text) wins.
 */
export function verifyClassDetails(ai: Record<string, string>, grid: Grid): { details: Record<string, string>; warnings: string[] } {
  const text = sheetText(grid);
  const labels = readLabels(grid);
  const details: Record<string, string> = {};
  const warnings: string[] = [];
  for (const [key, raw] of Object.entries(ai)) {
    const value = canonical(key, raw);
    if (!value) { warnings.push(`Class detail "${key}": '${raw.slice(0, 40)}' is not a valid value; left unchanged.`); continue; }
    // year and grade level are rewritten to a standard form, so check what the sheet actually shows
    const ok = key === 'year' ? appears(value.split('-')[0], text) : key === 'gradeLevel' ? appears(value, text) || appears(raw, text) : appears(value, text);
    if (!ok) { warnings.push(`Class detail "${key}": '${raw.slice(0, 40)}' was not found in the sheet; left unchanged.`); continue; }
    details[key] = value;
  }
  for (const [key, raw] of Object.entries(labels)) {
    const value = canonical(key, raw);
    if (!value) continue;
    if (details[key] && norm(details[key]) !== norm(value)) warnings.push(`Class detail "${key}": the AI read '${details[key].slice(0, 40)}' but the sheet says '${value.slice(0, 40)}'. Used the sheet's text.`);
    details[key] = value;
  }
  return { details, warnings };
}

/** For free-form text on a record (school, adviser, section...): keep it only when the sheet contains it. */
export function checkedText(value: unknown, text: SheetText, where: string, warnings: string[], limit = 120): string {
  const t = String(value ?? '').trim().slice(0, limit);
  if (!t) return '';
  if (!appears(t, text)) { warnings.push(`${where}: '${t.slice(0, 40)}' was not found in the sheet; left blank.`); return ''; }
  return t;
}
