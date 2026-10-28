import { unified } from 'unified';
import { describe, expect, it, vi } from 'vitest';
import { fromMarkdown } from '../src/index';
import talata from '../src/unified';

vi.mock('../src/index', () => ({
  fromMarkdown: vi.fn(() => ({ type: 'root', children: [] })),
}));

describe('unified plugin options', () => {
  it('forwards the options to fromMarkdown', () => {
    unified().use(talata, { gfm: true }).parse('~~a~~');
    expect(fromMarkdown).toHaveBeenLastCalledWith('~~a~~', { gfm: true });
    unified().use(talata, { gfm: false }).parse('b');
    expect(fromMarkdown).toHaveBeenLastCalledWith('b', { gfm: false });
  });

  it('defaults to no options', () => {
    unified().use(talata).parse('c');
    expect(fromMarkdown).toHaveBeenLastCalledWith('c', {});
  });
});
