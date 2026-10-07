import styles from './charts.module.css';

// A tiny trend line for a headline tile. Gaps (null) are skipped; the last point gets a dot.
export function Sparkline({ values, max = 100 }: { values: (number | null)[]; max?: number }) {
  const w = 120;
  const h = 32;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const points = values
    .map((v, i) => (v === null ? null : { x: i * step, y: h - 4 - ((h - 8) * v) / max }))
    .filter((p): p is { x: number; y: number } => p !== null);
  if (points.length < 2) return null;
  const last = points.at(-1)!;

  return (
    <svg className={styles.spark} viewBox={`-4 0 ${w + 8} ${h}`} aria-hidden="true">
      <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} />
      <circle cx={last.x} cy={last.y} r={4} />
    </svg>
  );
}
