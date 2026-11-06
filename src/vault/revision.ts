import { createHash } from "node:crypto";
import type { Vault } from "./vault";

/** A revision describes content, without adding metadata to the user's Markdown. */
export function contentRevision(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/** Draft-safe page notices cover both task and ledger changes without assigning IDs. */
export function vaultRevision(vault: Vault): string {
  return contentRevision({
    todos: vault.peekTodos(),
    entries: vault.listDates().flatMap((date) => vault.peekEntries(date)),
  });
}
