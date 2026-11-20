import * as z from "zod/v4";
import { localDateString } from "../lib/date";
import { cleanCycle, GOAL_KINDS, GOAL_STATUSES } from "../lib/validation";
import type { Goal } from "../vault/format";
import { contentRevision } from "../vault/revision";
import type { Vault } from "../vault/vault";

const requestId = z.string().min(1).max(128);
const goalSlug = z
  .string()
  .max(128)
  .regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u);
// Titles and cycles are one line of plain text. A tab is allowed (the vault turns it into a space).
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
const ONE_LINE = /^[^\u0000-\u0008\u000a-\u001f\u007f-\u009f\u2028\u2029]*$/;
const ONE_LINE_MESSAGE = "Titles and cycles can't contain control characters or line breaks.";
// Checked before trimming, so a line break at either end is refused too.
// A blank title is refused rather than kept (the app's form keeps it), so an agent hears about the mistake.
const title = z.string().max(1000).regex(ONE_LINE, ONE_LINE_MESSAGE).trim().min(1);
const cycle = z.string().max(100).regex(ONE_LINE, ONE_LINE_MESSAGE).trim().min(1);
const fieldText = z.string().max(128000);
const fields = {
  description: fieldText.optional(),
  meeting: fieldText.optional(),
  exceeding: fieldText.optional(),
  notes: fieldText.optional(),
};

const ACTIVITY_FIELDS = "Activities have only a description. Leave meeting and exceeding out.";
// Refused even when blank, so an agent never thinks it cleared text it didn't.
const hasExpectations = (value: { meeting?: string; exceeding?: string }) =>
  value.meeting !== undefined || value.exceeding !== undefined;

export const goalKey = z.object({ slug: goalSlug });
export const goalFilters = z.object({ cycle: cycle.optional() });
export const newGoal = z
  .object({
    title,
    cycle: cycle.optional(),
    kind: z.enum(GOAL_KINDS).optional(),
    // Goals are dropped later with update_goal, never created dropped.
    status: z.enum(["draft", "agreed"]).optional(),
    ...fields,
    requestId,
  })
  .strict()
  .refine((value) => value.kind !== "activity" || !hasExpectations(value), ACTIVITY_FIELDS);
// Slug, cycle, kind and order are not here: link renames and reordering stay in the app.
export const goalPatch = z
  .object({
    slug: goalSlug,
    expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
    requestId,
    title: title.optional(),
    status: z.enum(GOAL_STATUSES).optional(),
    ...fields,
  })
  .strict();

/** A goal as MCP returns it. `order` is null for a goal written by hand that the app hasn't numbered yet. */
function goalResult(goal: Goal) {
  // Hand-written frontmatter stays in the file, untouched; it isn't part of the goal agents see.
  const { otherFrontmatter: _kept, ...fields } = goal;
  return {
    ...fields,
    order: Number.isFinite(goal.order) ? goal.order : null,
    revision: contentRevision(goal),
  };
}

/** Goal operations use the vault's own goal methods, so they follow the app's rules exactly. */
export class GoalService {
  private readonly requests = new Map<string, { fingerprint: string; slug: string }>();
  constructor(
    private readonly vault: Vault,
    private readonly clock: () => Date,
  ) {}

  /** Keeps list_goals' original fields (slug, title, cycle, status, kind) and adds each goal's revision. */
  list(input: z.input<typeof goalFilters>) {
    const filters = goalFilters.parse(input);
    return {
      goals: this.vault
        .getGoals()
        // Cleaned as stored, so a cycle sent with a tab finds the goals saved with a space.
        .filter((goal) => filters.cycle === undefined || goal.cycle === cleanCycle(filters.cycle))
        .map((goal) => ({
          slug: goal.slug,
          title: goal.title,
          cycle: goal.cycle,
          status: goal.status,
          kind: goal.kind,
          revision: contentRevision(goal),
        })),
    };
  }

  get(input: z.input<typeof goalKey>) {
    const { slug } = goalKey.parse(input);
    // Exact file names: on Windows a differently cased slug would otherwise find the
    // file, and saving would rename it and break every [[link]] to the goal.
    const goal = this.vault.getGoals().find((item) => item.slug === slug);
    if (!goal) throw new Error("Goal not found. Refresh the goal list.");
    return goalResult(goal);
  }

  execute(name: string, raw: unknown): object {
    const command =
      name === "add_goal"
        ? ({ name, input: newGoal.parse(raw) } as const)
        : name === "update_goal"
          ? ({ name, input: goalPatch.parse(raw) } as const)
          : (() => {
              throw new Error("Unknown goal operation.");
            })();
    const { input } = command;
    const fingerprint = contentRevision({ name, input });
    const previous = this.requests.get(input.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new Error("This requestId was already used for a different operation.");
      // Only the slug is remembered (goal text can be large), so a replay doesn't
      // write again and returns the goal as it is now, with its current revision.
      // If its link was renamed in the app since, say so, so the agent doesn't add it again.
      const goal = this.vault.getGoals().find((item) => item.slug === previous.slug);
      if (!goal)
        throw new Error(
          "That request already succeeded, but the goal's link has changed since. List goals to find it; don't add it again.",
        );
      return goalResult(goal);
    }
    const today = localDateString(this.clock());
    let slug: string;
    if (command.name === "add_goal") {
      const value = command.input;
      const goal = this.vault.createGoal({
        title: value.title,
        // The same default as the Goals page: this year.
        cycle: value.cycle ?? today.slice(0, 4),
        kind: value.kind ?? "goal",
        status: value.status ?? "draft",
        description: value.description,
        meeting: value.meeting,
        exceeding: value.exceeding,
        notes: value.notes,
      });
      slug = goal.slug;
    } else {
      const value = command.input;
      const current = this.get({ slug: value.slug });
      if (current.revision !== value.expectedRevision)
        throw new Error("This goal changed. Read it again before editing.");
      if (current.kind === "activity" && hasExpectations(value)) throw new Error(ACTIVITY_FIELDS);
      this.vault.saveGoal(
        value.slug,
        {
          title: value.title ?? current.title,
          status: value.status ?? current.status,
          description: value.description ?? current.description,
          // Like the app's form, an activity keeps any expectation text written by hand.
          meeting: current.kind === "activity" ? current.meeting : (value.meeting ?? current.meeting),
          exceeding: current.kind === "activity" ? current.exceeding : (value.exceeding ?? current.exceeding),
          notes: value.notes ?? current.notes,
        },
        today,
      );
      slug = value.slug;
    }
    const result = this.get({ slug });
    // Bounded retry protection for this running process. Re-read after a restart.
    if (this.requests.size >= 1024) this.requests.delete(this.requests.keys().next().value!);
    this.requests.set(input.requestId, { fingerprint, slug });
    return result;
  }
}
