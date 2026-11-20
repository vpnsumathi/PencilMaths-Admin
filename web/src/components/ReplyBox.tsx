'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { MESSAGE_MAX } from '@/lib/messages';

// The box for writing a message, with a character count and a Send button that can't be pressed twice.
// Used by staff in a conversation and by students on their Messages page. hidden: the form's other fields.
export function ReplyBox({ action, hidden, placeholder, label, classes }: {
  action: (form: FormData) => Promise<void>;
  hidden?: Record<string, string>;
  placeholder: string;
  label: string;
  classes: { form: string; row: string; textarea: string; button: string; count: string };
}) {
  const [length, setLength] = useState(0);
  return (
    <form action={action} className={classes.form} onSubmit={(e) => {
      // Nothing to send: stay put (the database refuses an empty message too).
      const body = new FormData(e.currentTarget).get('body');
      if (!String(body ?? '').trim()) e.preventDefault();
    }}>
      {Object.entries(hidden ?? {}).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
      <div className={classes.row}>
        <textarea name="body" required maxLength={MESSAGE_MAX} rows={3} className={classes.textarea}
          placeholder={placeholder} aria-label={label} onChange={(e) => setLength(e.target.value.length)}
          onKeyDown={(e) => {
            // Ctrl+Enter (or Cmd+Enter on a Mac) sends; Enter alone starts a new line.
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); }
          }} />
        <SendButton className={classes.button} />
      </div>
      <span className={classes.count}>
        {length > MESSAGE_MAX - 200 ? `${length.toLocaleString('en-GB')} / ${MESSAGE_MAX.toLocaleString('en-GB')} characters` : 'Ctrl+Enter to send'}
      </span>
    </form>
  );
}

function SendButton({ className }: { className: string }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending}>{pending ? 'Sending…' : 'Send'}</button>;
}
