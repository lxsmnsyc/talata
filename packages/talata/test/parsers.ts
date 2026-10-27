import { createRequire } from 'node:module';
import { fromMarkdown as reference } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import type { Root } from 'mdast';
import { toHast } from 'mdast-util-to-hast';
import { toHtml } from 'hast-util-to-html';
import { fromMarkdown } from '../src';

// Talata's suites stay skipped until the parser exists. The roadmap node that
// lands the block parser sets this to true.
export const READY = false;

export function parseReference(value: string, useGfm: boolean): Root {
  if (!useGfm) {
    return reference(value);
  }
  return reference(value, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });
}

export function parseTalata(value: string, useGfm: boolean): Root {
  return fromMarkdown(value, { gfm: useGfm });
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
