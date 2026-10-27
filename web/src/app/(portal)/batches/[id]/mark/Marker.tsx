'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { PDFPageProxy } from 'pdfjs-dist';
import ui from '@/components/ui.module.css';
import { finishMarking, saveMarkingDraft, startMarkedUpload, uploadMarkedViaServer } from './actions';
import { asPdf, drawMarks, HIGHLIGHT, markAt, markedPdf, type Drawings, type Mark, type PageView } from './marks';
import styles from './marker.module.css';

type Tool = 'scroll' | 'pen' | 'hl' | 'text' | 'tick' | 'cross' | 'erase';
const TOOLS: { tool: Tool; label: string; title: string }[] = [
  { tool: 'pen', label: '✏️', title: 'Pen' },
  { tool: 'hl', label: '🖍️', title: 'Highlighter' },
  { tool: 'text', label: 'T', title: 'Text: click where it goes' },
  { tool: 'tick', label: '✓', title: 'Tick: click where it goes' },
  { tool: 'cross', label: '✗', title: 'Cross: click where it goes' },
  { tool: 'erase', label: '⌫', title: 'Eraser: click a mark to remove it' },
  { tool: 'scroll', label: '✋', title: 'Scroll (no drawing), handy on a tablet' },
];
const COLOURS = [['#dc2626', 'Red'], ['#16a34a', 'Green'], ['#2563eb', 'Blue'], ['#111827', 'Black']];
// Sizes as fractions of the page width (about 1.5 pt and 3 pt pens, 17 pt text on an A4 page).
const PEN = { thin: 0.0025, thick: 0.005 };
const HIGHLIGHTER = 0.022;
const TEXT_SIZE = 0.028;
const SHAPE_SIZE = 0.05;

// Our own messages for the teacher; anything else is an unexpected problem.
class Problem extends Error {}
const round = (v: number) => Math.round(v * 10000) / 10000;

type Props = {
  ids: { batchId: string; sheetId: string; studentId: string };
  file: { id: string; url: string; driveUrl: string | null; label: string };
  maxMark: number | null;
  mark: number | null;
  marked: boolean;
  saved: { drawings: Drawings; at: number } | null; // marks saved before, to carry on from
  unsent: boolean; // saved with Save & close, not sent to the student yet
};

