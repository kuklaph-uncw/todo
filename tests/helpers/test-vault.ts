import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Vault } from "../../src/vault/vault";
import type { AppContext } from "../../src/routes/shared";

/** A fresh vault in a temp folder. Call `cleanup()` in afterEach. */
export function createTestVault(): { vault: Vault; root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "ledger-test-"));
  return { vault: new Vault(root), root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** App context with the clock pinned to 2026-09-28 14:05 local time. */
export function createTestContext(): AppContext & { root: string; cleanup: () => void } {
  const { vault, root, cleanup } = createTestVault();
  return { vault, vaultPath: root, clock: () => new Date(2026, 8, 28, 14, 5), root, cleanup };
}

/** Builds a same-origin form POST like a browser would send. */
export function formPost(path: string, fields: Record<string, string | string[]>): Request {
  const body = new URLSearchParams();
  for (const [name, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) body.append(name, v);
  }
  return new Request(`http://127.0.0.1:3000${path}`, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "http://127.0.0.1:3000",
      host: "127.0.0.1:3000",
    },
  });
}

export function get(path: string): Request {
  return new Request(`http://127.0.0.1:3000${path}`, { headers: { host: "127.0.0.1:3000" } });
}
