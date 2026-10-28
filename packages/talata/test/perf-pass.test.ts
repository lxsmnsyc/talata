import { describe, expect, it } from 'vitest';
import { fromMarkdown } from '../src/index';

// A failed bracket must not splice the delimiter stack: the splice moves every
// delimiter above it, which is quadratic when many sit there.
describe('failed brackets under many delimiters', () => {
  it('moves no more than a few elements per splice', () => {
    const markdown = '[*a '.repeat(2000) + ' a*]'.repeat(2000);
    const original = Array.prototype.splice;
    let moved = 0;
    Array.prototype.splice = function (this: unknown[], ...args: [number, number?]) {
      const start =
        args[0] < 0 ? Math.max(this.length + args[0], 0) : Math.min(args[0], this.length);
      const deleted =
        args.length > 1 ? Math.min(args[1] ?? 0, this.length - start) : this.length - start;
      moved = Math.max(moved, this.length - start - deleted);
      return (original as (...a: unknown[]) => unknown[]).apply(this, args);
    } as typeof Array.prototype.splice;
    try {
      fromMarkdown(markdown, { gfm: true });
    } finally {
      Array.prototype.splice = original;
    }
    expect(moved).toBeLessThan(100);
  });
});
