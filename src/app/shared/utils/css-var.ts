/**
 * Resolves a CSS custom property to its computed value so it can be handed to
 * a canvas (Chart.js can't read `var(--x)` directly). Accepts either a raw
 * token name (`--color-amber`) or a `var(--color-amber)` expression.
 */
export function cssVarValue(expr: string): string {
  const name = expr.replace(/var\(\s*/, '').replace(/\s*\)\s*$/, '').trim();
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return resolved || expr;
}
