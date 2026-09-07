# DEMO — the judge journey

Exact steps, exact expected output. Everything before "Paid" costs nothing.

## 0. Fresh clone

```bash
git clone https://github.com/Harshyadav442277/dossier && cd dossier && npm ci
```

```bash
npm run typecheck && npm test
```

Expected: `tsc` prints nothing; vitest ends with `Test Files  6 passed (6)` and `Tests  50 passed (50)`.

## 1. Preflight, free

```bash
cp .env.example .env.local
```

Fill `PAYER_PRIVATE_KEY`, set `DAILY_CALL_BUDGET=400`, a random `VISITOR_SALT`. Then:

```bash
npm run preflight
```

Expected (2026-09-06 shape; leaders move with each 9-hour epoch):

```
== environment
node             https://devnode.telegraphprotocol.com
payer            0x…
daily budget     400 calls, per visitor 64, price cap $0.02, router timeout 65000 ms
paid work        ENABLED
usdc balance     20.00

== 402 challenge (free)
status           402
network          ok  eip155:84532
asset            ok  0x036CbD53842c5426634e7929541eC2318f3dCF7e
payTo            ok  0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8
amount           ok  $0.01

== the questions, and who leads each intent today (the router chooses; this is who it is likely to choose)
read        CONTENT_EXTRACTION    livecert#1, netwire-content-extraction#2, microlink-url-extraction#3
            accepts CONTENT_EXTRACTION
            asks    Read the research paper page at https://arxiv.org/abs/1706.03762 and extract its full title, all authors…
abstract    CONTENT_EXTRACTION    …
authorship  AI_TEXT_DETECTION     caliber-truthport-text-auth#1, livecert#2, veritarach-ai-text-detector#3
…
translate   LANGUAGE_TRANSLATION  livecert#1, langwire-translation#2, test-mymemory-translate#3
headlines   NEWS_HEADLINES        livecert#1, newswire-headlines#2, newsapi#3
search      NEWS_SEARCH           verity-news-search#1, tavily#2, gnews#3
brief       CHAT_COMPLETION       groq-llama31-instant-miner#1, gemini#2, litellm#3
…
preflight clean
```

## 2. Paid: one dossier from the command line (about $0.08)

```bash
npm run live -- research "https://arxiv.org/abs/1706.03762 in Hindi"
```

Expected shape, one line per question (miners, confidences and hashes will differ):

```
payer 0x… · research · 8 steps · "https://arxiv.org/abs/1706.03762 in Hindi"
source      FREE  “Attention Is All You Need” · Vaswani, Ashish, Shazeer, Noam, Parmar, Niki et al. · 2017 · abstract 1100 chars (page metadata, not a Telegraph call)
- extract     CONTENT_EXTRACTION    ok  livecert#1 routed as CONTENT_EXTRACTION · conf 1 · $0.01 · 250ms · signal 0x… · tx 0x…
- summary     CHAT_COMPLETION       ok  groq-llama31-instant-miner#1 routed as CHAT_COMPLETION · …
- authorship  AI_TEXT_DETECTION     ok  caliber-truthport-text-auth#1 routed as AI_TEXT_DETECTION · conf 0.75 · …
- fraud       FRAUD_DETECTION       ok  sarzops-transaction-risk#1 routed as FRAUD_DETECTION · conf 0.6 · …
- fact        FACT_CHECK            ok  qarinah-proofpack#1 routed as FACT_CHECK · conf … · … · 12000ms · …
- provenance  CONTENT_VERIFICATION  ok  <miner>#<rank> routed as <INTENT> · …
- related     ACADEMIC_SEARCH       ok  txlens#1 routed as ACADEMIC_SEARCH · …
- translate   LANGUAGE_TRANSLATION  ok  livecert#1 routed as LANGUAGE_TRANSLATION · conf 1 · …

8/8 steps answered · 8 calls · $0.08 · intents: CONTENT_EXTRACTION, AI_TEXT_DETECTION, …
```

A step may show `ERROR` with the reason and whether anything was charged, or list a first ask
that was *unusable* or *off-target* followed by the second phrasing. The exit code is 0 when at
least half the steps answered.

```bash
npm run live -- news "AI regulation in India, in Hindi"
```

