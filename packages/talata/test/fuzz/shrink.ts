// Splits into lines, keeping each line ending with its line.
function splitLines(value: string): string[] {
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 13 && value.charCodeAt(i + 1) === 10) {
      i++;
    }
    if (code === 10 || code === 13) {
      lines.push(value.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < value.length) {
    lines.push(value.slice(start));
  }
  return lines;
}

// Removes chunks of units while the document still fails. Chunks start at
// half the length and halve down to one unit.
function reduce(units: string[], fails: (value: string) => boolean, deadline: number): string[] {
  let current = units;
  let chunk = Math.ceil(current.length / 2);
  while (chunk >= 1 && Date.now() < deadline) {
    let i = 0;
    while (i < current.length && Date.now() < deadline) {
      const candidate: string[] = [];
      for (let j = 0; j < current.length; j++) {
        if (j < i || j >= i + chunk) {
          candidate.push(current[j]);
        }
      }
      if (fails(candidate.join(''))) {
        current = candidate;
      } else {
        i += chunk;
      }
    }
    chunk = chunk === 1 ? 0 : Math.ceil(chunk / 2);
  }
  return current;
}

/**
 * Shrinks a failing document to a smaller one that still fails. Removes
 * lines first, then characters, and repeats until nothing more goes away or
 * the time budget (in milliseconds) runs out.
 */
export default function shrink(
  input: string,
  fails: (value: string) => boolean,
  budget: number,
): string {
  const deadline = Date.now() + budget;
  let current = input;
  for (;;) {
    const before = current;
    current = reduce(splitLines(current), fails, deadline).join('');
    current = reduce(Array.from(current), fails, deadline).join('');
    if (current === before || Date.now() >= deadline) {
      return current;
    }
  }
}
