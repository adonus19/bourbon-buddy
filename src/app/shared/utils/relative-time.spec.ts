import { relativeTime } from './relative-time';

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const sec = (n: number) => new Date(NOW - n * 1000);
const min = (n: number) => sec(n * 60);
const hr = (n: number) => min(n * 60);
const day = (n: number) => hr(n * 24);

describe('relativeTime', () => {
  it('returns empty string for null', () => {
    expect(relativeTime(null, NOW)).toBe('');
  });

  it('returns "just now" under a minute', () => {
    expect(relativeTime(sec(5), NOW)).toBe('just now');
    expect(relativeTime(sec(59), NOW)).toBe('just now');
  });

  it('reports minutes, hours, and days', () => {
    expect(relativeTime(min(5), NOW)).toBe('5m ago');
    expect(relativeTime(hr(3), NOW)).toBe('3h ago');
    expect(relativeTime(day(2), NOW)).toBe('2d ago');
  });

  it('falls back to a locale date beyond ~30 days', () => {
    const old = day(45);
    expect(relativeTime(old, NOW)).toBe(old.toLocaleDateString());
  });
});
