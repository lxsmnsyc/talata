import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fromMarkdown as reference } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import type { Root } from 'mdast';
import { toHast } from 'mdast-util-to-hast';
import { toHtml } from 'hast-util-to-html';
import { directiveFromMarkdown } from 'mdast-util-directive';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { mathFromMarkdown } from 'mdast-util-math';
import { directive } from 'micromark-extension-directive';
import { frontmatter } from 'micromark-extension-frontmatter';
import { math } from 'micromark-extension-math';
import { mdxFromMarkdown } from 'mdast-util-mdx';
import { mdx } from 'micromark-extension-mdx';
import { fromMarkdown } from '../src';
import { directive as talataDirective } from '../src/directive';
import type { Extension } from '../src/ext/api';
import { frontmatter as talataFrontmatter } from '../src/frontmatter';
import { math as talataMath } from '../src/math';
import { MdxError, mdx as talataMdx } from '../src/mdx';

// Talata's suites stay skipped until the matching part of the parser exists.
// The roadmap node that lands a feature turns its flag on.
export const ready = {
  // The block and inline parser: CommonMark spec examples, with and without gfm.
  commonmark: true,
  // Every file of the benchmark corpus, parsed without and with gfm (files
  // that need unbuilt GFM features wait in corpus.test.ts).
  corpus: true,
  // One flag per GFM feature. Each gates the spec examples of that section.
  gfm: {
    table: true,
    strikethrough: true,
    autolinkLiteral: true,
    taskList: true,
    footnote: true,
  },
};

export type ExtensionName = 'frontmatter' | 'math' | 'directive' | 'mdx';

/** Options a test may pass to an extension. Both sides get the same value. */
export interface ExtensionOptions {
  frontmatter?: Parameters<typeof frontmatter>[0];
  math?: Parameters<typeof math>[0];
}

type ReferenceOptions = NonNullable<Parameters<typeof reference>[1]>;
type SyntaxExtensions = NonNullable<ReferenceOptions['extensions']>;
type MdastExtensions = NonNullable<ReferenceOptions['mdastExtensions']>;

// The reference side of each extension: the micromark and mdast extensions.
// `names` order is the order of the lists, as in a real call.
function referenceExtensions(
  names: readonly ExtensionName[],
  options: ExtensionOptions,
): { extensions: SyntaxExtensions; mdastExtensions: MdastExtensions } {
  const extensions: SyntaxExtensions = [];
  const mdastExtensions: MdastExtensions = [];
  for (const name of names) {
    if (name === 'frontmatter') {
      extensions.push(frontmatter(options.frontmatter));
      mdastExtensions.push(frontmatterFromMarkdown(options.frontmatter));
    } else if (name === 'math') {
      extensions.push(math(options.math));
      mdastExtensions.push(mathFromMarkdown());
    } else if (name === 'directive') {
      extensions.push(directive());
      mdastExtensions.push(directiveFromMarkdown());
    } else {
      extensions.push(mdx());
      mdastExtensions.push(mdxFromMarkdown());
    }
  }
  return { extensions, mdastExtensions };
}

/** The talata side of each extension, from the subpath modules. */
export function talataExtensions(
  names: readonly ExtensionName[],
  options: ExtensionOptions = {},
): Extension[] {
  const result: Extension[] = [];
  for (const name of names) {
    if (name === 'frontmatter') {
      result.push(talataFrontmatter(options.frontmatter));
    } else if (name === 'math') {
      result.push(talataMath(options.math));
    } else if (name === 'directive') {
      result.push(talataDirective());
    } else {
      result.push(talataMdx());
    }
  }
  return result;
}

interface Place {
  line: number;
  column: number;
}

interface ReferenceMessage {
  reason: string;
  place?: Place | { start: Place; end: Place } | null;
}

function isReferenceMessage(error: unknown): error is ReferenceMessage {
  return error instanceof Error && 'reason' in error && !(error instanceof MdxError);
}

function stringifyPlace(place: Place | { start: Place; end: Place }): string {
  if ('start' in place) {
    return `${place.start.line}:${place.start.column}-${place.end.line}:${place.end.column}`;
  }
  return `${place.line}:${place.column}`;
}

/**
 * With MDX, a syntax error becomes a root with no children and the error
 * message in `data.mdxError`, on both sides: the reason, then ` at ` and the
 * place when there is one. A case where both throw then compares as a tree,
 * and matches only when the messages match.
 */
export function errorRoot(message: string): Root {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `data` holds a field of its own
  return { type: 'root', children: [], data: { mdxError: message } } as Root;
}

/**
 * The reference parser. `names` lists the extensions to turn on, after GFM.
 */
