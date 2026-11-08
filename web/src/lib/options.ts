// Fixed lists used by forms and labels. The keys match the database enums (see docs/SUPABASE.md).

// Year groups as stored (1-12): 1-10 are Year 1 to Year 10, 11 is GCSE - H (Higher), 12 is GCSE - F (Foundation).
// The database's year_label() gives the same words.
export const YEARS = Array.from({ length: 12 }, (_, i) => i + 1);

// 5 → "Year 5", 11 → "GCSE - H", 12 → "GCSE - F".
export function yearLabel(year: number | null | undefined) {
  if (year == null) return '—';
  return year === 11 ? 'GCSE - H' : year === 12 ? 'GCSE - F' : `Year ${year}`;
}

// For narrow columns and charts: 5 → "Y5", 11 → "GCSE-H", 12 → "GCSE-F".
export function yearShort(year: number | null | undefined) {
  if (year == null) return '—';
  return year === 11 ? 'GCSE-H' : year === 12 ? 'GCSE-F' : `Y${year}`;
}

// Lesson library codes start with this: Y5-, and GH- / GF- for GCSE - H / GCSE - F.
export function lessonCodePrefix(year: number) {
  return year === 11 ? 'GH-' : year === 12 ? 'GF-' : `Y${year}-`;
}

export const STUDENT_STATUSES: Record<string, string> = {
  active: 'Active',
  trial: 'Trial',
  paused: 'Paused',
  leaving: 'Leaving',
  left: 'Left',
};

export const TEACHER_STATUSES: Record<string, string> = {
  active: 'Active',
  onboarding: 'Onboarding',
  on_leave: 'On leave',
  left: 'Left',
};

// ISO weekday numbers, as stored in batch_slots: 1 = Monday … 7 = Sunday.
export const WEEKDAYS: Record<number, string> = {
  1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday',
};

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Today's date in the UK as YYYY-MM-DD, for date inputs.
export function todayInUk() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}
// Enquiry (lead) stages in order, matching the enquiry_stage enum.
export const ENQUIRY_STAGES: Record<string, string> = {
  new: 'New',
  assessment_sent: 'Assessment sent',
  assessment_returned: 'Assessment returned',
  results_shared: 'Results shared',
  confirmed: 'Confirmed',
  enrolled: 'Enrolled',
  not_proceeding: 'Not proceeding',
};
export const OPEN_STAGES = ['new', 'assessment_sent', 'assessment_returned', 'results_shared', 'confirmed'];

// Badge colour for a stage: enrolled = green, not proceeding = red, open = blue.
export function stageTone(stage: string) {
  return stage === 'enrolled' ? 'active' : stage === 'not_proceeding' ? 'left' : 'trial';
}