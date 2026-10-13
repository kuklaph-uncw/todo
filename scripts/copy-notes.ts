/**
 * Runs before `bun run dev`: replaces ./vault with a fresh copy of your real
 * notes, so development shows your own data without touching it. Anything
 * added while developing is thrown away on the next start.
 *
 * Skipped when VAULT_PATH is set (e.g. VAULT_PATH=demo-vault bun run dev).
 */
import { cpSync, existsSync, lstatSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { resolveVaultPath } from "../src/launch";

if (!process.env.VAULT_PATH) {
  const source = resolveVaultPath({ standalone: true, home: homedir(), cwd: process.cwd() });
  const target = resolve("vault");
  // A linked ./vault could point at the real notes, which this would then delete.
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
    console.error(`./vault is a link, so it wasn't replaced. Remove the link, or set VAULT_PATH.`);
    process.exit(1);
  }
  rmSync(target, { recursive: true, force: true });
  if (existsSync(source)) {
    // dereference: linked folders inside the notes are copied, not linked back to the originals.
    cpSync(source, target, { recursive: true, dereference: true });
    console.log(`Copied your notes from ${source} to ./vault. Changes there are discarded on the next start.`);
  } else {
    console.log(`No notes at ${source} yet, so ./vault starts empty.`);
  }
}
