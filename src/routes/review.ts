import { nowUtcIso } from "../lib/date";
import { buildReview, collectItems, parseReviewFilters, reviewFileName, reviewToJson, reviewToJsonl, reviewToMarkdown } from "../review";
import { renderReview } from "../views/review";
import { notFound, page, today, type AppContext } from "./shared";

function load(req: Request, ctx: AppContext) {
  const filters = parseReviewFilters(new URL(req.url).searchParams, today(ctx));
  const items = collectItems(ctx.vault, filters.from, filters.to);
  const goals = ctx.vault.getGoals();
  const review = buildReview(items, goals, filters, nowUtcIso());
  return { items, goals, review };
}

/** GET /review */
export function handleReview(req: Request, ctx: AppContext): Response {
  const { items, goals, review } = load(req, ctx);
  const main = renderReview({
    review,
    goals,
    markdown: reviewToMarkdown(review, goals),
    allTags: [...new Set(items.flatMap((item) => item.tags))].sort(),
  });
  return page(ctx, "Review", "review", main);
}

/** GET /review/export.{md,json,jsonl} */
export function handleExport(req: Request, ctx: AppContext, format: string): Response {
  const { goals, review } = load(req, ctx);
  const name = reviewFileName(review.filters);
  const download = (body: string, type: string, ext: string) =>
    new Response(body, {
      headers: { "content-type": `${type}; charset=utf-8`, "content-disposition": `attachment; filename="${name}.${ext}"` },
    });

  if (format === "md") return download(reviewToMarkdown(review, goals), "text/markdown", "md");
  if (format === "json") return download(`${JSON.stringify(reviewToJson(review, goals), null, 2)}\n`, "application/json", "json");
  if (format === "jsonl") return download(reviewToJsonl(review, goals), "application/x-ndjson", "jsonl");
  return notFound(ctx);
}