// The marking page's working part: shows each page of the hand-in with a layer on top to draw on.
// Marks are kept in this browser as you go (so a closed tab or lost connection doesn't lose them),
// and Save & send writes them into the PDF, which becomes the student's corrected sheet.
// Save & close keeps that PDF unsent, to be sent later from the batch page.
export function Marker({ ids, file, maxMark, mark, marked, saved, unsent }: Props) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'unsupported' | 'failed'>('loading');
  const [pages, setPages] = useState<{ view: PageView; aspect: number }[]>([]);
  const [marks, setMarks] = useState<Mark[]>(saved?.drawings.marks ?? []);
  const [undoList, setUndoList] = useState<Mark[][]>([]);
  const [redoList, setRedoList] = useState<Mark[][]>([]);
  const [tool, setTool] = useState<Tool>('pen');
  const [colour, setColour] = useState(COLOURS[0][0]);
  const [thick, setThick] = useState(false);
  const [markValue, setMarkValue] = useState(mark?.toString() ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [restored, setRestored] = useState(false);
  const [dirty, setDirty] = useState(false);

  const pdfBytes = useRef<ArrayBuffer | null>(null);
  const pdfPages = useRef<PDFPageProxy[]>([]);
  const pageCanvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const overlays = useRef<(HTMLCanvasElement | null)[]>([]);
  const holder = useRef<HTMLDivElement>(null);
  const stroke = useRef<Extract<Mark, { t: 'pen' | 'hl' }> | null>(null);
  const storageKey = `pm-marking:${ids.sheetId}:${ids.studentId}:${file.id}`;

  // Marks kept in this browser that were never sent (newer than the ones saved) come back.
  useEffect(() => {
    try {
      const local = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as { marks: Mark[]; at: number } | null;
      if (local && local.at > (saved?.at ?? 0) && local.marks.length) {
        setMarks(local.marks);
        setRestored(true);
        setDirty(true);
      }
    } catch { /* no browser storage: nothing to restore */ }
  }, [storageKey, saved?.at]);

  // Fetch the hand-in and read its pages.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(file.url);
        if (!res.ok) throw new Error(`download ${res.status}`);
        const bytes = await asPdf(await res.arrayBuffer());
        if (!bytes) { if (!cancelled) setStatus('unsupported'); return; }
        pdfBytes.current = bytes;
        // The "legacy" build adds what older browsers (e.g. an older iPad) are missing.
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
        // pdf.js takes over the bytes it is given, so it gets a copy.
        const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
        const list: PDFPageProxy[] = [];
        for (let i = 1; i <= doc.numPages; i++) list.push(await doc.getPage(i));
        if (cancelled) return;
        pdfPages.current = list;
        setPages(list.map((p) => {
          const vp = p.getViewport({ scale: 1 });
          return { view: { width: vp.width, height: vp.height, toPdf: (x, y) => vp.convertToPdfPoint(x, y) }, aspect: vp.height / vp.width };
        }));
        setStatus('ready');
      } catch (e) {
        console.error('marking: could not open the file', e);
        if (!cancelled) setStatus('failed');
      }
    })();
    return () => { cancelled = true; };
  }, [file.url]);

  // Draw each page as a picture, sharp on high-resolution screens, with the drawing layer the same size.
  useEffect(() => {
    if (status !== 'ready' || !holder.current) return;
    let cancelled = false;
    const width = holder.current.clientWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    (async () => {
      for (let i = 0; i < pdfPages.current.length && !cancelled; i++) {
        const page = pdfPages.current[i];
        const canvas = pageCanvases.current[i];
        const overlay = overlays.current[i];
        if (!canvas || !overlay) continue;
        const viewport = page.getViewport({ scale: (width / pages[i].view.width) * dpr });
        canvas.width = overlay.width = Math.floor(viewport.width);
        canvas.height = overlay.height = Math.floor(viewport.height);
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise.catch(() => {});
      }
    })();
    return () => { cancelled = true; };
  }, [status, pages]);

  // Redraw the marks whenever they change (and once the pages have their size).
  useEffect(() => {
    overlays.current.forEach((overlay, i) => {
      if (!overlay?.width) return;
      drawMarks(overlay.getContext('2d')!, marks.filter((m) => m.p === i), overlay.width, overlay.height);
    });
  }, [marks, pages, status]);

  // Keep unsent marks in this browser, and warn before closing the tab with unsent marks.
  useEffect(() => {
    if (!dirty) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ marks, at: Date.now() })); } catch { /* storage full or blocked */ }
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [marks, dirty, storageKey]);

  function change(next: Mark[]) {
    setUndoList((list) => [...list.slice(-99), marks]);
    setRedoList([]);
    setMarks(next);
    setDirty(true);
    setMessage(null);
  }
  function undo() {
    if (!undoList.length) return;
    setRedoList((list) => [marks, ...list]);
    setMarks(undoList[undoList.length - 1]);
    setUndoList((list) => list.slice(0, -1));
    setDirty(true);
  }
  function redo() {
    if (!redoList.length) return;
    setUndoList((list) => [...list, marks]);
    setMarks(redoList[0]);
    setRedoList((list) => list.slice(1));
    setDirty(true);
  }

  // Ctrl+Z / Ctrl+Y (Cmd on a Mac) for undo and redo.
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  });

  function point(e: React.PointerEvent<HTMLCanvasElement> | PointerEvent, el: HTMLCanvasElement) {
    const r = el.getBoundingClientRect();
    return [round((e.clientX - r.left) / r.width), round((e.clientY - r.top) / r.height)];
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>, page: number) {
    if (tool === 'scroll' || busy) return;
    e.preventDefault();
    const [x, y] = point(e, e.currentTarget);
    if (tool === 'pen' || tool === 'hl') {
      e.currentTarget.setPointerCapture(e.pointerId);
      stroke.current = tool === 'hl'
        ? { t: 'hl', p: page, c: HIGHLIGHT, w: HIGHLIGHTER, pts: [x, y] }
        : { t: 'pen', p: page, c: colour, w: thick ? PEN.thick : PEN.thin, pts: [x, y] };
      drawLive(page);
    } else if (tool === 'text') {
      const text = window.prompt('Text to write on the page:')?.trim();
      if (text) change([...marks, { t: 'text', p: page, c: colour, s: thick ? TEXT_SIZE * 1.4 : TEXT_SIZE, x, y, text }]);
    } else if (tool === 'tick' || tool === 'cross') {
      change([...marks, { t: tool, p: page, c: colour, s: thick ? SHAPE_SIZE * 1.5 : SHAPE_SIZE, x, y }]);
    } else if (tool === 'erase') {
      const hit = markAt(marks, page, x, y, pages[page].aspect);
      if (hit >= 0) change(marks.filter((_, i) => i !== hit));
    }
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>, page: number) {
    const current = stroke.current;
    if (!current || current.p !== page) return;
    // A fast pen sends several points per event; use them all for smooth lines.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const [x, y] = point(ev, e.currentTarget);
      const n = current.pts.length;
      if (Math.abs(x - current.pts[n - 2]) + Math.abs(y - current.pts[n - 1]) > 0.0015) current.pts.push(x, y);
    }
    drawLive(page);
  }

  function up() {
    const current = stroke.current;
    stroke.current = null;
    if (current) change([...marks, current]);
  }

  // While drawing a line, only that page is redrawn (straight onto its layer, without waiting for React).
  function drawLive(page: number) {
    const overlay = overlays.current[page];
    if (!overlay || !stroke.current) return;
    drawMarks(overlay.getContext('2d')!, [...marks.filter((m) => m.p === page), stroke.current], overlay.width, overlay.height);
  }

  async function makePdf() {
    if (!pdfBytes.current) throw new Problem('The homework file is not open yet.');
    try {
      return await markedPdf(pdfBytes.current, marks, pages.map((p) => p.view));
    } catch (e) {
      console.error('marking: could not make the PDF', e);
      throw new Problem('Could not make the marked PDF from this file. Use Open original and mark it the old way.');
    }
  }

  // sending: Save & send (the student sees it now); otherwise Save & close (kept unsent, then the tab closes).
  async function save(sending: boolean) {
    const markNumber = markValue.trim() === '' ? null : Number(markValue);
    if (sending && markNumber === null && !marked) { setMessage({ ok: false, text: 'Enter a mark, then Save & send.' }); return; }
    setMessage(null);
    try {
      setBusy('Making the marked PDF…');
      const bytes = await makePdf();
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });

      setBusy('Sending to Google Drive…');
      const start = await startMarkedUpload(ids, markNumber, blob.size, sending);
      if (!start.ok) throw new Problem(start.error);
      let driveFileId: string | null = null;
      let name = start.name;
      try {
        // Straight from this browser to Drive, so big files are fine.
        const res = await fetch(start.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: blob });
        if (res.ok) driveFileId = ((await res.json()) as { id: string }).id;
      } catch (e) {
        console.warn('marking: direct upload to Drive failed, trying through the server', e);
      }
      if (!driveFileId) {
        const form = new FormData();
        form.append('file', blob, 'marked.pdf');
        const via = await uploadMarkedViaServer(ids, markNumber, form, sending);
        if (!via.ok) throw new Problem(via.error);
        driveFileId = via.driveFileId;
        name = via.name;
      }

      setBusy('Saving…');
      const saved = { mark: markNumber, driveFileId, name, sourceFileId: file.id, drawings: { v: 1 as const, marks } };
      const done = sending ? await finishMarking(ids, saved) : await saveMarkingDraft(ids, saved);
      if (!done.ok) throw new Problem(done.error);
      try { localStorage.removeItem(storageKey); } catch { /* nothing kept */ }
      setDirty(false);
      setRestored(false);
      setMessage({ ok: true, text: done.message });
      if (!sending) {
        // Close this tab (it was opened from the batch page). Browsers that don't allow it go back to the batch.
        window.close();
        setTimeout(() => {
          window.location.href = `/batches/${ids.batchId}?ok=${encodeURIComponent(done.message)}#homework`;
        }, 400);
      }
    } catch (e) {
      console.error('marking: send failed', e);
      setMessage({ ok: false, text: e instanceof Problem ? e.message : 'Something went wrong. Your marks are kept in this browser; try again.' });
    } finally {
      setBusy(null);
    }
  }

  // The marked PDF to this computer, to send another way or keep.
  async function download() {
    setMessage(null);
    try {
      setBusy('Making the marked PDF…');
      const bytes = await makePdf();
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.label.replace(/\.[^.]+$/, '')} - marked.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Problem ? e.message : 'Could not make the marked PDF.' });
    } finally {
      setBusy(null);
    }
  }

  const original = (
    <a href={file.url} target="_blank" rel="noreferrer" className={ui.link}>Open original</a>
  );

  if (status === 'loading') return <p className={ui.card}>Opening the homework…</p>;
  if (status !== 'ready') {
    return (
      <p className={ui.card}>
        {status === 'unsupported'
          ? 'This file is not a PDF or photo, so it can\'t be marked here. '
          : 'The homework file could not be opened. '}
        {original}{file.driveUrl && <> · <a href={file.driveUrl} target="_blank" rel="noreferrer" className={ui.link}>Open in Google Drive</a></>}
      </p>
    );
  }

  return (
    <>
      <div className={styles.toolbar} role="toolbar" aria-label="Marking tools">
        <div className={styles.group}>
          {TOOLS.map((t) => (
            <button key={t.tool} type="button" title={t.title} aria-label={t.title} aria-pressed={tool === t.tool}
              className={`${styles.tool} ${tool === t.tool ? styles.on : ''}`} onClick={() => setTool(t.tool)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className={styles.group}>
          {COLOURS.map(([c, name]) => (
            <button key={c} type="button" title={name} aria-label={name} aria-pressed={colour === c}
              className={`${styles.swatch} ${colour === c ? styles.swatchOn : ''}`} style={{ background: c }} onClick={() => setColour(c)} />
          ))}
          <button type="button" className={`${styles.tool} ${thick ? styles.on : ''}`} aria-pressed={thick}
            title="Thicker pen, bigger text and ticks" onClick={() => setThick(!thick)}>
            {thick ? 'Thick' : 'Thin'}
          </button>
        </div>
        <div className={styles.group}>
          <button type="button" className={styles.tool} onClick={undo} disabled={!undoList.length} title="Undo (Ctrl+Z)">↶</button>
          <button type="button" className={styles.tool} onClick={redo} disabled={!redoList.length} title="Redo (Ctrl+Y)">↷</button>
        </div>
        <div className={`${styles.group} ${styles.send}`}>
          <label className={styles.markLabel}>
            Mark
            <input type="number" min={0} max={maxMark ?? undefined} step="0.5" value={markValue}
              onChange={(e) => setMarkValue(e.target.value)} className={ui.input} style={{ width: 80 }} />
            {maxMark !== null && <span className={ui.muted}>/ {maxMark}</span>}
          </label>
          <button type="button" className={ui.button} onClick={() => save(false)} disabled={!!busy}
            title="Keep the marked sheet without sending it; send it later from the batch page">
            Save &amp; close
          </button>
          <button type="button" className={ui.primaryButton} onClick={() => save(true)} disabled={!!busy}
            title="The student sees the marked sheet and the mark straight away">
            {busy ?? 'Save & send'}
          </button>
        </div>
      </div>

      {unsent && !restored && !message && (
        <p className={`${ui.alert} ${ui.alertOk}`} role="status">
          Saved but not sent yet. Change anything you like, then Save &amp; send (or Send on the batch page).
        </p>
      )}
      {restored && (
        <p className={`${ui.alert} ${ui.alertOk}`} role="status">
          Your unsent marks from this browser were brought back. Save &amp; send when ready.
        </p>
      )}
      {message && (
        <p className={`${ui.alert} ${message.ok ? ui.alertOk : ui.alertError}`} role={message.ok ? 'status' : 'alert'}>
          {message.text}{' '}
          {message.ok && <Link href={`/batches/${ids.batchId}#homework`} className={ui.link}>Back to the batch</Link>}
        </p>
      )}

      <p className={styles.extra}>
        <button type="button" className={styles.linkButton} onClick={download} disabled={!!busy}>Download marked PDF</button>
        {' · '}{original}
        {marked && markValue === '' && <> · <span className={ui.muted}>Already marked: leave Mark empty to keep the mark.</span></>}
      </p>

      <div ref={holder} className={`${styles.pages} ${tool === 'scroll' ? styles.scrolling : ''}`}>
        {pages.map((p, i) => (
          <div key={i} className={styles.page} style={{ aspectRatio: `${p.view.width} / ${p.view.height}` }}>
            <canvas ref={(el) => { pageCanvases.current[i] = el; }} className={styles.pdf} aria-label={`Page ${i + 1}`} />
            <canvas ref={(el) => { overlays.current[i] = el; }} className={styles.overlay}
              onPointerDown={(e) => down(e, i)} onPointerMove={(e) => move(e, i)} onPointerUp={up} onPointerCancel={up} />
          </div>
        ))}
      </div>
    </>
  );
}
