'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import type { ChartBar } from './data';
import styles from './charts.module.css';

type Props = {
  bars: ChartBar[];
  orientation: 'columns' | 'rows';
  max: number; // top of the scale
  unit?: '%' | '';
  ariaLabel: string;
  emptyText?: string;
};

// A small, dependency-free bar chart: hover or focus a bar for its tooltip, or switch to a table.
export function BarChart({ bars, orientation, max, unit = '', ariaLabel, emptyText = 'No data yet.' }: Props) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [tip, setTip] = useState<{ bar: ChartBar; x: number; y: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const scale = Math.max(max, 1);

  if (bars.length === 0 || bars.every((b) => b.value === null)) return <p className={styles.empty}>{emptyText}</p>;

  // Position the tooltip above the hovered bar, relative to the chart frame.
  function show(bar: ChartBar, el: HTMLElement) {
    const box = frame.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!box) return;
    setTip({ bar, x: r.left - box.left + r.width / 2, y: r.top - box.top });
  }

  const ticks = orientation === 'columns' ? [scale, scale / 2, 0] : [];

  return (
    <div className={styles.chart}>
      <button type="button" className={styles.toggle} onClick={() => setView(view === 'chart' ? 'table' : 'chart')}>
        {view === 'chart' ? 'Table' : 'Chart'}
      </button>

      {view === 'table' ? (
        <table className={styles.table} aria-label={ariaLabel}>
          <tbody>
            {bars.map((b) => (
              <tr key={b.key}>
                <th scope="row">{b.label}</th>
                <td>{b.display}</td>
                <td className={styles.muted}>{b.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div ref={frame} className={orientation === 'columns' ? styles.columns : styles.rows} role="img" aria-label={ariaLabel}
          onPointerLeave={() => setTip(null)}>
          {orientation === 'columns' && (
            <div className={styles.grid} aria-hidden="true">
              {ticks.map((t) => (
                <div key={t} className={styles.gridLine}><span>{Math.round(t)}{unit}</span></div>
              ))}
            </div>
          )}

          {bars.map((b, i) => {
            const size = b.value === null ? 0 : (100 * b.value) / scale;
            const track = b.max ? (100 * b.max) / scale : null;
            const content = (
              <>
                {orientation === 'rows' && <span className={styles.rowLabel}>{b.label}</span>}
                <span className={styles.slot}>
                  {track !== null && <span className={styles.track} style={orientation === 'rows' ? { width: `${track}%` } : { height: `${track}%` }} />}
                  <span
                    className={`${styles.bar} ${b.tone ? styles[`tone${b.tone}`] : ''} ${b.max && b.value !== null && b.value >= b.max ? styles.full : ''}`}
                    style={orientation === 'rows' ? { width: `${size}%` } : { height: `${size}%` }}
                  />
                  {orientation === 'rows' && <span className={styles.rowValue} style={{ left: `${Math.max(size, track ?? 0)}%` }}>{b.display}</span>}
                </span>
                {orientation === 'columns' && (
                  <span className={styles.colLabel}>{b.label}</span>
                )}
                {orientation === 'columns' && i === bars.length - 1 && b.value !== null && (
                  <span className={styles.capLabel} style={{ bottom: `calc(${size}% + 4px)` }}>{b.display}</span>
                )}
              </>
            );
            const common = {
              className: `${styles.item} ${tip?.bar.key === b.key ? styles.hover : ''}`,
              onPointerEnter: (e: React.PointerEvent<HTMLElement>) => show(b, e.currentTarget),
              onFocus: (e: React.FocusEvent<HTMLElement>) => show(b, e.currentTarget),
              onBlur: () => setTip(null),
              'aria-label': `${b.label}: ${b.display}`,
            };
            return b.href
              ? <Link key={b.key} {...common} href={b.href}>{content}</Link>
              : <span key={b.key} {...common} tabIndex={0}>{content}</span>;
          })}

          {tip && (
            <div className={styles.tooltip} style={{ left: tip.x, top: tip.y }} role="status">
              <strong>{tip.bar.display}</strong>
              <span>{tip.bar.label}</span>
              {tip.bar.detail && <span className={styles.muted}>{tip.bar.detail}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