Expected: four questions; `headlines` and `search` routed to news miners, `brief` to a
CHAT_COMPLETION miner, `translate` to a LANGUAGE_TRANSLATION miner.

## 3. The site

```bash
npm run dev
```

1. Open <http://localhost:3000>. Heading: **Ask once. Get the case file.** Two tabs: Research
   paper, News topic.
2. Click the first example, *Extract the research paper at https://arxiv.org/abs/1706.03762 in
   Hindi*, then **Build the dossier**.
3. Eight step cards appear, numbered 01–08, each with its intent chip. They fill in one at a
   time: a spinner, then a stamp (`read`, `human_written`, `RECHECK`, `SUPPORTED`, `found`,
   `translated` …), a receipt block (miner and rank, routed as, confidence bar, cost and
   latency, signal link, settlement link, the router's reasoning) and the answer. A step that
   needed its second phrasing lists both asks under the receipt.
4. The paper card fills with title, authors, year, abstract, and the abstract in Hindi. The
   verdict grid shows Authorship, Fraud record, Key claim, Provenance.
5. The case summary lists one line per step and the totals: `8 Telegraph calls · 8 steps
   answered · $0.08 USDC paid · 7 intents · N miners`. A share box shows `/d/{id}`.
6. Open the share link in a private window: the same dossier, server-rendered, with "A saved
   dossier. Build your own →".
7. Click a signal link: `/verify/{hash}` shows the node's record, the payer wallet with the
   stamp **this app**, "In this app's ledger: yes", and the raw record.
8. Open `/ledger`: the seven stat tiles, the on-chain paragraph ("Payer wallet 0x… has made N
   USDC transfers to the Telegraph collector … Of the N settlement hashes on this ledger page,
   N appear among them"), the intents served, recent dossiers, and the calls table with the
   step's intent and what the router routed it as.
9. Switch to **News topic**, click *What's the latest on AI regulation in India, in Hindi*,
   **Brief me**. Four steps; the briefing card fills last, then its Hindi translation.

10. Switch to **Is this safe?**, click the first example (a fake bank "KYC" message with a link),
    **Check it**. Up to five checks; the verdict card turns to **Caution** or **No red flags**
    once the labels are in, with each check's miner and routed intent under it.

```bash
npm run live -- safety "Your SBI account will be blocked today, verify at http://sbi-kyc-update.xyz now"
```

Expected: `scan`, `cert`, `where`, `scam`, `redflags` answered through the router, and a verdict
line such as `Caution: 2 of 5 checks raised a red flag (Link scan, Red flags in the message).`

## 3b. MCP

```bash
claude mcp add --transport http dossier https://dossier-wukong4.vercel.app/api/mcp
```

Then in Claude Code: *"Use dossier_safety on: Your account will be blocked today, verify at
https://example.com/verify"*. Expected: a text result with the verdict line, one line per check
with miner, routed intent, signal and settlement, and the share link. Without a client:

```bash
curl -s -X POST https://dossier-wukong4.vercel.app/api/mcp -H "content-type: application/json" -H "accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Expected: five tools.

## 3c. Telegram

Create a bot with @BotFather, put its token in `TELEGRAM_BOT_TOKEN` and a random string in
`TELEGRAM_WEBHOOK_SECRET` (locally and on Vercel), redeploy, then:

```bash
npm run telegram:setup
```

Expected: `webhook https://dossier-wukong4.vercel.app/api/telegram · pending 0` and the bot's
username. In Telegram, send the bot `/safe` followed by a suspicious message: one message
appears with a checklist that fills in per question, then the summary with the share link.

## 4. Judge journey, automated

```bash
npm run e2e
```

Expected: `7 passed`, `1 skipped` (the paid test). Against the deployment, with the paid test:

```bash
BASE_URL=https://<deployment> E2E_PAID=1 npm run e2e
```

Expected: `8 passed`.

## 5. Ship

Push as the project's GitHub account (the repo's local identity is already set to it):

```bash
gh auth login
```

```bash
gh repo create Harshyadav442277/dossier --public --source=. --remote=origin --push
```

On Vercel (the project's own account, not any other): **Add New → Project → Import**
`Harshyadav442277/dossier`; framework Next.js is detected; add the variables from `.env.example`;
**Storage → Upstash Redis → Connect**; deploy; then set `PUBLIC_URL` to the deployment URL and
redeploy. Verify with `curl https://<deployment>/api/health` (`payerConfigured: true`,
`paidWorkEnabled: true`, `store: "redis"`).

## 6. Submission text

The Track 3 form (seen 2026-09-07 17:15 UTC) has five fields: X username, title, description,
GitHub repo URL, live app URL. It closes 2026-09-07 23:59:59 UTC.

**Title:** `Dossier`

**Description.** Alexandria cards (seen 2026-09-07 17:40 UTC) are a name, a three-word tagline
in capitals, two sentences, and "Powered by MN<id>" chips; the other Track 3 apps list one or
two hand-picked miners. The first three lines below are that card. Refresh every number from
`/ledger` at submission time, never rounded up.

*ONE QUESTION, FOURTEEN INTENTS*

*Paste a paper, a news topic, or a forwarded message that looks like a scam. Dossier plans it
into up to eight questions and puts every one to Telegraph's own router, which has answered
through 30 different miners so far; every line of the case file carries the miner and its rank,
the router's reasoning, the confidence, the signal hash and the on-chain settlement.*

*Someone sends you a paper to check, a message that looks like a scam, or asks what is going on
with a topic, and you have a minute. Dossier takes that one question and returns a case file in
which every finding was bought from a Telegraph miner the network's own router chose, with the
receipt on the line.*

*Multi-intent, cross-domain, routed. A research link becomes eight questions: key facts, a
plain-words summary, whether the abstract is machine-written, any fraud or retraction record,
whether the key claim holds, provenance, related work, a translation. A news topic becomes
headlines, a search, a written briefing and a translation. A link, wallet or forwarded message
becomes a link scan, a certificate check, where the host really is, its fraud record and the red
flags in the text. Fourteen intents asked (CONTENT_EXTRACTION, CHAT_COMPLETION,
AI_TEXT_DETECTION, FRAUD_DETECTION, FACT_CHECK, CONTENT_VERIFICATION, ACADEMIC_SEARCH,
LANGUAGE_TRANSLATION, NEWS_HEADLINES, NEWS_SEARCH, URL_SCAN, SSL_VERIFICATION, IP_GEOLOCATION,
TEXT_CLASSIFICATION); the router has filed them under nineteen. Each question is one
auto-routed POST /engine/v1/ask. Dossier never names a miner, never asks a second miner for a
second opinion, and never grades them.*

*Signal quality and verification. Every line carries the miner and its rank, the intent the
router chose and its stated reasoning, the miner's confidence, the price, the signal hash and
the on-chain settlement. Verdicts come from the miners' own labels, never from comparing
miners. A failed or unusable answer says so, and whether anything was charged. Nothing is
mocked or filled in.*

*Three doors, one wallet, one ledger. The web app; the Telegram bot @My_Dossier_bot, where a
forwarded message becomes a checklist that fills in one miner at a time; and an MCP server at
/api/mcp (five tools, Streamable HTTP, no auth), so any agent can order a case file with every
receipt attached.*

*Organic by construction. Every call traces to a person's click or message. No cron, no
scripts, no keep-warm. The public ledger at /ledger lists every call with a hashed visitor id
and, beside it, the payer wallet's USDC transfers to the Telegraph collector read from
Blockscout, so the volume can be checked without taking the app's word. Every signal hash opens
on the node.*

*At submission (7 Sep, [HH:MM] UTC, from /ledger): [N] routed calls, [N] answered, [N]
dossiers, [N] visitors, [N] settlements on chain, [N] miners.*

*Payer wallet 0xFEc66E0F5c64296fF190EdCeD88C781eeEdFd9d3 · Base Sepolia · USDC · node
devnode.telegraphprotocol.com · every miner chosen by the router.*

**GitHub repo URL:** `https://github.com/Harshyadav442277/dossier`

**Live app URL:** `https://dossier-wukong4.vercel.app`

**X username:** the operator's handle; it is not recorded in this repository.

Payer (if asked anywhere): `0xFEc66E0F5c64296fF190EdCeD88C781eeEdFd9d3` · Ledger:
`https://dossier-wukong4.vercel.app/ledger` · MCP: `https://dossier-wukong4.vercel.app/api/mcp`
· Telegram: `https://t.me/My_Dossier_bot`
