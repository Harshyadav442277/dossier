import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { readFileSync } from "node:fs";
import { carriedArticles } from "../lib/adapters";
import { parseQuery } from "../lib/parse";
import { deriveInput, NEWS_STEPS, type Context } from "../lib/pipeline";
import { askRouted, NodeError } from "../lib/telegraph";

/**
 * PAID, one call per run, off the ledger. Builds the briefing question as the pipeline would
 * from a saved dossier's headlines and search data, puts it to the router, and prints the
 * intent and miner it chose. For checking that a writing task is filed as writing.
 *
 *   npx tsx scripts/probe-brief.ts <dossier.json> [wording 1-4]
 *   npx tsx scripts/probe-brief.ts <dossier.json> titles|sourced   (experimental note styles)
 */
async function main() {
  const [file, which = "1"] = process.argv.slice(2);
  if (!file) {
    console.error("usage: npx tsx scripts/probe-brief.ts <dossier.json> [wording 1-4 | titles | sourced]");
    process.exit(2);
  }
  const dossier = (JSON.parse(readFileSync(file, "utf8")) as { dossier: { query: string; steps: Array<{ id: string; status: string; data: unknown }> } }).dossier;
  const parsed = parseQuery("news", dossier.query);
  const context: Context = {};
  for (const s of dossier.steps) if (s.status === "ok" && (s.id === "headlines" || s.id === "search")) context[s.id] = s.data;
  let query: string;
  if (which === "titles" || which === "sourced") {
    const items = [...carriedArticles(context.headlines), ...carriedArticles(context.search)].slice(0, 10);
    const lines = items.map((a) => (which === "sourced" && a.source ? `- ${a.title} (${a.source})` : `- ${a.title}`));
    query = `Rewrite these lines as one paragraph of about 120 words of plain prose, adding nothing that is not in them.\n\n${lines.join("\n")}\n\nNow write the paragraph.`;
  } else {
    const brief = NEWS_STEPS.find((s) => s.id === "brief")!;
    const d = await deriveInput(brief, parsed, context);
    if ("skip" in d) {
      console.log(`skip: ${d.skip}`);
      return;
    }
    query = d.queries[Math.max(1, Number(which) || 1) - 1] ?? d.queries[0] ?? "";
  }
  console.log(`--- ${which} (${query.length} chars) ---\n${query}\n--- asking ---`);
  const t0 = Date.now();
  try {
    const r = await askRouted(query);
    console.log(`intent      ${r.intent ?? "(none)"}`);
    console.log(`miner       ${r.miner_name ?? "?"} (id ${r.miner_id ?? "?"}) endpoint ${r.endpoint ?? "?"}`);
    console.log(`reasoning   ${r.reasoning ?? "(none)"}`);
    console.log(`cost/time   $${r.cost_usd ?? "?"} · ${r.duration_ms} ms (${Date.now() - t0} ms round trip)`);
    console.log(`signal      ${r.signal_hash ?? "(none)"}`);
    console.log(`settlement  ${r.settlement ? `${r.settlement.success ? "settled" : "not settled"} ${r.settlement.txHash ?? ""} ${r.settlement.errorReason ?? ""}` : "(no header)"}`);
    if (r.warnings?.length) console.log(`warnings    ${r.warnings.join(" | ")}`);
    console.log("result");
    console.log(JSON.stringify(r.result, null, 2).slice(0, 2500));
  } catch (e) {
    const err = e instanceof NodeError ? e : null;
    console.log(`FAILED ${err ? `${err.kind} ${err.status ?? ""}` : ""}: ${(e as Error).message}`);
    process.exit(1);
  }
}

main();
