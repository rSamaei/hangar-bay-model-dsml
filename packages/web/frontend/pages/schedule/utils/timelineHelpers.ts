export function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
}

export function blockCol(id: number, cols: readonly string[]): string {
  return cols[id % cols.length];
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function fmtTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function fmtDateTime(d: Date): string {
  return `${fmtDate(d)} ${fmtTime(d)}`;
}

export function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseDateInput(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date();
  d.setFullYear(+m[1], +m[2] - 1, +m[3]);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function headerTickStep(pxH: number): number {
  if (pxH >= 80) return 1;
  if (pxH >= 40) return 2;
  if (pxH >= 18) return 6;
  return 12;
}
