# ARCHITECTURE — Dossier

## Shape

Next.js 15 (App Router) on the Node runtime, deployed to Vercel. No database is required:
Upstash Redis is used when its REST credentials are present, memory otherwise. One payer wallet,
held by the operator, pays every x402 call. The app never calls a miner by name.

```
browser ──POST /api/plan──▶ parse the sentence, list the questions (free)
        ──POST /api/step──▶ run ONE question: guard → POST /engine/v1/ask → read → receipt → ledger row
        ──POST /api/step──▶ … next question, carrying the previous answers' data
        ──POST /api/dossier─▶ save the assembled case file, return /d/{id}
```

```
lib/parse.ts      sentence → {mode, url, topic, language, region, category}
lib/pipeline.ts   step specs, the two to four wordings per step, runStep, summary
lib/adapters.ts   readers: how to understand each known miner's answer; generic fallback
lib/telegraph.ts  node client: x402-paying auto-routed ask, catalogue (to name and rank what
                  the router chose), signals, balance
lib/receipt.ts    confidence/label/answer from each miner's declared signal_mapping
lib/store.ts      ledger, counters, visitors, dossiers (memory | Upstash Redis)
lib/guard.ts      daily budget, per-browser allowance, pause
lib/chain.ts      the payer wallet's USDC transfers to the collector, from Blockscout
app/              pages: / (workbench), /d/[id], /ledger, /verify/[hash]; api routes
```

## Decisions

**A1. One question per HTTP request, driven by the browser.** A research dossier is eight paid
questions and a FACT_CHECK miner alone can take 30 seconds. Running the whole pipeline in one
serverless function would blow the 60-second ceiling and show nothing until the end. Each
question is its own request with its own budget; the page fills in as receipts arrive;
questions run one after another because two payments in flight from one wallet are refused by
the facilitator.

**A2. Everything goes through Telegraph's router.** Every step is an auto-routed
`POST /engine/v1/ask {query, context?}`. The network's LLM router classifies the intent, picks a
ranked miner and keeps a fallback behind it; the response carries the intent, the miner and the
router's reasoning, all of which land on the receipt. The direct path
(`/engine/v1/ask/{minerId}`) is not used anywhere: the protocol's judgement about who should
answer is the product, not something to route around.

**A2b. The page is read by the app, for free, and says so.** Three phrasings of "read this
link" were routed to the #1 CONTENT_EXTRACTION miner, an inline-text extractor that fetches
nothing, and a "search the web for this paper" phrasing went to an academic search of the
literal string. The network cannot fetch a page through the router today. `lib/source.ts`
reads the page's `citation_*` and Open Graph tags (public host only, DNS-checked, redirects
re-checked, 40 pages per browser per day), the UI labels it as free and not a Telegraph call,
and every paid question works on that abstract. CONTENT_EXTRACTION is then asked what its
leader is good at: structured facts from inline text.

**A3. The question carries everything; no `context` hints.** The node merges `context` into
the routed request body, and a strict miner the router picks (the Bedrock chat miners) rejects
any key it does not declare with a 400. Translation and detection questions lost most of a day
to that (GAPS G2). Every passage, target language and instruction is now in the sentence
itself, worded so the engine can fill the miner's parameters from it (the translator wants the
text in quotes; the briefing is worded as writing from notes, never as a search).

