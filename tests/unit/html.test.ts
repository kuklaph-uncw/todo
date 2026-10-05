import { describe, it, expect } from "bun:test";
import { escapeHtml } from "../../src/lib/html";

describe("escapeHtml", () => {
  it("escapes ampersand", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes less-than", () => {
    expect(escapeHtml("a < b")).toBe("a &lt; b");
  });

  it("escapes greater-than", () => {
    expect(escapeHtml("a > b")).toBe("a &gt; b");
  });

  it("escapes double quote", () => {
    expect(escapeHtml('say "hi"')).toBe("say &quot;hi&quot;");
  });

  it("escapes single quote", () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("leaves plain alphanumeric text unchanged", () => {
    expect(escapeHtml("abc123")).toBe("abc123");
  });

  it("handles empty string without throwing", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("coerces a number input to string safely", () => {
    expect(escapeHtml(42)).toBe("42");
  });

  it("neutralizes a script injection payload", () => {
    const payload = "<script>alert(1)</script>";
    const result = escapeHtml(payload);
    expect(result.includes("<script>")).toBe(false);
  });
});
