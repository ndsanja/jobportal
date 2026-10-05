import { verifyCronRequest } from "@/server/cron-auth";
import { runDueSources } from "@/server/ingest/run";

// Hobby: maks 300 dtk. Sumber baru tidak dimulai setelah ±240 dtk; sisanya diambil panggilan berikutnya.
export const maxDuration = 300;
const TIME_BUDGET_MS = 240_000;

/**
 * Dipicu pg_cron + pg_net (Supabase) dengan `Authorization: Bearer <CRON_SECRET>`.
 * Query: ?group=jobs (default) · ?slug=<sumber>&dry_run=1 uji satu sumber · ?drafts=1&dry_run=1 uji semua sumber draft.
 */
export async function POST(request: Request) {
  const denied = verifyCronRequest(request);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const slug = params.get("slug") ?? undefined;
  const dryRun = params.get("dry_run") === "1";
  const drafts = params.get("drafts") === "1";
  if (drafts && !dryRun) {
    return Response.json(
      { error: "drafts=1 hanya boleh bersama dry_run=1." },
      { status: 400 },
    );
  }
  const summary = await runDueSources({
    group: params.get("group") ?? undefined,
    slug,
    drafts,
    dryRun,
    deadlineMs: Date.now() + TIME_BUDGET_MS,
  });

  if (slug && summary.processed.length === 0) {
    return Response.json(
      { error: `Sumber "${slug}" tidak ditemukan.` },
      { status: 404 },
    );
  }

  return Response.json(summary);
}
