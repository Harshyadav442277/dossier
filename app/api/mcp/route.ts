import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createHash } from "node:crypto";
import { z } from "zod";
import { publicBase } from "@/lib/config";
import { runDossier, type RunOutcome } from "@/lib/run";
import { getStore } from "@/lib/store";
import { hashVisitor } from "@/lib/visitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Dossier as an MCP server (Streamable HTTP, stateless: one server per request). Any MCP
 * client, Claude Code, Cursor, an agent, can ask for a research, news or safety dossier and
 * gets the case summary, the share link and every receipt. Same guards, same ledger, same
 * router-only path as the website; the caller is a visitor keyed by its network address.
 */
function visitorOf(req: Request): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "mcp";
  return hashVisitor(createHash("sha256").update(`mcp:${ip}`).digest("hex").slice(0, 32));
}

function text(out: RunOutcome): string {
  if (!out.ok || !out.dossier) return `Could not run that: ${out.error ?? "unknown error"}`;
  const d = out.dossier;
  const lines: string[] = [];
  lines.push(`${d.mode === "research" ? "Research dossier" : d.mode === "news" ? "News dossier" : "Safety check"}: ${d.query}`);
  if (out.url) lines.push(`Case file: ${out.url}`);
  lines.push("", "Summary:");
  for (const l of d.summary.lines) lines.push(`- ${l}`);
  lines.push("", `${d.summary.calls} Telegraph calls · ${d.summary.okSteps} answered · $${d.summary.costUsd.toFixed(2)} USDC · intents: ${d.summary.intents.join(", ")}`);
  lines.push("", "Receipts:");
  for (const s of d.steps) {
    if (s.status === "ok" && s.receipt) {
      const r = s.receipt;
      lines.push(`- ${s.title}: ${r.label ?? "answered"} · ${r.minerSlug ?? "?"}${r.minerRank ? ` #${r.minerRank}` : ""} routed as ${r.routerIntent ?? r.intent} · confidence ${r.confidence ?? "n/a"} · $${r.costUsd ?? "?"} · signal ${r.signalHash ?? "none"} · tx ${r.settlementTx ?? "none"}`);
      lines.push(`  ${r.answer.replace(/\s+/g, " ").slice(0, 400)}`);
    } else lines.push(`- ${s.title}: ${s.status}${s.error ? ` — ${s.error}` : ""}`);
  }
  return lines.join("\n");
}

function build(req: Request): McpServer {
  const server = new McpServer({ name: "dossier", version: "0.1.0" });
  const store = getStore();
  const visitor = visitorOf(req);
  const base = publicBase();
  const run = async (mode: "research" | "news" | "safety", query: string, language?: string | null) => {
    const out = await runDossier({ mode, query, language: language ?? null, store, visitor, publicBase: base });
    return { content: [{ type: "text" as const, text: text(out) }], isError: !out.ok };
  };
  server.registerTool(
    "dossier_research",
    {
      title: "Research paper dossier",
      description:
        "Vet a research paper through the Telegraph network: key facts, plain-words summary, AI-text detection, fraud and retraction record, fact-check of the key claim, provenance, related work, and optionally a translation of the abstract. Every question is routed by Telegraph's router; the answer carries the miner, its confidence, the cost, the signal hash and the on-chain settlement. Takes 30 to 120 seconds and about $0.08 of testnet USDC paid by the app.",
      inputSchema: { url: z.string().describe("Link to the paper, e.g. https://arxiv.org/abs/1706.03762"), language: z.string().optional().describe("Target language for the abstract, e.g. Hindi") },
    },
    async ({ url, language }) => run("research", language ? `${url} in ${language}` : url, language),
  );
  server.registerTool(
    "dossier_news",
    {
      title: "News dossier",
      description: "Today's headlines, the week's coverage and a written briefing on a topic, each from a Telegraph miner the router picks, optionally translated. About $0.04 of testnet USDC paid by the app.",
      inputSchema: { topic: z.string().describe("The topic, optionally with a region, e.g. AI regulation in India"), language: z.string().optional().describe("Language for the briefing, e.g. Hindi") },
    },
    async ({ topic, language }) => run("news", language ? `${topic}, in ${language}` : topic, language),
  );
  server.registerTool(
    "dossier_safety",
    {
      title: "Is this safe?",
      description: "Check a link, a wallet address, or a message someone received: link scan, certificate, where the host really is, fraud record, red flags in the text. Verdict computed from the miners' own labels. About $0.05 of testnet USDC paid by the app.",
      inputSchema: { text: z.string().describe("The link, the wallet address, or the whole message") },
    },
    async ({ text: t }) => run("safety", t),
  );
  server.registerTool(
    "dossier_get",
    { title: "Fetch a saved dossier", description: "A dossier saved earlier, by the id in its share link.", inputSchema: { id: z.string().describe("The id from /d/{id}") } },
    async ({ id }) => {
      const d = await store.getDossier(id);
      if (!d) return { content: [{ type: "text" as const, text: `No dossier ${id}.` }], isError: true };
      return { content: [{ type: "text" as const, text: text({ ok: true, error: null, parsed: d.parsed, source: d.source, sourceError: null, steps: d.steps, dossier: d, url: base ? `${base}/d/${d.id}` : null }) }] };
    },
  );
  server.registerTool(
    "dossier_ledger",
    { title: "Ledger totals", description: "Free. How many Telegraph calls this app has made, for how many visitors, at what cost, by intent.", inputSchema: {} },
    async () => {
      const s = await store.stats();
      return { content: [{ type: "text" as const, text: JSON.stringify(s, null, 2) }] };
    },
  );
  return server;
}

async function handle(req: Request): Promise<Response> {
  const server = build(req);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // Stateless: nothing to keep between requests.
    void transport.close().catch(() => undefined);
  }
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}

export async function DELETE(req: Request) {
  return handle(req);
}
