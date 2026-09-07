# MEMORY — decisions made and lessons learned

Read first every session. Keep it short: decisions and why, lessons and what they cost.

## 2026-09-06 — Build day

**Decisions**

- **Everything through Telegraph's router; no direct dispatch.** The first build chose miners
  from the leaderboard and called them by id for typed inputs. The operator ruled that out at
  about 06:20 UTC: auto-routing is the protocol's judgement and the product should rest on it.
  `askDirect` and the request builders were removed; each step now has two phrasings, an
  accept-list of intents, and a reader for the answer (ARCHITECTURE A2–A5).
- One question per request, browser-driven (A1). A whole dossier in one function would not fit
  60 seconds and would show nothing until the end.
- Price cap $0.02 inside the x402 client's spend controls, because the router may pick a miner
  charging $0.20 (zengawd, FRAUD_DETECTION) and the app can no longer screen prices beforehand.
- No Telegram, no MCP, no API keys. Scope is the two modes and the receipts; distribution is
  the web link.
- Docs follow the hackathon framework: PRD, ARCHITECTURE, PHASES, GAPS, MEMORY, DEMO.

- **The page is read by the app.** Paid probes showed the router sends every link question to
  the inline-only extractor; the app reads the page's metadata tags for free and says so, and
  the network is asked what it can answer (facts from the abstract, a summary, detection,
  fraud, fact-check, provenance, related work, translation).
- Briefings are worded as "write from these notes": with "news" or "headlines" in the
  question the router filed the writing task as NEWS_SEARCH and a search miner answered.
- Deployed on the operator's existing Vercel team (allowed from ~10:00 UTC); SSO deployment
  protection was on by default and had to be switched off with `vercel project protection
  disable --sso`, or every visitor was sent to a Vercel login.

**Lessons from the live node and the docs, all free**

- `POST /engine/v1/ask` takes `{query, context?}`; `context` is "merged into the routed request
  body" for structured hints. The response carries `intent`, `reasoning`, `miner_id`,
  `miner_name` (which "may be the fallback rather than the router's first pick"), `endpoint`,
  `signal_hash`, `warnings`. On the routed path nothing is ever blocked by pre-validation.
- The node's pre-validation is a free test harness for the *direct* path only; on the routed
  path the payment gate runs first, so a routed question cannot be probed for free.
- The dispatcher OpenAPI (`/miner-dispatcher/openapi.json`, 2.3 MB) is keyed by numeric miner
  id (`/v1/4433/extract`), not slug.
- livecert's `/extract` is a structured extractor for inline text; it fetches nothing. The URL
  readers are netwire (returns a 500-character excerpt whose arXiv chrome carries title,
  authors and date) and microlink (metadata incl. the abstract).
- livecert's `/headlines` honours Google News sections and a region in the question, and
  ignores free-text topics.
- langwire (Apertium) lacks Hindi and answers 200 with `translation: null`; a 2xx that cannot be
  used must be its own state, or the step would show an empty answer as success.
- caliber-truthport's `confidence` is P(AI-written), not certainty for its label.
- sarzops answers research-paper fraud questions sensibly ("no documented concerns…") and
  marks itself `RECHECK` at 0.6; qarinah takes 8–30 seconds.
- x402 2.24.0 exports `wrapFetchWithPayment`, `x402Client.fromConfig` (with `spendControls:
  {maxAmountPerPayment: "$0.02"}`), `toClientEvmSigner` (one argument is enough),
  `ExactEvmScheme`. The docs' `createSigner` does not exist there.
- The settlement transaction is only in the `payment-response` header of the paying request;
  the signal record served later does not carry it.
- Blockscout's `token-transfers?type=ERC-20&filter=from` gives `transaction_hash`, `to.hash`,
  `token.address_hash`, `total.value`, and `next_page_params` for paging.

**Cost of the day's mistakes**

- Building direct dispatch first cost about an hour and a rewrite. The question that would have
  saved it: "should the app ever name a miner, or is the router the point?" Ask it before
  building anything that chooses on the network's behalf.
- Two unit tests caught my own helpers: the numbered-title regex ran across a quoted title, and
  the claim picker preferred "we propose" over "experiments show". Ten minutes each.

## 2026-09-07 — Ship day

**State at 17:10 UTC.** Live on three doors: web <https://dossier-wukong4.vercel.app>, MCP
`/api/mcp` (five tools, verified end to end), Telegram @My_Dossier_bot (webhook registered,
first real safety check ran 16:48 UTC, dossier saved). Repo `Harshyadav442277/dossier`, latest
`71e32cc`. Production: Redis, payer `0xFEc66E…9d3` with ~52 USDC, budget 400/day, 241 calls,
15 visitors, 28 dossiers. Deadline 23:59:59 UTC today; X posts and the submission form are
the operator's.

**Decisions**
- Third mode "Is this safe?" (URL_SCAN, SSL_VERIFICATION, IP_GEOLOCATION, FRAUD_DETECTION,
  TEXT_CLASSIFICATION), verdict computed from the miners' labels; fourteen intents in all.
- MCP and Telegram share `lib/run.ts`; Telegram answers 200 fast and runs inside `waitUntil`.
- No `context` hints at all (A3); questions carry everything.
- Up to four asks per step, two paid (three if two were unusable), 65 s per ask, no new ask
  after 75 s, one payment at a time through a Redis lock (A4).

**Lessons, each paid for**
- Backslashes (LaTeX) in a question break the router's own JSON; strip them before sending.
- A `context` key a strict chat miner does not declare is a 400; translation fell to 2/8.
- The #1 translator wants the text in quotes; the Apertium one has no Hindi and gets picked
  repeatedly, so demo with Spanish or French.
- "Documented retraction … research paper" is filed under research and hits an endpoint the
  router invents; "how likely is X to be fraudulent" is filed under FRAUD_DETECTION.
- Naming "news" or "headlines" in a writing task makes the router file it as a search.
- A miner that puts its paragraph in the label field hid a phishing verdict; labels over 60
  characters are prose.
- Four slow asks plus lock waiting exceeded Vercel's 180 s; bound the step, not the ask.
- The facilitator's "insufficient_credits" is the node's balance, not the payer's; the
  organisers confirmed spam had drained it.
