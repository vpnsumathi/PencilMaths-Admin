// The WhatsApp number helper, used by the Dashboard's nudge, the Class Schedule and extra classes.
// (The Dashboard's homework numbers now come from dashboard_summary(), guide 28.)

// UK mobile "07700 900123" → "447700900123", the form wa.me links need. null if it doesn't look like a number.
export function whatsappNumber(phone: string | null) {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1) || null;
  if (digits.startsWith('00')) return digits.slice(2) || null;
  if (digits.startsWith('0')) return `44${digits.slice(1)}`;
  return digits.length >= 10 ? digits : null;
}
