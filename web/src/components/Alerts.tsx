import { FocusMessage } from './FocusMessage';
import ui from './ui.module.css';

// The green (ok) and red (problem) messages that actions send back in the address (?ok=… / ?error=…).
// The page moves to the message. The key is new on every page load, so the same message after another
// save is moved to again.
export function Alerts({ ok, problem }: { ok?: string; problem?: string }) {
  const shown = Date.now();
  return (
    <>
      {ok && <FocusMessage key={`ok${shown}`} className={`${ui.alert} ${ui.alertOk}`} role="status">{ok}</FocusMessage>}
      {problem && <FocusMessage key={`error${shown}`} className={`${ui.alert} ${ui.alertError}`} role="alert">{problem}</FocusMessage>}
    </>
  );
}
