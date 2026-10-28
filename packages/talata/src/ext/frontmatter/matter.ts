import type { RootContent } from 'mdast';
import type { BlockRule, BlockState, OpenBlock } from '../../core/blocks';
import { CR, LF, isSpaceOrTab } from '../../core/chars';
import type { Line } from '../../core/line';
import type { Registry } from '../../core/registry';
import { point, skipLineEnding } from '../../core/source';

/** One kind of matter with its fences resolved to strings. */
export interface ResolvedMatter {
  type: string;
  open: string;
  close: string;
  anywhere: boolean;
}

/** The offset of the line ending at or after `from`, or the end of the text. */
function lineEnd(text: string, from: number): number {
  let i = from;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (code === LF || code === CR) {
      break;
    }
    i++;
  }
  return i;
}

/** Whether `fence` is at `from` and only spaces and tabs follow up to `end`. */
function fenceAt(text: string, from: number, end: number, fence: string): boolean {
  if (from + fence.length > end || !text.startsWith(fence, from)) {
    return false;
  }
  for (let i = from + fence.length; i < end; i++) {
    if (!isSpaceOrTab(text.charCodeAt(i))) {
      return false;
    }
  }
  return true;
}

class OpenMatter implements OpenBlock {
  name = 'frontmatter';
  isContainer = false;
  acceptsLazy = false;
  type: string;
  start: number;
  /** Offset of the end of the closing fence line. */
  end: number;
  value: string;
  closed = false;

  constructor(type: string, start: number, end: number, value: string) {
    this.type = type;
    this.start = start;
    this.end = end;
    this.value = value;
  }

  continue(): boolean {
    return !this.closed;
  }

  addLine(_state: BlockState, line: Line): void {
    if (line.end >= this.end) {
      this.closed = true;
    }
    line.start = line.end;
  }

  close(state: BlockState): RootContent {
    // The node types `yaml`, `toml` and custom ones are not in `@types/mdast`.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return {
      type: this.type,
      value: this.value,
      position: { start: point(state.source, this.start), end: point(state.source, this.end) },
    } as unknown as RootContent;
  }
}

/**
 * Looks for the matter that opens on the line at `from`. It must be closed:
 * the value is what lies between the fences, without the line ending before
 * the closing fence.
 */
function open(
  text: string,
  from: number,
  end: number,
  matter: ResolvedMatter,
  noClose: number[],
  index: number,
): OpenMatter | null | undefined {
  if (!fenceAt(text, from, end, matter.open)) {
    return undefined;
  }
  if (end >= text.length) {
    return null;
  }
  const contentStart = skipLineEnding(text, end);
  // An earlier scan from `noClose[index]` found no closing fence, so a later one cannot either.
  if (noClose[index] <= contentStart) {
    return null;
  }
  let lineStart = contentStart;
  let previousEnd = contentStart;
  while (lineStart < text.length) {
    const eol = lineEnd(text, lineStart);
    if (fenceAt(text, lineStart, eol, matter.close)) {
      return new OpenMatter(matter.type, from, eol, text.slice(contentStart, previousEnd));
    }
    previousEnd = eol;
    lineStart = skipLineEnding(text, eol);
  }
  noClose[index] = contentStart;
  return null;
}

/** Per parse: for each matter, the offset from which a scan found no closing fence. Keyed by the parse's source. */
const noCloseByParse = new WeakMap<object, number[]>();

/**
 * Rules that start containers. micromark does not look for new containers
 * while a concrete construct such as a matter is being tried, and it tries an
 * opening fence without a closing one until the end of the document. So after
 * such a fence (`---\n> a` gives a thematic break and a paragraph) no
 * container starts on the lines that follow.
 */
const CONTAINER_RULES = ['blockquote', 'listItem', 'footnoteDefinition', 'directiveContainer'];

const withoutContainers = new WeakMap<Registry, Registry>();

/** Registries made by `dropContainers`, so a second call on one returns it as is. */
const dropped = new WeakSet<Registry>();

function dropContainers(rules: Registry): Registry {
  if (dropped.has(rules)) {
    return rules;
  }
  let result = withoutContainers.get(rules);
  if (result === undefined) {
    const blockByChar: BlockRule[][] = [];
    for (const list of rules.blockByChar) {
      const kept: BlockRule[] = [];
      for (const rule of list) {
        if (!CONTAINER_RULES.includes(rule.name)) {
          kept.push(rule);
        }
      }
      blockByChar.push(kept);
    }
    const blockOther: BlockRule[] = [];
    for (const rule of rules.blockOther) {
      if (!CONTAINER_RULES.includes(rule.name)) {
        blockOther.push(rule);
      }
    }
    result = { ...rules, blockByChar, blockOther };
    withoutContainers.set(rules, result);
    dropped.add(result);
  }
  return result;
}

/** The block rule for a list of matters, tried in list order as the reference does. */
export function matterRule(matters: ResolvedMatter[]): BlockRule {
  let triggers: string | undefined = '';
  let anywhere = false;
  for (const matter of matters) {
    anywhere = anywhere || matter.anywhere;
    if (matter.open.charCodeAt(0) < 128) {
      if (triggers !== undefined && !triggers.includes(matter.open[0])) {
        triggers += matter.open[0];
      }
    } else {
      triggers = undefined;
    }
  }
  return {
    name: 'frontmatter',
    priority: 50,
    canInterruptParagraph: anywhere,
    triggers,
    start(state: BlockState, line: Line): OpenBlock | undefined {
      if (
        state.container.name !== 'root' ||
        line.start !== state.source.lineStarts[line.index] ||
        line.nonBlank !== line.start
      ) {
        return undefined;
      }
      const text = line.text;
      let unclosed = false;
      let noClose = noCloseByParse.get(state.source);
      if (noClose === undefined) {
        noClose = [];
        for (let i = 0; i < matters.length; i++) {
          noClose.push(Infinity);
        }
        noCloseByParse.set(state.source, noClose);
      }
      for (let i = 0; i < matters.length; i++) {
        const matter = matters[i];
        if (line.index === 0 || matter.anywhere) {
          const block = open(text, line.start, line.end, matter, noClose, i);
          if (block === null) {
            unclosed = true;
          } else if (block !== undefined) {
            line.start = line.end;
            return block;
          }
        }
      }
      if (unclosed && line.end < text.length) {
        state.rules = dropContainers(state.rules);
      }
      return undefined;
    },
  };
}