**A4. Two to four wordings, up to six asks, one payment at a time.** Each step declares the
intents it can accept. At most two asks are paid; a free failure, meaning the node refusing,
naming a miner it then calls unroutable, inventing an endpoint the miner does not declare, or
a slow facilitator, does not count, up to six asks in all inside the step's 75-second window.
The router's pick for one wording barely varies (the same refused miner came back for the same
words every time on 2026-09-08), so the wordings are used in turn and a step whose intent has a
large or flaky pool carries four of them; a third paid ask is allowed only when a wording not
yet sent remains, since re-asking in words already sent draws the same miner. The router classifies by what the text is *about*, not
what it asks for: a writing task whose notes name outlets and dates was filed as NEWS_SEARCH,
RESEARCH_QUERY ("name the source of each point" is that intent's definition) and once, over an
arrest in the notes, FRAUD_DETECTION. So a question built from earlier answers never repeats
the reader's own query, never says news, headlines, coverage or source, and closes by restating
the task. A timeout is never re-asked, because
the call may still settle. A miner's answer that cannot serve the step is *unusable*; an answer
filed under an intent the step cannot use is *off-target*; strict steps (extraction, detection,
fact-check, translation, the briefing) never use an off-target answer, the others keep it and
say so. All questions from all visitors queue through one lock, because the facilitator
refuses a second concurrent payment from the same wallet.

**A5. Readers, not request builders.** The app cannot choose the miner, so it only has to
understand answers. What a step hands on is read back without assuming which intent answered
it: the router may give the headlines step to a NEWS_SEARCH miner (which files `articles`) and
the search step to a NEWS_HEADLINES miner (`items`), and until 2026-09-08 the briefing read
only the canonical shape and saw an empty list. `carriedArticles` reads both, strips the feed's
HTML entities and " - Source" suffixes, and any news miner without a reader of its own is read
by a generic one that finds the first titled list, or the titles quoted in its prose: the #2
NEWS_SEARCH miner answers in sentences, and 27 paid answers were read as empty before the
reader learned that (GAPS G26). The writing intents a step accepts are CHAT_COMPLETION,
TEXT_GENERATION, LANGUAGE_GENERATION and TASK_COMPLETION; never RESEARCH_SYNTHESIS, whose
leader writes about the topic from Wikipedia and ignores the notes. Translation also accepts
them: two of its four wordings are shaped for a language model, for the languages the
dictionary translators lack. Known miners for each intent have an exact reader taken from their manifest
and live probes (an arXiv page read by the page extractor is parsed for title, authors and
date; the AI-text leader's confidence is read as P(AI-written); a translation engine's
`translation: null` is *unusable*). Unknown miners are read through the generic receipt text
and the step's data is built from that.

**A6. Receipts read the miner's own `signal_mapping`.** Confidence, label and reason come from
the fields each miner declares, normalised from 0–1, 0–100 and strings; a declared field that is
really a risk score is labelled as such rather than shown as certainty.

**A7. Spending is off unless deliberately on, and capped per payment.** No key, zero budget and
no pause flag is the default. A global daily budget, a per-browser daily allowance (a random
cookie, stored only as a salted hash) and a pause flag are checked before every question. The
router may pick a miner charging more than a cent, so the x402 client's spend controls cap every
payment at `MAX_CALL_PRICE_USDC`; a payment above the cap is never constructed and costs
nothing.

**A8. Dossiers are saved from the server's own copies.** Every finished step is stored
server-side under its signal hash. The browser posts the dossier back naming those hashes; the
server rebuilds each finished step from its own copy and never stores the browser's version of
a receipt or its data. A shared page therefore cannot show anything the network did not say.

**A9. Two counts of the same thing.** The ledger is the app's record. The chain is not: the
payer wallet's USDC transfers to the Telegraph collector are read from Blockscout and shown
beside the ledger, with the number of ledger settlements found among them. Judges can count the
calls without trusting the app.

**A10. Failures are surfaced, never smoothed.** Skipped steps say why, failed steps say whether
anything was charged, *unusable* and *off-target* are their own states, and the summary lists
failures as lines, not as absence.

**A11. The Request is materialised before the payment wrapper sees it.** `wrapFetchWithPayment`
clones the request for the paid retry; on a serverless runtime the `(url, init)` form lost its
body on the retry and the node answered with a bare challenge. Building `new Request(...)` first
is the fix; do not simplify it away without re-running a paid call on the deployment.

**A12. MCP and Telegram share one server-side runner.** `lib/run.ts` runs a whole dossier in
sequence with a callback per finished step; `app/api/mcp` (official MCP SDK, web-standard
Streamable HTTP transport, stateless per request, `maxDuration` 300) and `app/api/telegram`
(webhook, quick 200, the run continues inside `waitUntil`, one progress message edited per
step) both call it. Visitors are keyed by caller address or chat id, so the same allowance
applies; nothing bypasses the guards, the ledger or the router-only rule.

## Data

- `LedgerRow`: one per question, with the step's intent and the router's intent, status
  `ok | unusable | error | timeout | unpaid`, miner, rank, confidence, cost, latency, signal hash,
  settlement tx, visitor hash, and a 160-character preview.
- `Dossier`: mode, query, parsed fields, steps with receipts, attempts and structured data,
  summary lines and totals. Stored 90 days in Redis, 500 in memory.
- Redis keys are prefixed `dz:`; counters per UTC day expire after three days.

## Environment

See `.env.example`. `PAYER_PRIVATE_KEY` accepts MetaMask's bare 64-hex export or the `0x` form.
`TELEGRAPH_NODE` defaults to `https://devnode.telegraphprotocol.com`. Base Sepolia, USDC
`0x036CbD53842c5426634e7929541eC2318f3dCF7e`, collector
`0x5a2324aA18613FAD4e44bDF0d6c73Ec1f6D87ff8`, network id `eip155:84532`.
