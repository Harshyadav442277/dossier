import type { Mode, StepResult } from "./types";
import type { RunOutcome } from "./run";

/**
 * Telegram surface: commands and plain text become the same three modes the website has.
 * Nothing here talks to Telegraph; it only shapes text in and out.
 */
export type Command = { kind: "run"; mode: Mode; query: string } | { kind: "help" } | { kind: "empty" };

const PAPER_HOST = /(arxiv\.org|doi\.org|biorxiv|medrxiv|ssrn\.com|nature\.com|science\.org|springer|wiley|ieee|acm\.org|sciencedirect|pubmed|semanticscholar|openreview|aclweb|neurips|\.pdf)/i;
const URL_RE = /https?:\/\/[^\s<>"'`)\]]+/i;
const ADDRESS_RE = /\b0x[0-9a-fA-F]{40}\b/;

export function parseCommand(raw: string): Command {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return { kind: "empty" };
  const m = text.match(/^\/(\w+)(?:@\w+)?\s*(.*)$/s);
  if (m) {
    const cmd = m[1]!.toLowerCase();
    const rest = (m[2] ?? "").trim();
    if (cmd === "start" || cmd === "help") return { kind: "help" };
    if (cmd === "research" || cmd === "paper") return rest ? { kind: "run", mode: "research", query: rest } : { kind: "help" };
    if (cmd === "news") return rest ? { kind: "run", mode: "news", query: rest } : { kind: "help" };
    if (cmd === "safe" || cmd === "check" || cmd === "scam") return rest ? { kind: "run", mode: "safety", query: rest } : { kind: "help" };
    return { kind: "help" };
  }
  // Plain text: a paper link is research; any other link, a wallet, or a forwarded-looking message is a safety check; else news.
  const url = text.match(URL_RE)?.[0];
  if (url && PAPER_HOST.test(url)) return { kind: "run", mode: "research", query: text };
  if (url || ADDRESS_RE.test(text) || text.split(" ").length >= 12) return { kind: "run", mode: "safety", query: text };
  return { kind: "run", mode: "news", query: text };
}

export const HELP = [
  "<b>Dossier</b> — ask once, get the case file. Every answer comes from a Telegraph miner chosen by the network's router, with a receipt.",
  "",
  "/research <i>link</i> [in Hindi] — a paper: key facts, summary, AI-text check, fraud record, fact-check, provenance, related work, translation",
  "/news <i>topic</i> [in a region] [in a language] — headlines, the week's coverage, a written briefing",
  "/safe <i>link, wallet or the message you got</i> — link scan, certificate, host location, fraud record, red flags",
  "",
  "Or just paste: a paper link runs research, any other link or a forwarded message runs the safety check, anything else is a news topic.",
].join("\n");

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const MARK: Record<StepResult["status"], string> = { ok: "✅", error: "❌", skipped: "⏭" };

export function progressText(title: string, steps: Array<{ title: string; status?: StepResult["status"]; label?: string | null }>, total: number): string {
  const lines = [`<b>${esc(title)}</b>`, ""];
  steps.forEach((s, i) => lines.push(`${s.status ? MARK[s.status] : "⏳"} ${i + 1}/${total} ${esc(s.title)}${s.label ? ` — <i>${esc(s.label)}</i>` : ""}`));
  for (let i = steps.length; i < total; i += 1) lines.push(`· ${i + 1}/${total} …`);
  return lines.join("\n");
}

export function finalText(out: RunOutcome): string {
  if (!out.ok || !out.dossier) return `Could not run that: ${esc(out.error ?? "unknown error")}`;
  const d = out.dossier;
  const head = d.mode === "research" ? "Research dossier" : d.mode === "news" ? "News dossier" : "Safety check";
  const lines = [`<b>${head}</b>`, ""];
  for (const l of d.summary.lines.slice(0, 10)) lines.push(`• ${esc(l)}`);
  lines.push("", `${d.summary.calls} Telegraph calls · ${d.summary.okSteps} answered · $${d.summary.costUsd.toFixed(2)} USDC · ${d.summary.intents.length} intents`);
  if (out.url) lines.push(`<a href="${out.url}">Full case file with receipts</a>`);
  return lines.join("\n").slice(0, 3900);
}

export interface TelegramApi {
  send(chatId: number | string, html: string): Promise<number | null>;
  edit(chatId: number | string, messageId: number, html: string): Promise<void>;
}

export function telegramApi(token: string): TelegramApi {
  const call = async (method: string, body: Record<string, unknown>): Promise<unknown> => {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; result?: unknown; description?: string } | null;
    if (!j?.ok) throw new Error(j?.description ?? `telegram ${method} ${res.status}`);
    return j.result;
  };
  return {
    async send(chatId, html) {
      const r = (await call("sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true })) as { message_id?: number };
      return r?.message_id ?? null;
    },
    async edit(chatId, messageId, html) {
      await call("editMessageText", { chat_id: chatId, message_id: messageId, text: html, parse_mode: "HTML", disable_web_page_preview: true }).catch(() => undefined);
    },
  };
}
