import { expect, it } from "bun:test";
import { WindowLifecycle } from "../../src/electron/lifecycle";

it("hides on close only with background enabled, restores on open, and allows explicit quit", () => {
  let background = false;
  let hidden = false;
  let prevented = false;
  let quit = false;
  const lifecycle = new WindowLifecycle(
    {
      hide: () => {
        hidden = true;
      },
      show: () => {
        hidden = false;
      },
      focus() {},
      isMinimized: () => false,
      restore() {},
    },
    () => background,
    () => {
      quit = true;
    },
  );
  const event = {
    preventDefault: () => {
      prevented = true;
    },
  };
  lifecycle.close(event);
  expect(prevented).toBe(false);
  background = true;
  lifecycle.close(event);
  expect(hidden).toBe(true);
  expect(prevented).toBe(true);
  lifecycle.open();
  expect(hidden).toBe(false);
  lifecycle.quit();
  prevented = false;
  lifecycle.close(event);
  expect(prevented).toBe(false);
  expect(quit).toBe(true);
});
