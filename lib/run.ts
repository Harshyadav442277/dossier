import { randomBytes } from "node:crypto";
import { parseQuery, validateParsed } from "./parse";
import { buildPlan, runStep, summarize, type Context } from "./pipeline";
import { fetchSource } from "./source";
import type { Store } from "./store";
import type { Dossier, Mode, ParsedQuery, SourceRecord, StepResult } from "./types";

/**
 * One whole dossier, run server-side: the same questions the browser asks one by one, in
 * sequence, with a callback per finished step so a bot can show progress. Used by the MCP
 * server and the Telegram bot. The web page keeps driving steps from the browser (A1).
 */
export interface RunOptions {
  mode: Mode;
  query: string;
  language?: string | null;
  store: Store;
  visitor: string;
  publicBase: string | null;
  onStart?: (parsed: ParsedQuery, total: number, source: SourceRecord | null, sourceError: string | null) => Promise<void> | void;
  onStep?: (index: number, total: number, result: StepResult) => Promise<void> | void;
}

export interface RunOutcome {
  ok: boolean;
  error: string | null;
  parsed: ParsedQuery | null;
  source: SourceRecord | null;
  sourceError: string | null;
  steps: StepResult[];
  dossier: Dossier | null;
  url: string | null;
}

export async function runDossier(o: RunOptions): Promise<RunOutcome> {
  const parsed = parseQuery(o.mode, o.query, o.language ?? null);
  const problem = validateParsed(parsed);
  const empty = { source: null, sourceError: null, steps: [], dossier: null, url: null };
  if (problem) return { ok: false, error: problem, parsed, ...empty };
  const context: Context = {};
  let source: SourceRecord | null = null;
  let sourceError: string | null = null;
  if (parsed.mode === "research" && parsed.url) {
    const s = await fetchSource(parsed.url);
    if ("error" in s) sourceError = s.error;
    else {
      source = { url: s.url, title: s.title, authors: s.authors, abstract: s.abstract, date: s.date, year: s.year, site: s.site };
      context.source = source;
    }
  }
  const plan = buildPlan(parsed);
  await o.onStart?.(parsed, plan.length, source, sourceError);
  const steps: StepResult[] = [];
  for (let i = 0; i < plan.length; i += 1) {
    const spec = plan[i]!;
    const r = await runStep(spec, parsed, context, { store: o.store, visitor: o.visitor, mode: parsed.mode });
    steps.push(r);
    if (r.status === "ok") context[spec.id] = r.data;
    await o.onStep?.(i, plan.length, r);
  }
  const id = randomBytes(6).toString("base64url");
  const dossier: Dossier = { id, mode: parsed.mode, query: parsed.query, parsed, createdAt: new Date().toISOString(), source, steps, summary: summarize(parsed, steps, source) };
  await o.store.saveDossier(dossier);
  return { ok: true, error: null, parsed, source, sourceError, steps, dossier, url: o.publicBase ? `${o.publicBase}/d/${id}` : null };
}
