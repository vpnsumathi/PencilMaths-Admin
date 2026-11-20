'use client';

import { useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import ui from '@/components/ui.module.css';
import { MESSAGE_MAX, reach, studentsWord, type Audiences, type SendTo } from '@/lib/messages';
import { yearLabel } from '@/lib/options';
import { sendMessage } from '../actions';
import styles from '../messages.module.css';

export type Pickable = { id: string; first_name: string; last_name: string; code: string; year_group: number };

const KINDS: { kind: SendTo['kind']; label: string }[] = [
  { kind: 'students', label: 'Chosen students' },
  { kind: 'batch', label: 'A batch' },
  { kind: 'year', label: 'A year group' },
  { kind: 'all', label: 'All current students' },
];

// The New message form: who it is for, the words, and how many students it will reach before sending.
export function NewMessageForm({ audiences, students }: { audiences: Audiences; students: Pickable[] }) {
  const [kind, setKind] = useState<SendTo['kind']>('students');
  const [picked, setPicked] = useState<string[]>([]);
  const [batch, setBatch] = useState('');
  const [year, setYear] = useState('');
  const [search, setSearch] = useState('');
  const [body, setBody] = useState('');

  const to: SendTo = kind === 'students' ? { kind, students: picked }
    : kind === 'batch' ? { kind, batch } : kind === 'year' ? { kind, year: Number(year) } : { kind };
  const count = reach(to, audiences);
  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? students.filter((p) => `${p.first_name} ${p.last_name} ${p.code}`.toLowerCase().includes(s)) : students;
  }, [search, students]);
  const names = kind === 'students'
    ? students.filter((p) => picked.includes(p.id)).map((p) => `${p.first_name} ${p.last_name}`) : [];

  return (
    <form action={sendMessage} className={`${ui.card} ${ui.form} ${styles.form}`}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="back" value="/messages/new" />

      <div className={ui.field}>
        <span className={ui.label}>Send to</span>
        <fieldset className={styles.choices}>
          <legend className={ui.srOnly}>Send to</legend>
          {KINDS.map((k) => (
            <label key={k.kind} className={styles.choice}>
              <input type="radio" name="send_to" checked={kind === k.kind} onChange={() => setKind(k.kind)} />
              <span>{k.label}</span>
            </label>
          ))}
        </fieldset>
      </div>

      {kind === 'students' && (
        <div className={ui.field}>
          <label className={ui.label} htmlFor="pick-search">Students ({picked.length} chosen)</label>
          <input id="pick-search" className={ui.input} placeholder="Search name or code" value={search}
            onChange={(e) => setSearch(e.target.value)} />
          <div className={styles.picker} role="group" aria-label="Students">
            {shown.length === 0 && <p className={ui.empty}>No student matches that search.</p>}
            {shown.map((p) => (
              <label key={p.id} className={styles.pick}>
                <input type="checkbox" name="students" value={p.id} checked={picked.includes(p.id)}
                  onChange={(e) => setPicked((now) => e.target.checked ? [...now, p.id] : now.filter((x) => x !== p.id))} />
                {p.first_name} {p.last_name} <small>{p.code} · {yearLabel(p.year_group)}</small>
              </label>
            ))}
          </div>
          {/* Chosen students hidden by the search are still sent. */}
          {picked.filter((id) => !shown.some((p) => p.id === id)).map((id) => <input key={id} type="hidden" name="students" value={id} />)}
        </div>
      )}

      {kind === 'batch' && (
        <label className={ui.field}>
          <span className={ui.label}>Batch</span>
          <select name="batch" className={ui.select} value={batch} onChange={(e) => setBatch(e.target.value)} required>
            <option value="">Choose a batch</option>
            {audiences.batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} · {b.subject} · {yearLabel(b.year)}{b.teacher ? ` · ${b.teacher}` : ''} ({studentsWord(b.count)})
              </option>
            ))}
          </select>
        </label>
      )}

      {kind === 'year' && (
        <label className={ui.field}>
          <span className={ui.label}>Year group</span>
          <select name="year" className={ui.select} value={year} onChange={(e) => setYear(e.target.value)} required>
            <option value="">Choose a year group</option>
            {audiences.years.map((y) => <option key={y.year} value={y.year}>{yearLabel(y.year)} ({studentsWord(y.count)})</option>)}
          </select>
        </label>
      )}

      <label className={ui.field}>
        <span className={ui.label}>Message</span>
        <textarea name="body" className={ui.textarea} rows={6} maxLength={MESSAGE_MAX} required value={body}
          onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" />
        <span className={ui.stamp}>
          {body.length.toLocaleString('en-GB')} / {MESSAGE_MAX.toLocaleString('en-GB')} characters. Web addresses become links.
        </span>
      </label>

      <p className={`${styles.reach} ${count === 0 ? styles.reachNone : ''}`} aria-live="polite">
        {count === 0
          ? (kind === 'students' ? 'Choose at least one student.' : kind === 'all' ? 'There are no current students.' : 'Choose who it is for.')
          : <>This goes to <strong>{studentsWord(count)}</strong>{names.length > 0 && names.length <= 8 ? `: ${names.join(', ')}` : ''}.</>}
      </p>

      <div className={ui.formActions}>
        <Send disabled={count === 0 || body.trim() === ''} count={count} />
      </div>
    </form>
  );
}

function Send({ disabled, count }: { disabled: boolean; count: number }) {
  const { pending } = useFormStatus();
  return (
    <button className={ui.primaryButton} disabled={disabled || pending}>
      {pending ? 'Sending…' : count > 0 ? `Send to ${studentsWord(count)}` : 'Send'}
    </button>
  );
}
