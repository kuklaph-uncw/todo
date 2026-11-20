import { expect, it } from "bun:test";
import { externalNavigationUrl } from "../../src/electron/navigation";

it("allows only web links from the app to open externally", () => {
  const url = "https://example.com/page?id=one&type=page";
  expect(externalNavigationUrl("app://local/", url)).toBe(url);
  expect(externalNavigationUrl("app://local/", "http://example.com/")).toBe("http://example.com/");
  expect(externalNavigationUrl("https://example.org/", url)).toBeNull();
  for (const target of [
    "file:///C:/secret",
    "javascript:alert(1)",
    "data:text/html,bad",
    "app://local/settings",
    "ms-settings:display",
    "https://user:password@example.com",
    "https://example.com/\npath",
    "https:\\example.com",
    "https://",
  ]) {
    expect(externalNavigationUrl("app://local/", target)).toBeNull();
  }
});
