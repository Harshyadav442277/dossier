import { waitUntil } from "@vercel/functions";
import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { config, publicBase } from "@/lib/config";
import { runDossier } from "@/lib/run";
import { getStore } from "@/lib/store";
import { finalText, HELP, parseCommand, progressText, telegramApi } from "@/lib/telegram";
import type { StepResult } from "@/lib/types";
import { hashVisitor } from "@/lib/visitor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Telegram webhook. Telegram wants a quick 200, so the dossier runs after the response inside
 * waitUntil, editing one progress message as each question comes back, then posting the
 * summary and the share link. Each chat is a visitor, so the same daily allowance applies.
 */
interface Update {
  message?: { message_id: number; text?: string; chat: { id: number } };
  edited_message?: { message_id: number; text?: string; chat: { id: number } };
}

export async function POST(req: NextRequest) {
  const c = config();
  if (!c.TELEGRAM_BOT_TOKEN) return NextResponse.json({ ok: false, error: "Telegram is not configured." }, { status: 404 });
  if (c.TELEGRAM_WEBHOOK_SECRET && req.headers.get("x-telegram-bot-api-secret-token") !== c.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const update = (await req.json().catch(() => null)) as Update | null;
  const msg = update?.message ?? update?.edited_message;
  if (!msg?.text) return NextResponse.json({ ok: true });
  const api = telegramApi(c.TELEGRAM_BOT_TOKEN);
  const chatId = msg.chat.id;
  const cmd = parseCommand(msg.text);
  if (cmd.kind !== "run") {
    waitUntil(api.send(chatId, HELP).catch(() => null));
    return NextResponse.json({ ok: true });
  }
  const visitor = hashVisitor(createHash("sha256").update(`tg:${chatId}`).digest("hex").slice(0, 32));
  const store = getStore();
  const title = cmd.mode === "research" ? "Research dossier" : cmd.mode === "news" ? "News dossier" : "Safety check";
  const job = (async () => {
    const rows: Array<{ title: string; status?: StepResult["status"]; label?: string | null }> = [];
    let progressId: number | null = null;
    let total = 0;
    try {
      const out = await runDossier({
        mode: cmd.mode,
        query: cmd.query,
        store,
        visitor,
        publicBase: publicBase(),
        onStart: async (_parsed, n, source, sourceError) => {
          total = n;
          const head = source?.title ? `${title}: ${source.title}` : sourceError ? `${title} (page not readable: ${sourceError})` : title;
          progressId = await api.send(chatId, progressText(head, rows, total));
        },
        onStep: async (_i, _n, r) => {
          rows.push({ title: r.title, status: r.status, label: r.receipt?.label ?? (r.status === "skipped" ? "skipped" : r.status === "error" ? "failed" : null) });
          if (progressId) await api.edit(chatId, progressId, progressText(title, rows, total));
        },
      });
      await api.send(chatId, finalText(out));
    } catch (e) {
      await api.send(chatId, `Something broke on my side: ${(e as Error).message.slice(0, 200)}`).catch(() => null);
    }
  })();
  waitUntil(job);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, telegram: Boolean(config().TELEGRAM_BOT_TOKEN) });
}
