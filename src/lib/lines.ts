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

/** Normalize prose without altering literal whitespace inside fenced code, including nested lists. */
export function mapOutsideFences(lines: string[], transform: (line: string) => string): string[] {
  let fence = "";
  return lines.map((line) => {
    if (fence) {
      const close = /^[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(line)?.[1];
      if (close && close[0] === fence[0] && close.length >= fence.length) fence = "";
      return line;
    }
    const open = /^[ \t]*(?:[-*+] |\d+\. )?(`{3,}|~{3,})(.*)$/.exec(line);
    if (open && !(open[1][0] === "`" && open[2].includes("`"))) fence = open[1];
    return transform(line);
  });
}
