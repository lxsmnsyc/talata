// Loads the built package on the oldest supported Node (20) and parses a
// document through both the ESM and the CommonJS entry (imported from ESM).
import assert from 'node:assert/strict';

const major = Number(process.versions.node.split('.')[0]);
process.stdout.write(`node ${process.versions.node}\n`);

const source = '# Title\n\n* a\n* b\n\n| x | y |\n| - | - |\n| 1 | 2 |\n\n~~gone~~\n';
const esm = await import('../../packages/talata/dist/index.js');
const cjs = await import('../../packages/talata/dist/index.cjs');

for (const mod of [esm, cjs]) {
  const tree = mod.fromMarkdown(source, { gfm: true });
  assert.equal(tree.type, 'root');
  const types = tree.children.map((node) => node.type);
  assert.deepEqual(types, ['heading', 'list', 'table', 'paragraph']);
  assert.equal(tree.children[0].position.start.line, 1);
}
assert.deepEqual(esm.fromMarkdown(source, { gfm: true }), cjs.fromMarkdown(source, { gfm: true }));
process.stdout.write(`smoke ok (major ${major})\n`);
