import { describe, expect, it, vi } from 'vitest';
import { fromMarkdown } from '../src/index';

// A failed bracket must not splice the delimiter stack: the splice moves every
// delimiter above it, which is quadratic when many sit there.
describe('failed brackets under many delimiters', () => {
  it('moves no more than a few elements per splice', () => {
    const markdown = '[*a '.repeat(2000) + ' a*]'.repeat(2000);
    const original = Array.prototype.splice;
    let moved = 0;
    const spy = vi.spyOn(Array.prototype, 'splice').mockImplementation(function spliceSpy(
      this: unknown[],
      ...args: Parameters<typeof original>
    ) {
      const start =
        args[0] < 0 ? Math.max(this.length + args[0], 0) : Math.min(args[0], this.length);
      const deleted =
        args.length > 1 ? Math.min(args[1], this.length - start) : this.length - start;
      moved = Math.max(moved, this.length - start - deleted);
      const result: unknown[] = Reflect.apply(original, this, args);
      return result;
    });
    try {
      fromMarkdown(markdown, { gfm: true });
    } finally {
      spy.mockRestore();
    }
    expect(moved).toBeLessThan(100);
  });
});
