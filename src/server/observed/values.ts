/** BACKEND: asks the AI for observed-value ratings and checks the answer. */
import { CORE_VALUE_KEYS } from '@/lib/domain/curriculum';
import type { Caller, Tool } from '@/server/core/llm';

export const RATINGS = ['AO', 'SO', 'RO', 'NO'] as const;
const QUARTERS = ['q1', 'q2', 'q3', 'q4'] as const;
const MONTHS = ['jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar', 'apr'] as const;
/** Days absent per month, keyed by month (jun..apr). */
export type Absences = Record<string, number>;
export type ObservedValues = Record<string, Record<string, string>>;

/** What the AI sees about one learner: no name, no LRN, only the grade picture. */
export interface LearnerSummary {
  id: number;
  /** Average of the subject grades in each quarter; null when that quarter has no grades. */
  quarterAverage: Record<(typeof QUARTERS)[number], number | null>;
  /** Number of subjects with a semester final below 75. */
  failing: number;
  /** School days in each month (jun..apr), so the AI can keep absences within them. */
  schoolDays?: Record<string, number>;
}

const BATCH = 25;

const ratingProps = Object.fromEntries(QUARTERS.map((q) => [q, { type: 'string', enum: [...RATINGS] }]));
const tool: Tool = {
  name: 'observed_values',
  description: 'Observed values rating for each learner, quarter by quarter.',
  input_schema: {
    type: 'object',
    properties: {
      learners: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            values: { type: 'object', properties: Object.fromEntries(CORE_VALUE_KEYS.map((k) => [k, { type: 'object', properties: ratingProps, required: [...QUARTERS] }])), required: [...CORE_VALUE_KEYS] },
            absent: { type: 'object', description: 'Days absent in each month (jun..apr), a whole number from 0 up to that month\'s school days.', properties: Object.fromEntries(MONTHS.map((m) => [m, { type: 'integer', minimum: 0 }])) }
          },
          required: ['id', 'values']
        }
      }
    },
    required: ['learners']
  }
};

function prompt(batch: LearnerSummary[]): string {
  return [
    'A Philippine senior high school teacher needs a draft "Report on Learner\'s Observed Values" for each learner.',
    `Core values: ${CORE_VALUE_KEYS.join(', ')}. Ratings per quarter (q1 to q4): AO = Always Observed, SO = Sometimes Observed, RO = Rarely Observed, NO = Not Observed.`,
    'You only know each learner\'s grades. Behaviour was not observed by you, so be conservative and consistent:',
    '- quarter average 90 or above: AO; 80 to 89: AO or SO; 75 to 79: SO; below 75: SO or RO.',
    '- Use NO only when a quarter has no grades at all (average is null).',
    '- Several failing subjects should lower the ratings a little, never to NO.',
    '- Ratings of one learner should be similar across the four core values; vary between quarters only when the grades changed.',
    'Return a rating for every learner id, every core value and every quarter.',
    'Also draft days absent for each month in "absent" (jun to apr), using each learner\'s "schoolDays". Be realistic: most learners miss 0 to 2 days a month, learners with low grades or failing subjects may miss a few more, never more than the school days of that month. Use 0 for months with 0 school days.',
    JSON.stringify(batch)
  ].join('\n');
}

/** Asks the AI for a draft of the observed values of many learners, 25 at a time. Anything invalid in the answer is dropped. */
export async function decideObservedValues(learners: LearnerSummary[], caller: Caller, spend: () => void = () => {}, absences?: Map<number, Absences>): Promise<Map<number, ObservedValues>> {
  const out = new Map<number, ObservedValues>();
  const ask = async (batch: LearnerSummary[]) => {
    const wanted = new Set(batch.map((l) => l.id));
    spend();
    const answer = await caller(prompt(batch), tool, 8192);
    const list = Array.isArray(answer.learners) ? answer.learners : [];
    for (const item of list as { id?: unknown; values?: Record<string, Record<string, unknown>>; absent?: Record<string, unknown> }[]) {
      const id = Number(item?.id);
      if (!wanted.has(id) || !item.values) continue;
      if (absences && item.absent && typeof item.absent === 'object') {
        const days = batch.find((l) => l.id === id)?.schoolDays ?? {};
        const row: Absences = {};
        for (const m of MONTHS) {
          const n = Number(item.absent[m]);
          if (item.absent[m] === null || item.absent[m] === '' || !Number.isInteger(n) || n < 0) continue;
          row[m] = Math.min(n, Number.isInteger(days[m]) ? days[m] : n);
        }
        if (Object.keys(row).length) absences.set(id, row);
      }
      const values: ObservedValues = {};
      let complete = true;
      for (const key of CORE_VALUE_KEYS) {
        values[key] = {};
        for (const q of QUARTERS) {
          const rating = String(item.values[key]?.[q] ?? '').toUpperCase();
          if ((RATINGS as readonly string[]).includes(rating)) values[key][q] = rating; else complete = false;
        }
      }
      if (complete) out.set(id, values);
    }
  };
  for (let i = 0; i < learners.length; i += BATCH) await ask(learners.slice(i, i + BATCH));
  // Learners the AI skipped or answered badly get one more try, so nobody is left out.
  const missed = learners.filter((l) => !out.has(l.id));
  for (let i = 0; i < missed.length; i += BATCH) await ask(missed.slice(i, i + BATCH));
  return out;
}
