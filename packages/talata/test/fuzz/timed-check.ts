import { MessageChannel, Worker, receiveMessageOnPort } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';
import type { Outcome } from './check';
import type { Features } from './features';

export const referenceTimeout = 'reference timed out';

export interface TimedCheck {
  check: (value: string, gfm: boolean, features: Features) => Outcome;
  close: () => void;
}

interface Running {
  worker: Worker;
  port: MessagePort;
  flags: Int32Array;
  // Set by the worker's `error` and `exit` events, seen between documents.
  dead: string | undefined;
}

function isReply(value: unknown): value is { id: number; outcome: Outcome } {
  return typeof value === 'object' && value != null && 'id' in value && 'outcome' in value;
}

function start(): Running {
  const buffer = new SharedArrayBuffer(16);
  const channel = new MessageChannel();
  const worker = new Worker(new URL('./check-worker.ts', import.meta.url), {
    workerData: { flags: buffer, port: channel.port2 },
    transferList: [channel.port2],
    // Plain Node resolution: no `development` condition from a test runner,
    // so the reference is its published build.
    execArgv: [],
  });
  worker.unref();
  channel.port1.unref();
  const flags = new Int32Array(buffer);
  // Module loading can take a few seconds on a busy machine.
  const deadline = Date.now() + 60_000;
  while (Atomics.load(flags, 2) === 0) {
    const left = deadline - Date.now();
    if (left <= 0) {
      throw new Error('fuzz worker did not start');
    }
    Atomics.wait(flags, 2, 0, left);
  }
  const running: Running = { worker, port: channel.port1, flags, dead: undefined };
  worker.on('error', (error: unknown) => {
    running.dead ??= `fuzz worker error: ${error instanceof Error ? error.message : String(error)}`;
  });
  worker.on('exit', (code) => {
    running.dead ??= `fuzz worker exited with code ${code}`;
  });
  return running;
}

/**
 * `check` in a worker thread with a time limit per document. The reference
 * parser can hang (`[^n]: x\n\n![ \n^n]` with GFM). A document whose reference
 * parse runs past the limit is a skip; one whose talata parse does is a throw.
 * The worker is then replaced. A comparison that throws, or a worker that
 * dies, is a throw too, never a timeout.
 */
export function createTimedCheck(timeoutMs: number): TimedCheck {
  let running: Running | undefined;
  let id = 0;
  return {
    check(value, gfm, features) {
      if (running?.dead !== undefined) {
        running = undefined;
      }
      running ??= start();
      const { port, flags } = running;
      id++;
      port.postMessage({ id, value, gfm, features });
      const deadline = Date.now() + timeoutMs;
      let done = Atomics.load(flags, 0);
      while (done !== id && Atomics.load(flags, 3) === 0) {
        const left = deadline - Date.now();
        if (left <= 0) {
          break;
        }
        Atomics.wait(flags, 0, done, left);
        done = Atomics.load(flags, 0);
      }
      if (done !== id) {
        const talataDone = Atomics.load(flags, 1) === id;
        const exited = Atomics.load(flags, 3) !== 0 || running.dead !== undefined;
        running.worker.terminate().catch(() => undefined);
        running = undefined;
        if (exited) {
          return { kind: 'throw', message: 'fuzz worker died during the check' };
        }
        if (talataDone) {
          return { kind: 'skip', reason: referenceTimeout };
        }
        return { kind: 'throw', message: `talata took more than ${timeoutMs} ms` };
      }
      const message = receiveMessageOnPort(port);
      const reply: unknown = message?.message;
      if (!isReply(reply) || reply.id !== id) {
        throw new Error('fuzz worker reply out of order');
      }
      return reply.outcome;
    },
    close() {
      if (running) {
        running.worker.terminate().catch(() => undefined);
        running = undefined;
      }
    },
  };
}
