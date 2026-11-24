/**
 * References: links kept apart from an entry's text, such as the agent thread
 * or ticket the work came from. In the daily note each one is a `🔗` line at
 * the end of its entry (see format.ts):
 *
 *   - Released v1.4.0 ^b4juh4
 *       🔗 [ToDo App Updates](t3-thread://v2/…)
 *       🔗 https://dev.azure.com/…
 */
export interface Reference {
  /** What the link says. Empty shows the address itself. */
  label: string;
  url: string;
}

export const REFERENCE_MARK = "🔗 ";

/** An address with a scheme (https:, mailto:, t3-thread:…), on one line with no control characters. */
export function isReferenceUrl(url: string): boolean {
  return url.length <= 2048 && url === url.trim() && /^[a-z][a-z0-9+.-]*:\S/i.test(url) && !/\p{Cc}/u.test(url);
}

const LABELLED = /^\[((?:\\.|[^\]\\])*)\]\((.*)\)$/;

/** `[label](address)`, `[label](<address>)`, `<address>` or a bare address; null for anything else. */
export function parseReference(text: string): Reference | null {
  const labelled = LABELLED.exec(text);
  const [label, destination] = labelled ? [labelled[1].replace(/\\(.)/g, "$1"), labelled[2]] : ["", text];
  const angled = /^<.*>$/.test(destination);
  const url = angled ? destination.slice(1, -1) : destination;
  // One link per line: no spaces outside <…>, and no second <…> inside one (two links, or a title).
  if (angled ? /[<>]/.test(url) : /\s/.test(url)) return null;
  return isReferenceUrl(url) ? { label, url } : null;
}

/** What the form accepts as an address: a scheme with //, or a mail or phone link. Not "TODO:later". */
const formAddress = (url: string) => /^[a-z][a-z0-9+.-]*:\/\/\S/i.test(url) || /^(?:mailto|tel):\S/i.test(url);

/** The Markdown for a reference, which parseReference reads back unchanged. */
export function formatReference({ label, url }: Reference): string {
  const plain = !/[\s<>]/.test(url) && balanced(url);
  const destination = plain ? url : `<${url}>`;
  return label ? `[${label.replace(/[\\[\]]/g, "\\$&")}](${destination})` : destination;
}

function balanced(url: string): boolean {
  let depth = 0;
  for (const char of url) {
    if (char === "(") depth++;
    if (char === ")" && --depth < 0) return false;
  }
  return depth === 0;
}

/**
 * References typed in a form, one per line: an address, a label then an
 * address, or a Markdown link. Lines without an address come back in `invalid`.
 */
export function parseReferenceLines(text: string): { references: Reference[]; invalid: string[] } {
  const references: Reference[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const words = line.split(/\s+/);
    const url = words.at(-1)!;
    const ref =
      parseReference(line) ??
      (isReferenceUrl(url) ? { label: line.slice(0, line.length - url.length).trim(), url } : null);
    if (ref && formAddress(ref.url)) references.push(ref);
    else invalid.push(line);
  }
  return { references, invalid };
}

/** The lines a form shows for editing references, which parseReferenceLines reads back. */
export function referenceLines(references: Reference[]): string {
  return references.map(formatReference).join("\n");
}
