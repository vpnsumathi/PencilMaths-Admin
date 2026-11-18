import { FocusMessage } from './FocusMessage';
import ui from './ui.module.css';
import { times12 } from '@/lib/format';

// The green (ok) and red (problem) messages that actions send back in the address (?ok=… / ?error=…).
// The page moves to the message. The key is new on every page load, so the same message after another
// save is moved to again. Times in a message (often from the database) show on the 12-hour clock.
export function Alerts({ ok, problem }: { ok?: string; problem?: string }) {
  const shown = Date.now();
  return (
    <>
      {ok && <FocusMessage key={`ok${shown}`} className={`${ui.alert} ${ui.alertOk}`} role="status">{times12(ok)}</FocusMessage>}
      {problem && <FocusMessage key={`error${shown}`} className={`${ui.alert} ${ui.alertError}`} role="alert">{times12(problem)}</FocusMessage>}
    </>
  );
}
