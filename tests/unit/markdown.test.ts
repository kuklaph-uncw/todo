import { describe, expect, it } from "bun:test";
import { renderEntryMarkdown } from "../../src/lib/markdown";
import { entryHtml, goalIndex } from "../../src/views/components";

describe("entry Markdown", () => {
  it("keeps adjacent emphasis and code inside emphasis separate", () => {
    expect(renderEntryMarkdown("**First****Second**")).toBe("<p><strong>First</strong><strong>Second</strong></p>");
    expect(renderEntryMarkdown("*a `*` b*")).toBe("<p><em>a <code>*</code> b</em></p>");
    expect(renderEntryMarkdown("**a *b*** *a **b***")).toBe(
      "<p><strong>a <em>b</em></strong> <em>a <strong>b</strong></em></p>",
    );
  });
  it("renders combined formatting and literal markers from the visual editor", () => {
    expect(renderEntryMarkdown("**bold *and italic* end** ***both***")).toBe(
      "<p><strong>bold <em>and italic</em> end</strong> <em><strong>both</strong></em></p>",
    );
    expect(
      renderEntryMarkdown(
        "\\# Literal heading\n\\- Literal bullet\n1\\. Literal number\n\\*literal\\* and C:\\\\notes",
      ),
    ).toBe("<p># Literal heading<br>- Literal bullet<br>1. Literal number<br>*literal* and C:\\notes</p>");
  });
  it("groups paragraphs and keeps single line breaks", () => {
    expect(renderEntryMarkdown("First\nsecond\n\nLast")).toBe("<p>First<br>second</p><p>Last</p>");
  });

  it("nests lists by indentation and separates ordered from unordered lists", () => {
    expect(
      renderEntryMarkdown("- Parent\n  3. Child\n    + Grandchild\n  4. Next\n* Sibling\n+ Last\n1. Ordered"),
    ).toBe(
      '<ul><li>Parent<ol start="3"><li>Child<ul><li>Grandchild</li></ul></li><li>Next</li></ol></li><li>Sibling</li><li>Last</li></ul><ol><li>Ordered</li></ol>',
    );
  });

  it("offsets headings by two and caps their level at six", () => {
    expect(renderEntryMarkdown("# One\n## Two\n### Three\n#### Four\n###### Six")).toBe(
      "<h3>One</h3><h4>Two</h4><h5>Three</h5><h6>Four</h6><h6>Six</h6>",
    );
  });

  it("escapes text before adding emphasis", () => {
    expect(renderEntryMarkdown("<script>alert(1)</script>\n\n**<b>x</b>** *yes* _also_")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p><p><strong>&lt;b&gt;x&lt;/b&gt;</strong> <em>yes</em> <em>also</em></p>",
    );
  });

  it("keeps underscores inside words literal while allowing intraword asterisk emphasis", () => {
    expect(renderEntryMarkdown("retry_backoff_math file_name.txt a1_mid_2end pré_nom_é x*mid*y (_yes_) _also_")).toBe(
      "<p>retry_backoff_math file_name.txt a1_mid_2end pré_nom_é x<em>mid</em>y (<em>yes</em>) <em>also</em></p>",
    );
  });

  it("decorates an underscored tag and goal label as whole tokens", () => {
    const goals = goalIndex([{ slug: "slug", title: "Goal", cycle: "2026", status: "active", body: "" }]);
    expect(entryHtml("#on_call_rota [[slug|some_label_here]]", goals)).toBe(
      '<p><span class="tag">#on_call_rota</span> <a class="goal-link" href="/goals/slug">some_label_here</a></p>',
    );
    expect(entryHtml("**#_ops_**", goals)).toBe('<p><strong><span class="tag">#_ops_</span></strong></p>');
    expect(entryHtml("_#ops_", goals)).toBe('<p><em><span class="tag">#ops</span></em></p>');
    expect(entryHtml("_Completed #ops_", goals)).toBe('<p><em>Completed <span class="tag">#ops</span></em></p>');
  });

  it("decorates escaped text outside code spans only", () => {
    const runs: string[] = [];
    expect(
      renderEntryMarkdown("**#ops** `<b>#ops</b>`", (run) => {
        runs.push(run);
        return run.replace(/#ops/g, "<mark>#ops</mark>");
      }),
    ).toBe("<p><strong><mark>#ops</mark></strong> <code>&lt;b&gt;#ops&lt;/b&gt;</code></p>");
    expect(runs.join("")).not.toContain("&lt;b&gt;");
  });

  it("keeps unsupported links, images and checkboxes literal", () => {
    expect(entryHtml("[link](https://example.com) ![image](x)\n- [ ] task\n*\n_\n`", new Map())).toBe(
      "<p>[link](https://example.com) ![image](x)<br>- [ ] task<br>*<br>_<br>`</p>",
    );
  });

  it("renders fenced code as an undecorated, escaped code block", () => {
    expect(entryHtml("```\n#include <x>\n**literal** [[goal]]\n\n  indented\n```", new Map())).toBe(
      '<pre data-fence="```" data-info=""><code>#include &lt;x&gt;\n**literal** [[goal]]\n\n  indented</code></pre>',
    );
    expect(entryHtml('~~~~ js "x"\n```\nnot closed\n~~~\n~~~~\n**After**', new Map())).toBe(
      '<pre data-fence="~~~~" data-info="js &quot;x&quot;"><code>```\nnot closed\n~~~</code></pre><p><strong>After</strong></p>',
    );
    expect(entryHtml("  ```\n  a\n b\n```", new Map())).toBe(
      '<pre data-fence="```" data-info=""><code>a\nb</code></pre>',
    );
    expect(entryHtml("- Item\n\n  ```\n  code\n  ```", new Map())).toBe(
      '<ul><li>Item<pre data-fence="```" data-info=""><code>code</code></pre></li></ul>',
    );
  });

  it("runs an unclosed fence to the end and keeps a backtick info string literal", () => {
    expect(entryHtml("```\nopen to the end\n#ops", new Map())).toBe(
      '<pre data-fence="```" data-info=""><code>open to the end\n#ops</code></pre>',
    );
    expect(renderEntryMarkdown("``` a`b\nnext")).toBe("<p>``` a`b<br>next</p>");
  });
});
