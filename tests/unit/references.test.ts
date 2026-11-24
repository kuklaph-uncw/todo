import { describe, expect, it } from "bun:test";
import { formatEntry, parseEntryBlocks } from "../../src/vault/format";
import { formatReference, isReferenceUrl, parseReference, parseReferenceLines } from "../../src/vault/references";

describe("references", () => {
  it("reads a labelled link, an angle-bracket address, or a bare address", () => {
    expect(parseReference("[ToDo thread](t3-thread://v2/a/b)")).toEqual({
      label: "ToDo thread",
      url: "t3-thread://v2/a/b",
    });
    expect(parseReference("[Spec \\[draft\\]](<https://x.test/a b>)")).toEqual({
      label: "Spec [draft]",
      url: "https://x.test/a b",
    });
    expect(parseReference("https://example.com/page")).toEqual({ label: "", url: "https://example.com/page" });
    expect(parseReference("just words")).toBeNull();
    expect(parseReference("[label](no-scheme)")).toBeNull();
  });

  it("writes them back so they read the same", () => {
    for (const ref of [
      { label: "ToDo thread", url: "t3-thread://v2/a/b" },
      { label: "Spec [draft]", url: "https://x.test/a b" },
      { label: "", url: "https://example.com/page" },
      { label: "Wiki", url: "https://en.wikipedia.org/wiki/Foo_(bar)" },
    ]) {
      expect(parseReference(formatReference(ref))).toEqual(ref);
    }
  });

  it("accepts any scheme, but no spaces at the ends, line breaks or control characters", () => {
    expect(isReferenceUrl("t3-thread://v2/a")).toBe(true);
    expect(isReferenceUrl("mailto:someone@example.com")).toBe(true);
    expect(isReferenceUrl("example.com")).toBe(false);
    expect(isReferenceUrl("https://a.test/\nb")).toBe(false);
    expect(isReferenceUrl("")).toBe(false);
  });

  it("reads the references typed in a form, one per line, with an optional label before the address", () => {
    expect(
      parseReferenceLines("ToDo thread t3-thread://v2/a/b\n\nhttps://example.com\n[Docs](https://docs.test)"),
    ).toEqual({
      references: [
        { label: "ToDo thread", url: "t3-thread://v2/a/b" },
        { label: "", url: "https://example.com" },
        { label: "Docs", url: "https://docs.test" },
      ],
      invalid: [],
    });
    expect(parseReferenceLines("no address here").invalid).toEqual(["no address here"]);
  });
});

describe("entries with references", () => {
  it("keeps 🔗 lines at the end of an entry apart from its text", () => {
    const lines = [
      "- 09:15 Released v1.4.0 #release ^b4juh4",
      "    Agents can log entries.",
      "    🔗 [ToDo thread](t3-thread://v2/a/b)",
      "    🔗 https://example.com/notes",
    ];
    const [{ entry, end }] = parseEntryBlocks(lines, "2026-11-06");
    expect(entry.text).toBe("Released v1.4.0\nAgents can log entries.");
    expect(entry.tags).toEqual(["release"]);
    expect(entry.references).toEqual([
      { label: "ToDo thread", url: "t3-thread://v2/a/b" },
      { label: "", url: "https://example.com/notes" },
    ]);
    expect(end).toBe(4);
    expect(formatEntry(entry)).toEqual(lines);
  });

  it("follows a one-line entry directly", () => {
    const lines = ["- Shipped it ^aaaaaa", "    🔗 [Thread](t3-thread://v2/x)"];
    const [{ entry }] = parseEntryBlocks(lines, "2026-11-06");
    expect(entry.text).toBe("Shipped it");
    expect(entry.references).toEqual([{ label: "Thread", url: "t3-thread://v2/x" }]);
    expect(formatEntry(entry)).toEqual(lines);
  });

  it("leaves a 🔗 line in the middle of the text, or one that isn't a link, as text", () => {
    const lines = [
      "- Notes ^bbbbbb",
      "    🔗 [Thread](t3-thread://v2/x)",
      "    More text after it.",
      "    🔗 not a link",
    ];
    const [{ entry }] = parseEntryBlocks(lines, "2026-11-06");
    expect(entry.references).toEqual([]);
    expect(entry.text).toBe("Notes\n🔗 [Thread](t3-thread://v2/x)\nMore text after it.\n🔗 not a link");
  });

  it("doesn't count tags or goal links inside a reference's label", () => {
    const lines = ["- Done ^cccccc", "    🔗 [#ops \\[\\[delivery\\]\\] notes](https://x.test)"];
    const [{ entry }] = parseEntryBlocks(lines, "2026-11-06");
    expect(entry.references).toEqual([{ label: "#ops [[delivery]] notes", url: "https://x.test" }]);
    expect(entry.tags).toEqual([]);
    expect(entry.goals).toEqual([]);
  });
});

describe("reference lines that aren't one link", () => {
  it("refuses two links, a title, or two addresses on one line", () => {
    for (const line of [
      "[A](https://a.test) and [B](https://b.test)",
      '[A](https://a.test "Title")',
      "<https://a.test> <https://b.test>",
    ]) {
      expect(parseReference(line)).toBeNull();
    }
    expect(parseReferenceLines("[A](https://a.test) [B](https://b.test)").invalid).toHaveLength(1);
  });

  it("asks the form for a real address: a scheme with //, or mail and phone links", () => {
    expect(parseReferenceLines("TODO:later\nNote:see-thread").invalid).toEqual(["TODO:later", "Note:see-thread"]);
    expect(parseReferenceLines("Mail mailto:someone@example.com").references).toEqual([
      { label: "Mail", url: "mailto:someone@example.com" },
    ]);
  });
});
