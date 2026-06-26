/** Compact relative time, e.g. "2h ago", "3d ago", or a date for older items. */
export function relativeTime(date: Date | null, now: number = Date.now()): string {
  if (!date) {
    return '';
  }
  const sec = Math.round((now - date.getTime()) / 1000);
  if (sec < 60) {
    return 'just now';
  }
  const min = Math.round(sec / 60);
  if (min < 60) {
    return `${min}m ago`;
  }
  const hr = Math.round(min / 60);
  if (hr < 24) {
    return `${hr}h ago`;
  }
  const day = Math.round(hr / 24);
  if (day < 30) {
    return `${day}d ago`;
  }
  return date.toLocaleDateString();
}
