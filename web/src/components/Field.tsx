import ui from './ui.module.css';

// A form field: label above its input. `full` makes it span both columns on wider screens.
export function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`${ui.field} ${full ? ui.full : ''}`}>
      <span className={ui.label}>{label}</span>
      {children}
    </label>
  );
}
