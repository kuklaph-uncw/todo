import { readFileSync } from "node:fs";

// Bun inlines this macro's result at build time. Loading one file as both JS
// and text confuses its bundler, so the shared module's source is embedded here.
export function richTextSource(): string {
  return readFileSync(new URL("../public/rich-text.js", import.meta.url), "utf8");
}
