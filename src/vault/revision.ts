import { createHash } from "node:crypto";

/** A revision describes content, without adding metadata to the user's Markdown. */
export function contentRevision(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
