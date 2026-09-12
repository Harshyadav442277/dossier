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

## 2026-09-12 — "I still get errors sometimes"

**What the ledger said (162 rows, 09-09 to 09-11).** 81 ok, 57 unusable, 24 error. The
unusable ones were mostly the app's: 27 livecert news-search answers in prose read as empty
(G26), 12 translations to a miner without the pair or over its length limit (G27), 6 empty
headline lists for topics the parser had mangled (G29). The errors were the network's (G28).

**Decisions**
- Read prose answers: a reader that parses `"Title" (Publisher, date)`; the generic news reader
  reads `reason` and prose too.
- A third paid ask only with a fresh wording. Four wordings for headlines, search, translate,
  detection and extraction.
- Translation cut at 480 characters; the step accepts a language model's translation, worded
  as a writing task in wordings three and four.
- WRITING = CHAT_COMPLETION, TEXT_GENERATION, LANGUAGE_GENERATION, TASK_COMPLETION.
  RESEARCH_SYNTHESIS out: its leader ignores the notes. Extraction is strict.

**Lessons**
- "Unusable" in the ledger is a claim about the reader as much as the miner. Twenty-seven rows
  said "no articles came back"; the miner had listed five each time. Read a raw result before
  believing a reader.
- Leaderboards move: livecert took #1 or #2 on five intents in four days and added endpoints.
  Re-check `/api/miners?intent=` when a step's miner changes.
- The parser's topic is what every question is built from; a bad topic fails four steps.
- A 2xx with a plausible label is not a good answer: the Ukrainian translation was four words
  long and marked *translated*. Readers must check the answer against the input they were
  given (length, language, the placeholder page of G25), not only against the miner's schema.
- Straight quotes and apostrophes inside a quoted parameter end it early for a miner that
  parses its own question; send curly ones.
- Verified on production after the deploy: news 4/4 first ask each (CicAhH4k, $0.04).

## 2026-09-08 — After the deadline: the briefing

**The report.** "Many recent calls fail; the errors come from passing one miner's result into
another miner's question." True for news mode only: headlines → search → briefing → translation
is the one chain where a miner's answer is embedded in the next question. Research and safety
steps work from the page or the pasted text.

**Decisions**
- A step's carried data is read without assuming which intent answered it (`carriedArticles`
  reads `items` and `articles`; a generic reader covers news miners without one).
- The briefing is four wordings of a rewriting task: no "news", "headlines", "coverage" or
  "source", never the reader's own query, a closing line that restates the task. Up to six asks
  per step, still two paid.
- No fallback outside the router when the node refuses every pick; the step fails and says so.

**Lessons, each paid for or free**
- The router classifies by what the text is about. Notes with outlets and dates read as a
  search; "name the source of each point" reads as RESEARCH_QUERY; an arrest in the notes read
  as FRAUD_DETECTION. Say what to *do* with the text, at the start and again at the end.
- The router's pick for one wording is nearly fixed. Re-asking in the same words returns the
  same refused miner; a different wording is a different draw.
- "not currently routable" is free (checked on chain), transient, per miner, and not visible in
  anything the catalogue or the dispatcher publishes (G23). It took eight probes to know that.
- One paid probe of the router's own TEXT_GENERATION example ("Rewrite this paragraph to sound
  more formal") answered at once; the same task with 1,200 characters of notes did not. Length
  and content, not the verb, decide the pick.
- A 60-second 504 from the node's gateway may or may not have settled; check Blockscout before
  assuming either.
- "Turn these notes into a paragraph" was filed as FRAUD_DETECTION, RESEARCH_SYNTHESIS and
  CONTENT_EXTRACTION on three asks; verbs from the router's own definition (rewrite, summarise,
  draft, compose) fare better than figurative ones.
- When the router hands text to a miner that wants a URL, it invents one (example.com) and the
  miner answers about that page with a 2xx. A reader must know what the step supplied, not just
  what the miner returned.
- Verified on production after the deploys: news 4/4 (oOFh2Vox, $0.05; szo3WW15, $0.04, every
  step on its first ask, briefing by groq under TEXT_GENERATION), research 8/8 (-EmNQajM, $0.09).
  Session spend including probes: 22 settlements, $0.22, all on chain and (bar one probe) on the
  ledger.

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
- The judge journey is only free when paid work is off. A local `npm run e2e` at 17:35 UTC
  with the production key and a budget set spent $0.08 on eight routed calls that sit on chain
  and not on the ledger (G22). Set `DAILY_CALL_BUDGET=0` before any local run.
- Pushing to GitHub deploys nothing: the Vercel project is linked but not git-connected.
  Deploy with `npx vercel deploy` (preview, no payer key), check the pages, then
  `npx vercel deploy --prod`; the alias swaps within seconds of "status ok".
- The organisers' rules, compiled 2026-09-07: only routed calls count; scripted calls do not;
  never re-ask an intent to several miners or grade them; lead with the person's problem.
