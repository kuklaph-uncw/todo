import { describe, expect, it } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { McpSettingsStore } from "../../src/mcp/settings";
import { createTestVault } from "../helpers/test-vault";

describe("MCP settings", () => {
  it("starts disabled, persists preferences, and stores only a token hash", () => {
    const { root, cleanup } = createTestVault();
    try {
      const path = join(root, "settings.json");
      const store = new McpSettingsStore(path);
      expect(store.get()).toMatchObject({ enabled: false, background: false, port: 41821 });
      const token = store.rotateToken();
      store.save({ enabled: true, background: true, port: 41822 });
      expect(readFileSync(path, "utf8")).not.toContain(token);
      const reopened = new McpSettingsStore(path);
      expect(reopened.get()).toMatchObject({ enabled: true, background: true, port: 41822 });
      expect(reopened.acceptsToken(token)).toBe(true);
      reopened.rotateToken();
      expect(reopened.acceptsToken(token)).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("fails closed for damaged settings and rejects invalid ports", () => {
    const { root, cleanup } = createTestVault();
    try {
      const path = join(root, "settings.json");
      writeFileSync(path, '{"enabled":true,"port":"bad"}');
      const store = new McpSettingsStore(path);
      expect(store.get().enabled).toBe(false);
      expect(store.error).toContain("settings");
      expect(() => store.save({ enabled: true, background: false, port: 0 })).toThrow();
      expect(store.acceptsToken("anything")).toBe(false);
    } finally {
      cleanup();
    }
  });
});
