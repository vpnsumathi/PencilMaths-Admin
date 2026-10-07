// Fixed lists used by forms and labels. The keys match the database enums (see docs/SUPABASE.md).

export const YEARS = Array.from({ length: 13 }, (_, i) => i + 1);

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
