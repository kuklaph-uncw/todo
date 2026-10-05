const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escapes &, <, >, ", ' for safe interpolation into HTML text content
 * or double-quoted attribute values. Used everywhere in this app;
 * do not add a separate escapeAttr since attributes are always double-quoted.
 */
export function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]);
}
