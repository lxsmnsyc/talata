// Loads talata for the benchmark pipelines. Returns undefined, with a note on
// stderr, while talata cannot run: its build is missing or fromMarkdown throws.
// Build it first with: pnpm --filter talata build
export async function loadTalata() {
  try {
    const { fromMarkdown } = await import('talata');
    fromMarkdown('# probe\n\n| a |\n| - |\n| b |\n', { gfm: true });
    return fromMarkdown;
  } catch (error) {
    console.error(`talata skipped: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}
