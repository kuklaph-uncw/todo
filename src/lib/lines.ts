/** Includes blank lines only before continuations indented past the parent, returning the exclusive end. */
export function continuationEnd(lines: string[], start: number, indent: number): number {
  let end = start;
  for (let next = start; next < lines.length; next++) {
    if (!lines[next].trim()) continue;
    const width = /^[ \t]*/.exec(lines[next])![0].replace(/\t/g, "    ").length;
    if (width <= indent) break;
    end = next + 1;
  }
  return end;
}
