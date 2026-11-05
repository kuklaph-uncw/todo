import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface McpPreferences {
  enabled: boolean;
  background: boolean;
  port: number;
}

export const DEFAULT_MCP_PREFERENCES: McpPreferences = { enabled: false, background: false, port: 41821 };

export function validPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1024 && port <= 65535;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Preferences belong in userData, outside the Markdown vault. Plaintext tokens are never saved here. */
export class McpSettingsStore {
  private preferences = { ...DEFAULT_MCP_PREFERENCES };
  private tokenHash: string | null = null;
  error: string | null = null;

  constructor(private readonly path: string) {
    if (!existsSync(path)) return;
    try {
      const data = JSON.parse(readFileSync(path, "utf8"));
      if (
        typeof data.enabled !== "boolean" ||
        typeof data.background !== "boolean" ||
        !validPort(data.port) ||
        (data.tokenHash !== null && (typeof data.tokenHash !== "string" || !/^[a-f0-9]{64}$/.test(data.tokenHash)))
      ) {
        throw new Error("Invalid settings");
      }
      this.preferences = { enabled: data.enabled, background: data.background, port: data.port };
      this.tokenHash = data.tokenHash;
    } catch {
      this.error = "Could not read MCP settings. Agent access is off. Save settings to replace this file.";
    }
  }

  get(): McpPreferences {
    return { ...this.preferences };
  }
  get hasToken(): boolean {
    return this.tokenHash !== null;
  }

  save(preferences: McpPreferences): void {
    if (
      !validPort(preferences.port) ||
      typeof preferences.enabled !== "boolean" ||
      typeof preferences.background !== "boolean"
    ) {
      throw new Error("Choose a port from 1024 to 65535.");
    }
    this.write(preferences, this.tokenHash);
  }

  rotateToken(): string {
    const token = randomBytes(32).toString("hex");
    this.write(this.preferences, hashToken(token));
    return token;
  }

  acceptsToken(token: string): boolean {
    return (
      this.tokenHash !== null &&
      timingSafeEqual(Buffer.from(hashToken(token), "hex"), Buffer.from(this.tokenHash, "hex"))
    );
  }

  private write(preferences: McpPreferences, tokenHash: string | null): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(`${this.path}.tmp`, `${JSON.stringify({ ...preferences, tokenHash }, null, 2)}\n`, "utf8");
    renameSync(`${this.path}.tmp`, this.path);
    this.preferences = { ...preferences };
    this.tokenHash = tokenHash;
    this.error = null;
  }
}
