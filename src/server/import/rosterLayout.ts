/**
 * Reads the layout of a school grading workbook ("roster mode") with plain code, no AI.
 * Learners are rows; each subject is a block of Q1 / Q2 / FINAL columns with the subject name and
 * grade level written above it. Because every column is found from the header text itself, a sheet with
 * hundreds of columns is mapped exactly, and nothing depends on a model counting column letters.
 * Returns null when the headers are not recognised; the caller then falls back to the AI mapping.
 */
import { colLetter, type Grid } from '@/server/import/extract';

type Raw = Record<string, unknown>;

const txt = (row: unknown[] | undefined, c: number) => (row && c >= 0 && c < row.length ? String(row[c] ?? '').replace(/\s+/g, ' ').trim() : '');

const LEARNER_FIELDS: [string, RegExp][] = [
  ['lastName', /^(last|sur|family)\s*name$|^surname$/i],
  ['firstName', /^(first|given)\s*name$/i],
  ['middleName', /^middle\s*name$/i],
  ['name', /^(student\s*|learner\s*|full\s*)?name$/i],
  ['lrn', /^lrn$|learner'?s?\s*reference/i],
  ['sex', /^(gender|sex)$/i],
  ['birthdate', /^birth\s*date|^birthday|date\s*of\s*birth|^dob$/i],
  ['section11', /grade\s*11.*section|section.*grade\s*11/i],
  ['section12', /grade\s*12.*section|section.*grade\s*12/i],
  ['section', /^section$/i],
  ['adviser', /^(class\s*)?advis[eo]r$/i],
  ['strand', /^(course\s*\/\s*)?strand$|^course\s*\/\s*strand$|^track(\s*\/\s*strand)?$/i],
  ['jhsSchool', /jhs\s*school|junior\s*high\s*school/i],
  ['jhsAverage', /jhs\s*(gen(eral)?\s*)?ave/i]
];

const LEVEL = /grade\s*(11|12)\b|^g\s*(11|12)$|^(11|12)$/i;
const CODE = /^([A-Za-z]{2,4})\s*0*(\d{1,3})\b\s*[-–:]?\s*(.*)$/;
const Q1 = /^(q\s*1|1st(\s*q(uarter)?)?|1st\s*quarter)$/i;
const Q2 = /^(q\s*2|2nd(\s*q(uarter)?)?|2nd\s*quarter)$/i;
const FINAL = /^final(\s*grade)?$/i;

interface Triple { q1: number; q2: number; final: number }

export function detectRosterLayout(grid: Grid): Raw | null {
  const rows = grid.rows;
  const warnings: string[] = [];

  // 1. The header row: the row (near the top) holding the most FINAL cells.
  let head = -1, best = 0;
  rows.slice(0, 25).forEach((row, r) => {
    const n = row.filter((c) => FINAL.test(String(c).trim())).length;
    if (n > best) { best = n; head = r; }
  });
  if (head < 0 || best < 1) return null;

  // 2. Each FINAL column ends one subject block; Q1 / Q2 must sit directly to its left, as printed in the header.
  const triples: Triple[] = [];
  rows[head].forEach((c, col) => {
    if (!FINAL.test(String(c).trim())) return;
    const q2 = col >= 1 && Q2.test(txt(rows[head], col - 1)) ? col - 1 : -1;
    const q1 = q2 >= 1 && Q1.test(txt(rows[head], col - 2)) ? col - 2 : (q2 < 0 && col >= 1 && Q1.test(txt(rows[head], col - 1)) ? col - 1 : -1);
    triples.push({ q1, q2, final: col });
  });
  const firstSubjectCol = Math.min(...triples.map((t) => (t.q1 >= 0 ? t.q1 : t.q2 >= 0 ? t.q2 : t.final)));

  // 3. Subject name, code and grade level are written above the block (merged cells keep their text in the first cell).
  const subjects: Raw[] = [];
  let level = '';
  const byLevel = new Map<string, { code: string; category: string; index: number }[]>();
  for (const t of triples) {
    const start = t.q1 >= 0 ? t.q1 : t.q2 >= 0 ? t.q2 : t.final;
    const above: string[] = [];
    for (let r = 0; r < head; r += 1) for (let c = start; c <= t.final; c += 1) { const v = txt(rows[r], c); if (v) above.push(v); }
    const lv = above.map((v) => LEVEL.exec(v)).find(Boolean);
    if (lv) level = lv[1] ?? lv[2] ?? lv[3];
    const label = above.find((v) => CODE.test(v)) ?? above.find((v) => !LEVEL.test(v) && !/^(q\s*[1-4]|final)$/i.test(v));
    if (!label) continue; // not a subject block (a stray FINAL column)
    if (!level) { warnings.push(`The block at column ${colLetter(start)} has no grade level above it, so it was skipped.`); continue; }
    const m = CODE.exec(label);
    const prefix = m ? m[1].toUpperCase() : '';
    const code = m ? `${prefix} ${m[2].padStart(3, '0')}` : '';
    const name = (m ? (m[3].trim() || code) : label).slice(0, 90);
    const category = prefix === 'COR' ? 'Core' : prefix === 'APP' ? 'Applied' : 'Specialized';
    const entry: Raw = { name, code, category, gradeLevel: level, sem: '1', q1: t.q1 >= 0 ? colLetter(t.q1) : '', q2: t.q2 >= 0 ? colLetter(t.q2) : '', final: colLetter(t.final) };
    const list = byLevel.get(level) ?? [];
    list.push({ code: prefix, category, index: subjects.length });
    byLevel.set(level, list);
    subjects.push(entry);
  }
  if (!subjects.length) return null;

  // 4. The sheet never writes the semester. Within a grade level each semester lists COR/APP subjects first and the strand
  //    subjects after; the next COR/APP subject that follows strand subjects starts the 2nd semester.
  for (const [lv, list] of byLevel) {
    let sawStrand = false, flip = -1;
    list.forEach((s, i) => {
      const general = s.category === 'Core' || s.category === 'Applied';
      if (general && sawStrand && flip < 0) flip = i;
      if (!general) sawStrand = true;
    });
    if (flip >= 0) { // the first restart is the semester boundary; a later stray core subject does not change it
      list.forEach((s, i) => { subjects[s.index].sem = i < flip ? '1' : '2'; subjects[s.index].semLocked = true; });
      warnings.push(`Grade ${lv}: the sheet does not name the semesters, so they were worked out from the subject order (subjects before ${String(subjects[list[flip].index].name)} = 1st semester). Please check.`);
    } else {
      warnings.push(`Grade ${lv}: could not tell where the 1st semester ends in the subject order. Check the semesters.`);
    }
  }

  // 5. Learner columns come from the header text left of the first subject block.
  const learner: Record<string, string> = {};
  for (let r = head; r >= 0; r -= 1) {
    for (let c = 0; c < firstSubjectCol; c += 1) {
      const v = txt(rows[r], c);
      if (!v) continue;
      for (const [key, re] of LEARNER_FIELDS) {
        if (!learner[key] && re.test(v) && !Object.values(learner).includes(colLetter(c))) { learner[key] = colLetter(c); break; }
      }
    }
  }
  if (!learner.lastName && !learner.name && !learner.lrn) return null;

  // 6. The first learner row: the first row under the header with a name or LRN.
  let first = -1;
  for (let r = head + 1; r < rows.length; r += 1) {
    const colIdx = (k: string) => (learner[k] ? learner[k].split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1 : -1);
    if (txt(rows[r], colIdx('lrn')) || txt(rows[r], colIdx('lastName')) || txt(rows[r], colIdx('name'))) { first = r; break; }
  }
  if (first < 0) return null;

  warnings.unshift(`Read ${subjects.length} subject blocks and the learner columns directly from the header rows (no AI needed).`);
  return { first_data_row: first + 1, learner, subjects, class_details: {}, warnings };
}
