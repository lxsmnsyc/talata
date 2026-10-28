import { readFileSync } from 'node:fs';
import { corpusFiles, specExamples, specText } from '../parsers';
import { check } from './check';
import type { Outcome } from './check';
import type { Features } from './features';
import { generateDocument, generatePathological } from './generate';
import { mutate, sliceLines } from './mutate';
import { createRandom, documentSeed } from './random';
import shrink from './shrink';

export interface RunOptions {
  count: number;
  seed: number;
  // Index of the first document, to replay one document of an earlier run.
  start: number;
  gfm: boolean;
  features: Features;
  // Failures to minimize and report. The run goes on counting after that.
  maxFailures: number;
  // Time budget for minimizing one failure, in milliseconds.
  shrinkBudget: number;
  // Mutate corpus files too. Off, the seeds are the spec examples only.
  corpus: boolean;
  // Include pathological documents (default true). The smoke test turns them off.
  pathological?: boolean;
  onProgress?: (done: number) => void;
}

export interface Failure {
  index: number;
  kind: 'diff' | 'throw';
  source: string;
  minimized: string;
  message: string;
}

export interface Report {
  documents: number;
  compared: number;
  skipped: number;
  skipReasons: Record<string, number>;
  failures: number;
  reported: Failure[];
}

/** Starting texts for mutation: the spec examples and, when downloaded, the corpus files. */
export function loadSeeds(corpus: boolean): string[] {
  const seeds: string[] = [];
  for (const example of specExamples) {
    seeds.push(specText(example.markdown));
  }
  if (corpus) {
    for (const file of corpusFiles()) {
      seeds.push(readFileSync(file.path, 'utf8'));
    }
  }
  return seeds;
}

/** Rebuilds document `index` of a run. */
export function documentAt(
  seed: number,
  index: number,
  features: Features,
  seeds: string[],
  pathological = true,
): string {
  const random = createRandom(documentSeed(seed, index));
  const roll = random.next();
  if (roll < 0.03 && pathological) {
    return generatePathological(random);
  }
  if (roll < 0.55 || seeds.length === 0) {
    return generateDocument(random, features);
  }
  if (roll < 0.8) {
    return mutate(random, generateDocument(random, features));
  }
  const source = random.pick(seeds);
  return mutate(random, source.length > 400 ? sliceLines(random, source, 30) : source);
}

function failureKind(outcome: Outcome): 'diff' | 'throw' | undefined {
  return outcome.kind === 'diff' || outcome.kind === 'throw' ? outcome.kind : undefined;
}

export function runFuzz(options: RunOptions): Report {
  const { count, seed, start, gfm, features } = options;
  const seeds = loadSeeds(options.corpus);
  const report: Report = {
    documents: 0,
    compared: 0,
    skipped: 0,
    skipReasons: {},
    failures: 0,
    reported: [],
  };
  const seen = new Set<string>();
  for (let n = 0; n < count; n++) {
    const index = start + n;
    const source = documentAt(seed, index, features, seeds, options.pathological ?? true);
    const outcome = check(source, gfm, features);
    report.documents++;
    if (outcome.kind === 'skip') {
      report.skipped++;
      report.skipReasons[outcome.reason] = (report.skipReasons[outcome.reason] ?? 0) + 1;
    } else {
      report.compared++;
    }
    const kind = failureKind(outcome);
    if (kind !== undefined) {
      report.failures++;
      if (report.reported.length < options.maxFailures) {
        const minimized = shrink(
          source,
          (value) => failureKind(check(value, gfm, features)) === kind,
          options.shrinkBudget,
        );
        if (!seen.has(minimized)) {
          seen.add(minimized);
          const final = check(minimized, gfm, features);
          const message = final.kind === 'diff' || final.kind === 'throw' ? final.message : '';
          report.reported.push({ index, kind, source, minimized, message });
        }
      }
    }
    if (options.onProgress && (n + 1) % 10000 === 0) {
      options.onProgress(n + 1);
    }
  }
  return report;
}
