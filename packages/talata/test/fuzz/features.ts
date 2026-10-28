/**
 * What the fuzzer may generate and compare. Talata is built in steps, so a
 * feature stays off until its roadmap node lands. A document is skipped when
 * the reference tree holds a node type that belongs to an off feature, so the
 * fuzzer reports no difference for work that does not exist yet.
 *
 * The node that adds a feature turns its flag on in `supported`. `--all` on
 * the command line turns every flag on.
 */
export interface Features {
  // ATX headings (`# a`).
  atx: boolean;
  thematicBreak: boolean;
  // Setext headings (`a\n---`).
  setext: boolean;
  // Indented and fenced code.
  code: boolean;
  blockquote: boolean;
  list: boolean;
  html: boolean;
  definition: boolean;
  // Escapes, entities, emphasis, code spans, links, images, inline html, backslash breaks.
  inline: boolean;
  strikethrough: boolean;
  table: boolean;
  footnote: boolean;
  taskList: boolean;
  autolinkLiteral: boolean;
}

export const supported: Features = {
  atx: true,
  thematicBreak: true,
  setext: true,
  code: true,
  blockquote: true,
  list: true,
  html: true,
  definition: true,
  inline: true,
  strikethrough: false,
  table: true,
  footnote: true,
  taskList: true,
  autolinkLiteral: false,
};

export function allFeatures(): Features {
  return {
    atx: true,
    thematicBreak: true,
    setext: true,
    code: true,
    blockquote: true,
    list: true,
    html: true,
    definition: true,
    inline: true,
    strikethrough: true,
    table: true,
    footnote: true,
    taskList: true,
    autolinkLiteral: true,
  };
}

export const featureNames: (keyof Features)[] = [
  'atx',
  'thematicBreak',
  'setext',
  'code',
  'blockquote',
  'list',
  'html',
  'definition',
  'inline',
  'strikethrough',
  'table',
  'footnote',
  'taskList',
  'autolinkLiteral',
];
