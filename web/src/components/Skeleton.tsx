import type { CSSProperties, ReactNode } from 'react';
import s from './Skeleton.module.css';

// Placeholders shown while a page or section loads, so a click shows straight away that something is
// happening. Plain server-rendered HTML and CSS: no JavaScript is sent to the browser for them.

// One grey bar. width/height: a number is pixels, a string any CSS size ("60%").
export function Bone({ width = '100%', height = 14, style }: { width?: number | string; height?: number; style?: CSSProperties }) {
  return <span className={s.bone} style={{ width, height, ...style }} aria-hidden="true" />;
}

// Wraps placeholders: screen readers hear "Loading…" (or the label) instead of empty bars.
export function Skeleton({ label = 'Loading', children }: { label?: string; children: ReactNode }) {
  return (
    <div className={s.wrap} role="status">
      <span className={s.srOnly}>{label}…</span>
      {children}
    </div>
  );
}

// A whole list page: title, then a card of rows. Used by loading.tsx.
export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Skeleton>
      <div className={s.head}>
        <Bone width={200} height={28} />
        <Bone width={110} height={36} style={{ borderRadius: 12 }} />
      </div>
      <div className={s.card}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={s.row}>
            <Bone width="14%" />
            <Bone width="26%" />
            <Bone width="10%" />
            <Bone width="20%" />
            <Bone width="12%" />
          </div>
        ))}
      </div>
    </Skeleton>
  );
}
