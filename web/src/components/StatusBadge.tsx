import ui from './ui.module.css';

// Colour for each status value used by students, teachers and batches.
const TONES: Record<string, string> = {
  active: ui.badgeOk,
  open: ui.badgeOk,
  trial: ui.badgeBrand,
  onboarding: ui.badgeBrand,
  paused: ui.badgeMuted,
  leaving: ui.badgeMuted,
  on_leave: ui.badgeMuted,
  closed: ui.badgeMuted,
  left: ui.badgeDanger,
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`${ui.badge} ${TONES[status] ?? ui.badgeMuted}`}>{label}</span>;
}
