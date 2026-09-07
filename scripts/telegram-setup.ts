import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { config, publicBase } from "../lib/config";

/**
 * Registers the deployment as the bot's webhook and publishes the command menu. Run once
 * after deploying, with TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and PUBLIC_URL in .env.local.
 */
async function call(token: string, method: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
  return j.result;
}

async function main() {
  const c = config();
  const base = publicBase();
  if (!c.TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  if (!base) throw new Error("PUBLIC_URL is not set");
  const url = `${base}/api/telegram`;
  await call(c.TELEGRAM_BOT_TOKEN, "setWebhook", { url, secret_token: c.TELEGRAM_WEBHOOK_SECRET ?? undefined, allowed_updates: ["message"], drop_pending_updates: true });
  await call(c.TELEGRAM_BOT_TOKEN, "setMyCommands", {
    commands: [
      { command: "research", description: "Vet a paper: /research <link> [in Hindi]" },
      { command: "news", description: "Headlines, coverage, briefing: /news <topic>" },
      { command: "safe", description: "Is this safe? /safe <link, wallet or message>" },
      { command: "help", description: "What Dossier does" },
    ],
  });
  await call(c.TELEGRAM_BOT_TOKEN, "setMyDescription", { description: "Ask once, get the case file. Research papers, news topics and suspicious messages checked through the Telegraph miner network, with a receipt for every answer." });
  const info = (await call(c.TELEGRAM_BOT_TOKEN, "getWebhookInfo", {})) as { url?: string; pending_update_count?: number; last_error_message?: string };
  console.log(`webhook ${info.url} · pending ${info.pending_update_count ?? 0}${info.last_error_message ? ` · last error: ${info.last_error_message}` : ""}`);
  const me = (await call(c.TELEGRAM_BOT_TOKEN, "getMe", {})) as { username?: string };
  console.log(`bot @${me.username}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
