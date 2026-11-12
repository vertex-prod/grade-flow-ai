/** Builds the grade summary sent to the AI for observed values, and applies the AI's answer. */
import { ATTENDANCE_MONTHS, CORE_VALUE_KEYS, PASSING_GRADE, subjectsFor } from '@/lib/domain/curriculum';
import type { Student } from '@/lib/domain/types';

type Quarter = 'q1' | 'q2' | 'q3' | 'q4';
const QUARTERS: Quarter[] = ['q1', 'q2', 'q3', 'q4'];
const num = (v: unknown) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

/** Typical school days per month, used only where a learner has none filled in. */
export const DEFAULT_SCHOOL_DAYS: Record<string, number> = { jun: 15, jul: 23, aug: 21, sep: 22, oct: 22, nov: 20, dec: 12, jan: 20, feb: 18, mar: 22, apr: 10 };
const schoolDaysOf = (student: Student) => Object.fromEntries(ATTENDANCE_MONTHS.map((m) => {
  const v = num(student.attendance?.schoolDays?.[m.key]);
  return [m.key, v !== null && Number.isInteger(v) && v >= 0 ? v : DEFAULT_SCHOOL_DAYS[m.key]];
}));

/** The grade picture the AI is given: quarter averages and the number of failed subjects. No name or LRN leaves the browser. */
export function gradeSummary(student: Student) {
  const subjects = subjectsFor(student.strand);
  const quarterAverage = Object.fromEntries(QUARTERS.map((q) => {
    const values = subjects.map((s) => num(student.grades[s.key]?.[q])).filter((v): v is number => v !== null);
    return [q, values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null];
  }));
  const failing = subjects.filter((s) => { const v = num(student.grades[s.key]?.final); return v !== null && v < PASSING_GRADE; }).length;
  return { id: student.id, quarterAverage, failing, schoolDays: schoolDaysOf(student) };
}

/** Puts the AI's ratings into the learners. Only blank ratings are filled unless `overwrite` is set. */
export function applyObservedValues(students: Student[], decided: Record<string, Record<string, Record<string, string>>>, overwrite: boolean): { students: Student[]; changed: number } {
  let changed = 0;
  const out = students.map((student) => {
    const values = decided[String(student.id)];
    if (!values) return student;
    const next: Student['observedValues'] = { ...student.observedValues };
    let touched = false;
    CORE_VALUE_KEYS.forEach((key) => {
      const row = { ...(student.observedValues?.[key] ?? {}) };
      QUARTERS.forEach((q) => {
        if ((overwrite || !String(row[q] ?? '').trim()) && values[key]?.[q] && row[q] !== values[key][q]) { row[q] = values[key][q]; touched = true; }
      });
      next[key] = row;
    });
    if (!touched) return student;
    changed += 1;
    return { ...student, observedValues: next };
  });
  return { students: out, changed };
}

type Decided = Record<string, Record<string, Record<string, string>>>;
type Absences = Record<string, Record<string, number>>;

/** Puts the AI's days absent into the learners: school days (typical ones if blank), days absent, and days present = school days - absent. Only blank months are filled unless `overwrite` is set. */
export function applyAttendance(students: Student[], absences: Absences, overwrite: boolean): { students: Student[]; changed: number } {
  let changed = 0;
  const out = students.map((student) => {
    const decided = absences[String(student.id)];
    if (!decided) return student;
    const att = { ...student.attendance, schoolDays: { ...student.attendance?.schoolDays }, months: { ...student.attendance?.months }, absent: { ...student.attendance?.absent } };
    let touched = false;
    for (const { key } of ATTENDANCE_MONTHS) {
      if (!Number.isInteger(decided[key])) continue;
      if (!overwrite && (num(att.absent[key]) !== null || num(att.months[key]) !== null)) continue;
      const days = num(att.schoolDays[key]) ?? DEFAULT_SCHOOL_DAYS[key];
      const absent = Math.min(decided[key], days);
      if (att.schoolDays[key] !== days || att.absent[key] !== absent || att.months[key] !== days - absent) touched = true;
      att.schoolDays[key] = days; att.absent[key] = absent; att.months[key] = days - absent;
    }
    if (!touched) return student;
    changed += 1;
    return { ...student, attendance: att };
  });
  return { students: out, changed };
}

const CHUNK = 50;

async function postChunk(students: Student[]): Promise<{ values: Decided; absences: Absences }> {
  const body = JSON.stringify({ learners: students.map(gradeSummary) });
  const send = () => fetch('/api/observed-values', {
    method: 'POST', body,
    headers: { 'Content-Type': 'application/json', ...(window.sessionStorage.getItem('gf-access-code') ? { 'X-Access-Code': window.sessionStorage.getItem('gf-access-code')! } : {}) }
  });
  let res = await send();
  if (res.status === 401) {
    const entered = window.prompt('Enter the access code to use the AI:');
    if (entered) {
      window.sessionStorage.setItem('gf-access-code', entered);
      res = await send();
      if (res.status === 401) window.sessionStorage.removeItem('gf-access-code');
    }
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { detail = ((await res.json()) as { detail?: string }).detail || detail; } catch { /* not JSON */ }
    throw new Error(detail);
  }
  const data = (await res.json()) as { values: Decided; absences?: Absences };
  return { values: data.values, absences: data.absences ?? {} };
}

/**
 * Asks the server (and so the AI) for a draft of the observed values of any number of learners, 50 per request,
 * so a whole school fits. `onProgress` reports how many learners are done. If a request fails part-way, the
 * learners already done are kept and returned together with the error.
 */
export async function askObservedValues(students: Student[], onProgress: (done: number, total: number) => void = () => {}) {
  const values: Decided = {};
  const absences: Absences = {};
  let error: Error | null = null;
  onProgress(0, students.length);
  for (let i = 0; i < students.length; i += CHUNK) {
    try {
      const chunk = await postChunk(students.slice(i, i + CHUNK));
      Object.assign(values, chunk.values);
      Object.assign(absences, chunk.absences);
    } catch (e) { error = e as Error; break; }
    onProgress(Math.min(i + CHUNK, students.length), students.length);
  }
  return { values, absences, error };
}
