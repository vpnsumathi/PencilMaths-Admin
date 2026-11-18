'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { FocusMessage } from '@/components/FocusMessage';
import ui from '@/components/ui.module.css';
import { KIND_LABEL, LENGTHS, type ExtraKind } from '@/lib/extraClasses';
import { checkExtraClass, saveExtraClass, studentAbsences, type Absence, type CheckResult } from './actions';
import styles from './extra.module.css';
import { times12 } from '@/lib/format';

export type PickStudent = {
  id: string; name: string; code: string; status: string;
  enrolments: { subject_id: string; teacher_id: string | null; batch_id: string | null }[];
};
export type FormValues = {
  id?: string; version?: number; subject_id: string; teacher_id: string; class_date: string; start_time: string;
  length_minutes: number; kind: ExtraKind; note: string; note_for_family: boolean; batch_id: string | null;
  students: { student_id: string; missed_session_id: string | null }[];
};
type Props = {
  mode: 'new' | 'record' | 'edit';
  students: PickStudent[];
  subjects: { id: string; name: string }[];
  teachers: { id: string; name: string; status: string }[];
  initial: FormValues;
  locked?: boolean;    // the class has started: only the type and the note can change
  today: string;       // UK date, for the date limits
  backHref: string;
};

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// The booking form (Create extra class, Record a past extra class, and changing a class). It checks the clash
// rules while staff fill it in, so problems show before Save; the database checks everything again on save.
export function ExtraClassForm({ mode, students, subjects, teachers, initial, locked = false, today, backHref }: Props) {
  const [state, action, pending] = useActionState(saveExtraClass, null);
  const [picked, setPicked] = useState(initial.students);
  const [subjectId, setSubjectId] = useState(initial.subject_id);
  const [teacherId, setTeacherId] = useState(initial.teacher_id);
  const [date, setDate] = useState(initial.class_date);
  const [time, setTime] = useState(initial.start_time);
  const [length, setLength] = useState(initial.length_minutes);
  const [kind, setKind] = useState<ExtraKind>(initial.kind);
  const [note, setNote] = useState(initial.note);
  const [forFamily, setForFamily] = useState(initial.note_for_family);
  const [reason, setReason] = useState('');
  const [override, setOverride] = useState(false);
  const [search, setSearch] = useState('');
  const [absences, setAbsences] = useState<Record<string, Absence[]>>({});
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const teacherChosen = useRef(mode === 'edit' || Boolean(initial.teacher_id));

  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const ids = picked.map((p) => p.student_id);
  const idsKey = ids.join(',');
  const initialKey = initial.students.map((s) => s.student_id).join(',');
  const subjectName = subjects.find((s) => s.id === subjectId)?.name;

  // The subjects every chosen student takes now.
  const subjectChoices = useMemo(() => {
    if (ids.length === 0) return subjects;
    const sets = ids.map((id) => new Set((byId.get(id)?.enrolments ?? []).map((e) => e.subject_id)));
    return subjects.filter((s) => sets.every((set) => set.has(s.id)) || s.id === subjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, subjects, byId, subjectId]);

  // One subject in common: chosen for you.
  useEffect(() => {
    if (!subjectId && ids.length > 0 && subjectChoices.length === 1) setSubjectId(subjectChoices[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  // The teacher of the first student's batch in that subject is suggested, until staff choose one themselves.
  useEffect(() => {
    if (teacherChosen.current || !subjectId || ids.length === 0) return;
    const e = byId.get(ids[0])?.enrolments.find((x) => x.subject_id === subjectId);
    if (e?.teacher_id && teachers.some((t) => t.id === e.teacher_id)) setTeacherId(e.teacher_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, idsKey]);

  // Each chosen student's missed classes in the subject (last 8 weeks), for "Makes up for".
  useEffect(() => {
    if (!subjectId || ids.length === 0 || locked) { setAbsences({}); return; }
    let live = true;
    studentAbsences(ids, subjectId).then((r) => { if (live) setAbsences(r); }).catch(() => { if (live) setAbsences({}); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, idsKey, locked]);

  const moved = mode === 'edit' && (date !== initial.class_date || time !== initial.start_time || length !== initial.length_minutes);
  const teacherChanged = mode === 'edit' && teacherId !== initial.teacher_id;
  const slotChanged = mode !== 'edit' || moved || teacherChanged || idsKey !== initialKey;
  const needsReason = moved || teacherChanged;

  // The clash check, a moment after the last change.
  useEffect(() => {
    if (locked || !teacherId || !date || !time || ids.length === 0 || !slotChanged) { setCheck(null); setChecking(false); return; }
    let live = true;
    setChecking(true);
    const timer = setTimeout(() => {
      checkExtraClass({ id: initial.id ?? null, teacher_id: teacherId, class_date: date, start_time: time, length_minutes: length, students: ids })
        .then((r) => { if (live) { setCheck(r); setOverride(false); } })
        .catch(() => { if (live) setCheck(null); })
        .finally(() => { if (live) setChecking(false); });
    }, 400);
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, date, time, length, idsKey, locked, slotChanged]);

  const available = students
    .filter((s) => s.status !== 'left' && !ids.includes(s.id))
    .filter((s) => !subjectId || s.enrolments.some((e) => e.subject_id === subjectId))
    .filter((s) => !search.trim() || `${s.name} ${s.code}`.toLowerCase().includes(search.trim().toLowerCase()));

  const batchId = mode === 'edit' && subjectId === initial.subject_id
    ? initial.batch_id
    : (ids.length ? byId.get(ids[0])?.enrolments.find((e) => e.subject_id === subjectId)?.batch_id ?? null : null);

  const payload = {
    id: initial.id ?? null, version: initial.version ?? null, subject_id: subjectId, teacher_id: teacherId,
    class_date: date, start_time: time, length_minutes: length, kind, note, note_for_family: forFamily, batch_id: batchId,
    recorded: mode === 'record', override, reason,
    students: picked.map((p) => ({ student_id: p.student_id, missed_session_id: p.missed_session_id || null })),
  };
  const errors = check?.errors ?? [];
  const warnings = check?.warnings ?? [];
  const blocked = errors.length > 0 || (warnings.length > 0 && !override) || (needsReason && !reason.trim()) || ids.length === 0;
  const label = mode === 'edit' ? 'Save changes' : mode === 'record' ? 'Record class' : 'Create extra class';

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />
      {state?.error && <FocusMessage key={state.at} signal={state.at} className={`${ui.alert} ${ui.alertError}`} role="alert">{state.error}</FocusMessage>}

      <section className={ui.card}>
        <h2>{ids.length > 1 ? 'Students' : 'Student'}</h2>
        {locked && <p className={styles.locked}>This class has started, so its students, time and teacher can&apos;t change. You can still change the type and the note.</p>}
        {picked.length === 0 && <p className={ui.muted} style={{ margin: 0 }}>Choose the student first.</p>}
        <ul className={styles.picked}>
          {picked.map((p) => {
            const s = byId.get(p.student_id);
            const missed = absences[p.student_id] ?? [];
            return (
              <li key={p.student_id}>
                <b>{s?.name ?? 'Student'} <span className={styles.sub}>{s?.code}{s && s.status !== 'active' ? ` · ${s.status}` : ''}</span></b>
                {!locked && subjectId && (
                  <label className={styles.sub}>
                    Makes up for{' '}
                    <select className={ui.select} value={p.missed_session_id ?? ''}
                      onChange={(e) => setPicked(picked.map((x) => (x.student_id === p.student_id ? { ...x, missed_session_id: e.target.value || null } : x)))}>
                      <option value="">{missed.length ? 'No particular class' : 'No missed classes in the last 8 weeks'}</option>
                      {missed.map((m) => (
                        <option key={m.session_id} value={m.session_id}>
                          {m.batch_code} · {shortDate(m.class_date)}{m.source === 'auto' ? ' (not checked in)' : ''}
                        </option>
                      ))}
                      {p.missed_session_id && !missed.some((m) => m.session_id === p.missed_session_id) && (
                        <option value={p.missed_session_id}>The class chosen before</option>
                      )}
                    </select>
                  </label>
                )}
                {!locked && (
                  <button type="button" className={ui.button} onClick={() => setPicked(picked.filter((x) => x.student_id !== p.student_id))}>
                    Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {!locked && (
          <div className={styles.addRow}>
            <input className={ui.input} type="search" placeholder="Search by name or code" value={search} onChange={(e) => setSearch(e.target.value)}
              aria-label="Search students" />
            <select className={ui.select} value="" aria-label={ids.length ? 'Add another student' : 'Choose a student'}
              onChange={(e) => { if (e.target.value) { setPicked([...picked, { student_id: e.target.value, missed_session_id: null }]); setSearch(''); } }}>
              <option value="">{ids.length ? 'Add another student…' : 'Choose a student…'} ({available.length})</option>
              {available.slice(0, 500).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.code}{s.status === 'trial' ? ' (trial)' : ''}</option>)}
            </select>
          </div>
        )}
        {!locked && subjectName && <p className={ui.hint} style={{ margin: '8px 0 0' }}>Only students who take {subjectName} now are listed.</p>}
      </section>

      <section className={ui.card}>
        <h2>Class</h2>
        <div className={ui.fieldGrid}>
          <label className={ui.field}>
            <span className={ui.label}>Subject</span>
            <select className={ui.select} value={subjectId} disabled={locked} required onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Choose…</option>
              {subjectChoices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className={ui.field}>
            <span className={ui.label}>Teacher</span>
            <select className={ui.select} value={teacherId} disabled={locked} required
              onChange={(e) => { teacherChosen.current = true; setTeacherId(e.target.value); }}>
              <option value="">Choose…</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.status === 'on_leave' ? ' (on leave)' : t.status === 'left' ? ' (left)' : ''}</option>)}
            </select>
          </label>
          <label className={ui.field}>
            <span className={ui.label}>Date</span>
            <input className={ui.input} type="date" value={date} disabled={locked} required
              min={mode === 'new' ? today : undefined} max={mode === 'record' ? today : undefined} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className={ui.fieldGrid} style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className={ui.field}>
              <span className={ui.label}>Start time (UK)</span>
              <input className={ui.input} type="time" step={300} value={time} disabled={locked} required onChange={(e) => setTime(e.target.value)} />
            </label>
            <label className={ui.field}>
              <span className={ui.label}>Length</span>
              <select className={ui.select} value={length} disabled={locked} onChange={(e) => setLength(Number(e.target.value))}>
                {[...new Set([...LENGTHS, length])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m} minutes</option>)}
              </select>
            </label>
          </div>
          <label className={ui.field}>
            <span className={ui.label}>Type</span>
            <select className={ui.select} value={kind} onChange={(e) => setKind(e.target.value as ExtraKind)}>
              {(Object.keys(KIND_LABEL) as ExtraKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </label>
          <label className={`${ui.field} ${ui.full}`}>
            <span className={ui.label}>Note (optional): what to cover</span>
            <textarea className={ui.textarea} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="For example: fractions from the 3 Nov class, then the homework questions." />
          </label>
          <label className={`${ui.check} ${ui.full}`} style={{ fontWeight: 500 }}>
            <input type="checkbox" checked={forFamily} onChange={(e) => setForFamily(e.target.checked)} />
            Show the note to the family (staff and the teacher always see it)
          </label>
          {needsReason && (
            <label className={`${ui.field} ${ui.full}`}>
              <span className={ui.label}>Reason for {moved && teacherChanged ? 'moving the class and changing the teacher' : moved ? 'moving the class' : 'changing the teacher'} (kept in the history)</span>
              <input className={ui.input} maxLength={300} value={reason} required onChange={(e) => setReason(e.target.value)}
                placeholder="For example: family asked for a later time" />
            </label>
          )}
        </div>
        {mode === 'record' && (
          <p className={ui.hint} style={{ margin: '12px 0 0' }}>
            For a class that already happened and wasn&apos;t created beforehand. It must have finished. Take attendance straight after saving.
          </p>
        )}
      </section>

      {!locked && (
        <section className={ui.card} aria-live="polite">
          <h2>Clash check</h2>
          {!slotChanged ? <p className={styles.checking}>The time, teacher and students haven&apos;t changed.</p>
            : !teacherId || !date || !time || ids.length === 0 ? <p className={styles.checking}>Choose the students, teacher, date and time to check for clashes.</p>
              : checking ? <p className={styles.checking}>Checking…</p>
                : check?.problem ? <p className={styles.checking}>{times12(check.problem)}</p>
                  : check && errors.length === 0 && warnings.length === 0 ? <p className={styles.okLine}>✓ No clashes: the teacher and {ids.length === 1 ? 'the student are' : 'the students are'} free.</p>
                    : null}
          {errors.length > 0 && (
            <div className={`${ui.alert} ${ui.alertError}`} style={{ margin: '0 0 8px' }}>
              <b>This time can&apos;t be used:</b>
              <ul className={styles.checkList}>{errors.map((m) => <li key={m}>{times12(m)}</li>)}</ul>
            </div>
          )}
          {warnings.length > 0 && (
            <div className={`${ui.alert} ${ui.alertWarn}`} style={{ margin: 0 }}>
              <b>Please check:</b>
              <ul className={styles.checkList}>{warnings.map((m) => <li key={m}>{times12(m)}</li>)}</ul>
              {errors.length === 0 && (
                <label className={styles.anyway}>
                  <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                  Create anyway (this is kept in the class&apos;s history)
                </label>
              )}
            </div>
          )}
        </section>
      )}

      <div className={ui.formActions}>
        <button className={ui.primaryButton} disabled={pending || blocked} aria-disabled={pending || blocked}
          style={pending || blocked ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>
          {pending ? 'Saving…' : label}
        </button>
        <Link href={backHref} className={ui.button}>Cancel</Link>
        {blocked && !pending && (
          <span className={ui.muted} style={{ fontSize: 13 }}>
            {ids.length === 0 ? 'Choose a student first.'
              : errors.length > 0 ? 'Change the time or the teacher first.'
                : warnings.length > 0 && !override ? 'Tick "Create anyway" to go ahead.'
                  : needsReason && !reason.trim() ? 'Give the reason first.' : ''}
          </span>
        )}
      </div>
    </form>
  );
}
