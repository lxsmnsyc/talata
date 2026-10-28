// Worker side of timed-check.ts: runs `check` on each document it receives.
// The main thread waits on `flags` with a time limit, so a parser that never
// returns does not stop the run.
//
// flags[0]: id of the last document whose check finished.
// flags[1]: id of the last document talata finished parsing.
// flags[2]: 1 once the modules are loaded.
// flags[3]: 1 once the worker is exiting (an uncaught error, for one).
import { registerHooks } from 'node:module';
import type { MessagePort } from 'node:worker_threads';
import type { Outcome } from './check';
import type { Features } from './features';
import { workerData } from 'node:worker_threads';

// Hooks are per thread: register the .ts resolve hook here too (see cli.ts).
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith('.')) {
        throw error;
      }
      for (const suffix of ['.ts', '/index.ts']) {
        try {
          return nextResolve(specifier + suffix, context);
        } catch {
          // Try the next suffix.
        }
      }
      throw error;
    }
  },
});

interface Request {
  id: number;
  value: string;
  gfm: boolean;
  features: Features;
}

const { check } = await import('./check');
const { parseTalata } = await import('../parsers');

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- set by timed-check.ts
const data = workerData as { flags: SharedArrayBuffer; port: MessagePort };
const flags = new Int32Array(data.flags);
const port = data.port;

function messageOf(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

port.on('message', (request: Request) => {
  let outcome: Outcome;
  try {
    outcome = check(request.value, request.gfm, request.features, (value, gfm) => {
      const tree = parseTalata(value, gfm);
      Atomics.store(flags, 1, request.id);
      return tree;
    });
  } catch (error) {
    // `check` catches parser throws; this is the comparison itself (a deep
    // tree can overflow the stack in tree-diff.ts). A failure, not a skip.
    outcome = { kind: 'throw', message: `comparison threw: ${messageOf(error)}` };
  }
  port.postMessage({ id: request.id, outcome });
  Atomics.store(flags, 0, request.id);
  Atomics.notify(flags, 0);
});
// Wakes the main thread at once when the worker dies, so its wait does not
// end as a timeout. An out-of-memory kill runs no JavaScript and is not seen.
process.on('exit', () => {
  Atomics.store(flags, 3, 1);
  Atomics.notify(flags, 0);
});
Atomics.store(flags, 2, 1);
Atomics.notify(flags, 2);