export function parseReference(
  value: string,
  useGfm: boolean,
  names: readonly ExtensionName[] = [],
  options: ExtensionOptions = {},
): Root {
  const added = referenceExtensions(names, options);
  if (!useGfm && names.length === 0) {
    return reference(value);
  }
  try {
    return reference(value, {
      extensions: [...(useGfm ? [gfm()] : []), ...added.extensions],
      mdastExtensions: [...(useGfm ? [gfmFromMarkdown()] : []), ...added.mdastExtensions],
    });
  } catch (error) {
    if (!names.includes('mdx') || !isReferenceMessage(error)) {
      throw error;
    }
    const place = error.place;
    return errorRoot(
      place === undefined || place === null
        ? error.reason
        : `${error.reason} at ${stringifyPlace(place)}`,
    );
  }
}

export function parseTalata(
  value: string,
  useGfm: boolean,
  names: readonly ExtensionName[] = [],
  options: ExtensionOptions = {},
): Root {
  try {
    return fromMarkdown(value, { gfm: useGfm, extensions: talataExtensions(names, options) });
  } catch (error) {
    if (error instanceof MdxError) {
      return errorRoot(error.message);
    }
    throw error;
  }
}

export function toHtmlString(tree: Root): string {
  return toHtml(toHast(tree, { allowDangerousHtml: true }), { allowDangerousHtml: true });
}

// The spec file writes tabs as "→".
export function specText(text: string): string {
  return text.replaceAll('→', '\t');
}

export function normalizeHtml(html: string): string {
  return html.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim();
}

export interface SpecExample {
  markdown: string;
  html: string;
  section: string;
  number: number;
}

function isSpecModule(value: unknown): value is { tests: SpecExample[] } {
  return (
    typeof value === 'object' && value != null && 'tests' in value && Array.isArray(value.tests)
  );
}

function loadSpecExamples(): SpecExample[] {
  const spec: unknown = createRequire(import.meta.url)('commonmark-spec');
  if (!isSpecModule(spec)) {
    throw new Error('commonmark-spec did not export a tests array');
  }
  return spec.tests;
}

export const specExamples: SpecExample[] = loadSpecExamples();

export type GfmFeature = keyof typeof ready.gfm;

export interface GfmExample {
  number: number;
  section: string;
  // The flag that gates the example. "tagfilter" examples differ only in HTML
  // output, so they run with the commonmark flag.
  feature: GfmFeature | 'tagfilter';
  markdown: string;
  html: string;
}

interface GfmFixture {
  source: string;
  examples: GfmExample[];
}

function isGfmFixture(value: unknown): value is GfmFixture {
  return (
    typeof value === 'object' &&
    value != null &&
    'examples' in value &&
    Array.isArray(value.examples)
  );
}

// Examples from the extension sections of the cmark-gfm spec. See
// fixtures/gfm-spec.json for the source URL and license.
function loadGfmExamples(): GfmExample[] {
  const text = readFileSync(new URL('./fixtures/gfm-spec.json', import.meta.url), 'utf8');
  const fixture: unknown = JSON.parse(text);
  if (!isGfmFixture(fixture)) {
    throw new Error('fixtures/gfm-spec.json has no examples array');
  }
  return fixture.examples;
}

export const gfmExamples: GfmExample[] = loadGfmExamples();

// Footnotes are not in the cmark-gfm spec, so these inputs are hand-written
// from the syntax GitHub documents.
export const footnoteInputs: string[] = [
  'Text[^1].\n\n[^1]: Note.\n',
  'Text[^a] and again[^a].\n\n[^a]: Note.\n',
  'Text[^missing].\n',
  '[^1]: Defined first.\n\nText[^1].\n',
  'Text[^1].\n\n[^1]: First paragraph.\n\n    Second paragraph.\n',
  'Text[^1].\n\n[^1]:\n    - item\n    - item\n',
  'Text[^big note].\n\n[^big note]: Note.\n',
  'Text[^1].\n\n[^1]: Note with `code` and *emphasis*.\n',
];

export interface CorpusFile {
  name: string;
  path: URL;
}

const corpusDir = new URL('../../../benchmark/corpus/', import.meta.url);

// The corpus is downloaded with `pnpm --filter benchmark corpus`. When it is
// missing this returns an empty list, and the corpus suites skip.
export function corpusFiles(): CorpusFile[] {
  const files: CorpusFile[] = [];
  for (const folder of ['readmes', 'large']) {
    const dir = new URL(`${folder}/`, corpusDir);
    if (!existsSync(dir)) {
      continue;
    }
    for (const name of readdirSync(dir).toSorted()) {
      if (name.endsWith('.md')) {
        files.push({ name: `${folder}/${name}`, path: new URL(name, dir) });
      }
    }
  }
  return files;
}
