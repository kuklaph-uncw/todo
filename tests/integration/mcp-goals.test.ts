import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoalService } from "../../src/mcp/goals";
import { handleRequest } from "../../src/server";
import { createTestContext, get } from "../helpers/test-vault";

let ctx: ReturnType<typeof createTestContext>;
let service: GoalService;
beforeEach(() => {
  ctx = createTestContext();
  service = new GoalService(ctx.vault, ctx.clock);
});
afterEach(() => ctx.cleanup());

const revision = (value: object) => (value as { revision: string }).revision;

describe("MCP goal operations", () => {
  it("reads one goal in full with its revision, and says when it doesn't exist", () => {
    ctx.vault.createGoal({
      title: "Delivery",
      cycle: "26-27",
      status: "agreed",
      description: "Ship it.",
      meeting: "Meets.",
      exceeding: "Exceeds.",
      notes: "Mine.",
    });
    const goal = service.get({ slug: "delivery" });
    expect(goal).toEqual({
      slug: "delivery",
      title: "Delivery",
      cycle: "26-27",
      status: "agreed",
      kind: "goal",
      order: 1,
      droppedOn: null,
      description: "Ship it.",
      meeting: "Meets.",
      exceeding: "Exceeds.",
      notes: "Mine.",
      revision: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(() => service.get({ slug: "missing" })).toThrow("Goal not found. Refresh the goal list.");
    expect(() => service.get({ slug: "../todos" })).toThrow();
  });

  it("matches slugs exactly, so a differently cased slug can't read or rename a goal's file", () => {
    service.execute("add_goal", { title: "Delivery", requestId: "add" });
    const goal = service.get({ slug: "delivery" });
    expect(() => service.get({ slug: "Delivery" })).toThrow("Goal not found");
    expect(() =>
      service.execute("update_goal", {
        slug: "Delivery",
        expectedRevision: goal.revision,
        notes: "x",
        requestId: "case",
      }),
    ).toThrow("Goal not found");
    expect(service.list({}).goals.map((item) => item.slug)).toEqual(["delivery"]);
  });

  it("ignores extra arguments on reads, as the other read tools do", () => {
    service.execute("add_goal", { title: "Ship", requestId: "add" });
    expect(service.list({ status: "agreed" } as object).goals).toHaveLength(1);
  });

  it("keeps a hand-written goal's other frontmatter through add_goal and update_goal", () => {
    mkdirSync(join(ctx.root, "goals"), { recursive: true });
    writeFileSync(
      join(ctx.root, "goals", "hand.md"),
      "---\ntitle: Hand\ncycle: 2026\ntags: [work]\naliases: hand-goal\n---\n",
    );
    writeFileSync(join(ctx.root, "goals", "hand2.md"), "---\ntitle: Hand 2\ncycle: 2025\ncreated: 2020-01-01\n---\n");
    // Renumbers hand.md, a file the agent never targeted.
    service.execute("add_goal", { title: "New", cycle: "26-27", requestId: "add" });
    expect(readFileSync(join(ctx.root, "goals", "hand.md"), "utf8")).toContain("tags: [work]\naliases: hand-goal\n");
    const hand2 = service.get({ slug: "hand2" });
    expect(hand2).not.toHaveProperty("otherFrontmatter");
    service.execute("update_goal", { slug: "hand2", expectedRevision: hand2.revision, requestId: "empty" });
    expect(readFileSync(join(ctx.root, "goals", "hand2.md"), "utf8")).toContain("created: 2020-01-01\n");
  });

  it("reads a hand-written goal without an order, and without changing its file", () => {
    mkdirSync(join(ctx.root, "goals"), { recursive: true });
    const source = "---\ntitle: Old\ncycle: 2025\nstatus: active\n---\n\nSuccess criteria.\n";
    writeFileSync(join(ctx.root, "goals", "old.md"), source);
    expect(service.get({ slug: "old" })).toMatchObject({ status: "agreed", order: null, notes: "Success criteria." });
    expect(service.list({}).goals).toHaveLength(1);
    expect(readFileSync(join(ctx.root, "goals", "old.md"), "utf8")).toBe(source);
  });

  it("adds goals and activities as drafts in this year by default, numbered like the app", () => {
    const first = service.execute("add_goal", { title: "Ship", description: "Why.", requestId: "g1" });
    expect(first).toMatchObject({
      slug: "ship",
      title: "Ship",
      cycle: "26-27",
      status: "draft",
      kind: "goal",
      order: 1,
      description: "Why.",
      revision: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(service.execute("add_goal", { title: "Second", status: "agreed", requestId: "g2" })).toMatchObject({
      status: "agreed",
      order: 2,
    });
    expect(
      service.execute("add_goal", { title: "Learn", kind: "activity", description: "Courses.", requestId: "a1" }),
    ).toMatchObject({ kind: "activity", order: 1, description: "Courses." });
    expect(service.execute("add_goal", { title: "Ship", cycle: "27-28", requestId: "g3" })).toMatchObject({
      slug: "ship-27-28",
      cycle: "27-28",
    });
    expect(ctx.vault.getGoal("ship")).toMatchObject({ description: "Why.", status: "draft" });
  });

  it("adds one readable goal for a long name ending in a rare letter, even when retried", () => {
    const args = { title: `${"a".repeat(47)}\u{20000}`, requestId: "astral" };
    const first = service.execute("add_goal", args) as { slug: string };
    expect(service.execute("add_goal", args)).toEqual(first);
    expect(service.get({ slug: first.slug }).title).toBe(args.title);
    expect(ctx.vault.getGoals()).toHaveLength(1);
  });

  it("refuses control characters in titles and cycles, but allows a tab", () => {
    const message = "Titles and cycles can't contain control characters or line breaks.";
    expect(() => service.execute("add_goal", { title: "Ship\u0001", requestId: "c1" })).toThrow(message);
    expect(() => service.execute("add_goal", { title: "Ship\nit", requestId: "c2" })).toThrow(message);
    expect(() => service.execute("add_goal", { title: "Ship", cycle: "20\u007f26", requestId: "c3" })).toThrow(message);
    const goal = service.execute("add_goal", { title: "Ship\tit", requestId: "c4" }) as {
      slug: string;
      revision: string;
    };
    expect(service.get({ slug: goal.slug }).title).toBe("Ship it");
    expect(() =>
      service.execute("update_goal", {
        slug: goal.slug,
        expectedRevision: goal.revision,
        title: "Ship\u0000",
        requestId: "c5",
      }),
    ).toThrow(message);
    expect(ctx.vault.getGoals()).toHaveLength(1);
  });

  it("refuses line breaks at either end, C1 controls and line separators, and finds a tab-sent cycle", () => {
    const message = "Titles and cycles can't contain control characters or line breaks.";
    for (const [n, title] of ["Ship\n", "\rShip", "Ship\u000b", "Ship\u0085", "Ship\u2028it"].entries())
      expect(() => service.execute("add_goal", { title, requestId: `edge-${n}` })).toThrow(message);
    expect(ctx.vault.getGoals()).toHaveLength(0);
    service.execute("add_goal", { title: "Tabbed", cycle: "FY\t2027", requestId: "tab" });
    expect(service.list({ cycle: "FY\t2027" }).goals.map((goal) => goal.title)).toEqual(["Tabbed"]);
    expect(service.list({ cycle: "FY 2027" }).goals.map((goal) => goal.title)).toEqual(["Tabbed"]);
  });

  it("says a retried add already succeeded when its goal's link was renamed since", () => {
    const first = service.execute("add_goal", { title: "Ship", requestId: "renamed" }) as { slug: string };
    ctx.vault.renameGoal(first.slug, "shipped");
    expect(() => service.execute("add_goal", { title: "Ship", requestId: "renamed" })).toThrow(
      "That request already succeeded, but the goal's link has changed since. List goals to find it; don't add it again.",
    );
    expect(ctx.vault.getGoals()).toHaveLength(1);
  });

  it("replays a retry without writing again, returning the goal as it is now", () => {
    const args = { title: "Ship", notes: "From the agent.", requestId: "once" };
    service.execute("add_goal", args);
    const goal = ctx.vault.getGoal("ship")!;
    ctx.vault.saveGoal("ship", { ...goal, notes: "Edited in the app." });
    const replayed = service.execute("add_goal", args);
    expect(replayed).toEqual(service.get({ slug: "ship" }));
    expect(replayed).toMatchObject({ notes: "Edited in the app." });
    expect(ctx.vault.getGoals()).toHaveLength(1);

    const patch = {
      slug: "ship",
      expectedRevision: service.get({ slug: "ship" }).revision,
      notes: "Agent again.",
      requestId: "patch",
    };
    service.execute("update_goal", patch);
    ctx.vault.saveGoal("ship", { ...ctx.vault.getGoal("ship")!, notes: "App again." });
    // The retry neither writes the agent's notes back nor fails on the now-stale revision.
    expect(service.execute("update_goal", patch)).toMatchObject({ notes: "App again." });
    expect(ctx.vault.getGoal("ship")?.notes).toBe("App again.");
    expect(() => service.execute("update_goal", { ...patch, notes: "Different" })).toThrow("requestId");
  });

  it("deduplicates an exact retry and rejects a reused requestId", () => {
    const args = { title: "Ship", requestId: "same" };
    const first = service.execute("add_goal", args);
    expect(service.execute("add_goal", args)).toEqual(first);
    expect(() => service.execute("add_goal", { title: "Other", requestId: "same" })).toThrow("requestId");
    expect(ctx.vault.getGoals()).toHaveLength(1);
  });

  it("rejects dropped on create, expectation fields on activities, and bad input", () => {
    const bad = (input: object) => () => service.execute("add_goal", { requestId: "bad", ...input });
    expect(bad({ title: "Ship", status: "dropped" })).toThrow();
    expect(bad({ title: "Learn", kind: "activity", meeting: "Meets." })).toThrow("Activities have only a description");
    expect(bad({ title: "Learn", kind: "activity", exceeding: "Exceeds." })).toThrow(
      "Activities have only a description",
    );
    expect(bad({ title: "   " })).toThrow();
    expect(bad({ title: "x".repeat(1001) })).toThrow();
    expect(bad({ title: "Ship", cycle: "20\n26" })).toThrow();
    expect(bad({ title: "Ship", description: "x".repeat(128001) })).toThrow();
    expect(bad({ title: "Ship", slug: "chosen" })).toThrow();
    expect(ctx.vault.getGoals()).toEqual([]);
  });

  it("patches only the given fields, follows the app's drop rules, and refuses stale revisions", () => {
    const added = service.execute("add_goal", {
      title: "Ship",
      description: "Why.",
      meeting: "Meets.",
      notes: "Mine.",
      requestId: "add",
    });
    const changed = service.execute("update_goal", {
      slug: "ship",
      expectedRevision: revision(added),
      description: "New why.",
      requestId: "edit",
    });
    expect(changed).toMatchObject({ title: "Ship", description: "New why.", meeting: "Meets.", notes: "Mine." });
    expect(() =>
      service.execute("update_goal", {
        slug: "ship",
        expectedRevision: revision(added),
        title: "Stale",
        requestId: "stale",
      }),
    ).toThrow("This goal changed. Read it again before editing.");

    const dropped = service.execute("update_goal", {
      slug: "ship",
      expectedRevision: revision(changed),
      status: "dropped",
      requestId: "drop",
    });
    expect(dropped).toMatchObject({ status: "dropped", droppedOn: "2026-09-28" });
    const kept = service.execute("update_goal", {
      slug: "ship",
      expectedRevision: revision(dropped),
      notes: "Still dropped.",
      requestId: "drop-again",
    });
    expect(kept).toMatchObject({ status: "dropped", droppedOn: "2026-09-28" });
    const restored = service.execute("update_goal", {
      slug: "ship",
      expectedRevision: revision(kept),
      status: "agreed",
      requestId: "restore",
    });
    expect(restored).toMatchObject({ status: "agreed", droppedOn: null, slug: "ship", cycle: "26-27", order: 1 });
  });

  it("refuses a blank title, link, cycle, kind or order changes, and expectation fields on activities", () => {
    const goal = service.execute("add_goal", { title: "Ship", requestId: "add" });
    const plan = service.execute("add_goal", { title: "Learn", kind: "activity", requestId: "add-plan" });
    const patch = (target: object, input: object) => () =>
      service.execute("update_goal", { expectedRevision: revision(target), requestId: "patch", ...input });
    expect(patch(goal, { slug: "ship", title: "  " })).toThrow();
    for (const field of [{ cycle: "27-28" }, { kind: "activity" }, { order: 5 }, { newSlug: "other" }])
      expect(patch(goal, { slug: "ship", ...field })).toThrow();
    expect(patch(plan, { slug: "learn", meeting: "Meets." })).toThrow("Activities have only a description");
    expect(patch(plan, { slug: "learn", exceeding: "" })).toThrow("Activities have only a description");
    expect(service.get({ slug: "ship" })).toMatchObject({ title: "Ship", cycle: "26-27", kind: "goal" });
    expect(() =>
      service.execute("update_goal", {
        slug: "missing",
        expectedRevision: revision(goal),
        title: "X",
        requestId: "missing",
      }),
    ).toThrow("Goal not found");
  });

  it("lists goals with revisions and the same fields as before, optionally for one cycle", () => {
    service.execute("add_goal", { title: "Ship", requestId: "one" });
    service.execute("add_goal", { title: "Plan", cycle: "27-28", requestId: "two" });
    const all = service.list({}).goals;
    expect(all.map(({ slug, title, cycle, status, kind }) => ({ slug, title, cycle, status, kind }))).toEqual([
      { slug: "plan", title: "Plan", cycle: "27-28", status: "draft", kind: "goal" },
      { slug: "ship", title: "Ship", cycle: "26-27", status: "draft", kind: "goal" },
    ]);
    expect(all[1].revision).toBe(service.get({ slug: "ship" }).revision);
    expect(service.list({ cycle: "26-27" }).goals.map((goal) => goal.slug)).toEqual(["ship"]);
    // An agent that still asks by year gets the cycle that started that April.
    expect(service.list({ cycle: "2026" }).goals.map((goal) => goal.slug)).toEqual(["ship"]);
  });

  it("shows MCP writes in the app at once, and app edits make an agent's revision stale", async () => {
    const added = service.execute("add_goal", { title: "Ship", description: "From an agent.", requestId: "add" });
    const page = await (await handleRequest(get("/goals?view=reader&cycle=26-27"), ctx)).text();
    expect(page).toContain('id="goal-ship" data-goal');
    expect(page).toContain("From an agent.");

    const goal = ctx.vault.getGoal("ship")!;
    ctx.vault.saveGoal("ship", { ...goal, notes: "Edited in the app." });
    expect(() =>
      service.execute("update_goal", {
        slug: "ship",
        expectedRevision: revision(added),
        notes: "Agent edit",
        requestId: "late",
      }),
    ).toThrow("This goal changed");
    expect(service.get({ slug: "ship" }).notes).toBe("Edited in the app.");
  });

  it("changes the revision open pages watch, so an agent's goal write shows the change notice", async () => {
    const version = async () => (await (await handleRequest(get("/todo-version"), ctx)).json()).revision;
    const before = await version();
    const added = service.execute("add_goal", { title: "Ship", requestId: "add" });
    const afterAdd = await version();
    expect(afterAdd).not.toBe(before);
    service.execute("update_goal", {
      slug: "ship",
      expectedRevision: revision(added),
      notes: "Agent note",
      requestId: "edit",
    });
    expect(await version()).not.toBe(afterAdd);
  });
});
