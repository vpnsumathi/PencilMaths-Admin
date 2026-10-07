import ui from './ui.module.css';

// The green (ok) and red (problem) messages that actions send back in the address (?ok=… / ?error=…).
export function Alerts({ ok, problem }: { ok?: string; problem?: string }) {
  return (
    <>
      {ok && <p className={`${ui.alert} ${ui.alertOk}`} role="status">{ok}</p>}
      {problem && <p className={`${ui.alert} ${ui.alertError}`} role="alert">{problem}</p>}
    </>
  );
}
