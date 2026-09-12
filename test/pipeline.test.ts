import { describe, expect, it } from "vitest";
import { parseQuery } from "@/lib/parse";
import { buildPlan, clipSentences, dateOf, deriveInput, keySentence, metaOf, NEWS_STEPS, proseForTranslation, RESEARCH_STEPS, SAFETY_STEPS, subjectOf, summarize } from "@/lib/pipeline";
import type { StepResult } from "@/lib/types";

const ABSTRACT =
  "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train.";

describe("plan", () => {
  it("plans eight research questions with a language and seven without", async () => {
    expect(buildPlan(parseQuery("research", "https://arxiv.org/abs/1 in Hindi")).map((s) => s.id)).toEqual(["extract", "summary", "authorship", "fraud", "fact", "provenance", "related", "translate"]);
    expect(buildPlan(parseQuery("research", "https://arxiv.org/abs/1")).length).toBe(7);
    expect(buildPlan(parseQuery("news", "AI regulation in India in Hindi")).map((s) => s.id)).toEqual(["headlines", "search", "brief", "translate"]);
  });
  it("covers all ten intents across both modes and accepts its own intent everywhere", async () => {
    const all = [...RESEARCH_STEPS, ...NEWS_STEPS];
    expect([...new Set(all.map((s) => s.intent))].sort()).toEqual(["ACADEMIC_SEARCH", "AI_TEXT_DETECTION", "CHAT_COMPLETION", "CONTENT_EXTRACTION", "CONTENT_VERIFICATION", "FACT_CHECK", "FRAUD_DETECTION", "LANGUAGE_TRANSLATION", "NEWS_HEADLINES", "NEWS_SEARCH"]);
    for (const s of all) expect(s.accept).toContain(s.intent);
  });
});

describe("inputs", () => {
  const parsed = parseQuery("research", "https://arxiv.org/abs/1706.03762 in Hindi");
  const spec = (id: string) => RESEARCH_STEPS.find((s) => s.id === id)!;
  const ctx = { source: { url: "https://arxiv.org/abs/1706.03762", title: "Attention Is All You Need", authors: ["Ashish Vaswani", "Noam Shazeer"], abstract: ABSTRACT, date: "2017-06-12", year: "2017", site: "arxiv.org" } };

  it("reads the paper from the page's metadata", async () => {
    expect(metaOf(ctx)).toMatchObject({ title: "Attention Is All You Need", authors: ["Ashish Vaswani", "Noam Shazeer"], abstract: ABSTRACT, year: "2017" });
    expect(metaOf({}).title).toBeNull();
  });
  it("asks for structured facts from the abstract, and skips without one", async () => {
    const d = await deriveInput(spec("extract"), parsed, ctx);
    expect("queries" in d && d.queries[0]).toMatch(/^Extract the dates, quantities, named entities and events from: The dominant/);
    expect("context" in d ? d.context : undefined).toBeUndefined();
    expect(await deriveInput(spec("extract"), parsed, {})).toHaveProperty("skip");
  });
  it("asks for a plain-words summary as a rewriting task that never says research", async () => {
    const d = await deriveInput(spec("summary"), parsed, ctx);
    expect("queries" in d && d.queries[0]).toMatch(/^Rewrite the following abstract as three plain sentences/);
    expect("queries" in d && d.queries[0]).not.toMatch(/research|paper/i);
    expect("queries" in d && d.queries[0]).toMatch(/Title: Attention Is All You Need\. Abstract: The dominant/);
    expect("context" in d ? d.context : undefined).toBeUndefined();
  });
  it("skips authorship on thin prose and sends the abstract as text otherwise", async () => {
    expect(await deriveInput(spec("authorship"), parsed, { source: { abstract: "too short" } })).toHaveProperty("skip");
    const d = await deriveInput(spec("authorship"), parsed, ctx);
    expect("context" in d ? d.context : undefined).toBeUndefined();
    expect("queries" in d && d.queries[0]).toMatch(/^Was the following passage written by an AI or by a human\? Passage: The dominant/);
    expect("queries" in d && d.queries[1]).toMatch(/^AI text detection/);
  });
  it("turns the abstract's result sentence into the claim", async () => {
    expect(keySentence(ABSTRACT)).toMatch(/^Experiments on two machine translation tasks show/);
    const d = await deriveInput(spec("fact"), parsed, ctx);
    expect("queries" in d && d.queries[0]).toMatch(/^Is this claim true\? Experiments .* \(claim from the paper “Attention Is All You Need” by Ashish Vaswani, Noam Shazeer \(2017\)\)$/);
  });
  it("asks a provenance question and skips without a title", async () => {
    const d = await deriveInput(spec("provenance"), parsed, ctx);
    expect("queries" in d && d.queries[0]).toMatch(/genuine and unaltered/);
    expect("queries" in d && d.queries[1]).toMatch(/^Search the academic literature/);
    expect(await deriveInput(spec("provenance"), parsed, {})).toHaveProperty("skip");
  });
  it("translates whole sentences within the cap and names the language in every translator's shape", async () => {
    const d = await deriveInput(spec("translate"), parsed, ctx);
    expect("queries" in d && d.queries[0]).toMatch(/^Translate "The dominant .* into Hindi.$/);
    expect("queries" in d && d.queries[1]).toMatch(/(hi)/);
    // Two wordings for a translator, two for a language model; the text stays under MyMemory's 500.
    expect("queries" in d ? d.queries.length : 0).toBe(4);
    expect("queries" in d && d.queries[2]).toMatch(/^Rewrite the following passage in Hindi, translating it faithfully/);
    expect("input" in d && d.input.text!.length).toBeLessThanOrEqual(480);
    expect(spec("translate").accept).toEqual(expect.arrayContaining(["LANGUAGE_TRANSLATION", "CHAT_COMPLETION", "TEXT_GENERATION"]));
    expect(clipSentences("One. Two. Three.", 9)).toEqual({ text: "One. Two.", truncated: true });
  });
  it("gives the steps the router misroutes four wordings, and keeps synthesis out of the writing intents", async () => {
    for (const id of ["extract", "authorship"]) {
      const d = await deriveInput(spec(id), parsed, ctx);
      expect("queries" in d ? d.queries.length : 0).toBe(4);
    }
    expect((await deriveInput(spec("authorship"), parsed, ctx) as { queries: string[] }).queries[2]).toMatch(/^Here's a paragraph: "The dominant/);
    expect(spec("extract").strict).toBe(true);
    // The steps that write from the text they are given never take a synthesis of the topic;
    // the two scholarly-search steps (provenance, related) still may.
    for (const s of [...RESEARCH_STEPS, ...NEWS_STEPS].filter((s) => s.strict)) expect(s.accept).not.toContain("RESEARCH_SYNTHESIS");
    for (const id of ["brief", "summary"]) expect([...RESEARCH_STEPS, ...NEWS_STEPS].find((s) => s.id === id)!.accept).toContain("TASK_COMPLETION");
    const news = parseQuery("news", "AI regulation in India");
    expect((await deriveInput(NEWS_STEPS[0]!, news, {}) as { queries: string[] }).queries.length).toBe(4);
    expect((await deriveInput(NEWS_STEPS[1]!, news, {}) as { queries: string[] }).queries.length).toBe(4);
  });
  it("words the briefing as a rewriting task from notes, never as a search, whichever shape the notes arrived in", async () => {
    const news = parseQuery("news", "China Top headlines and news in Hindi");
    const brief = NEWS_STEPS.find((s) => s.id === "brief")!;
    // The headlines step answered by a NEWS_SEARCH miner (`articles`), the search step by a NEWS_HEADLINES miner (`items`).
    const d = await deriveInput(brief, news, {
      headlines: { articles: [{ title: "H1 - BBC", source: "BBC", published: "Tue, 08 Sep 2026 04:08:44 GMT", description: "H1 &nbsp;&nbsp; BBC" }], answer: null },
      search: { items: [{ title: "A1", source: "Reuters", published: "2026-09-01T10:00:00Z", description: "What A1 says &amp; why" }, { title: "H1", source: "BBC" }] },
    });
    const q = "queries" in d ? d.queries[0] : "";
    expect(q).toMatch(/^Rewrite the following notes as a briefing of 120 to 180 words/);
    expect(q).not.toMatch(/news|headline|coverage|article|reader's question/i);
    expect(q).not.toContain(news.query);
    expect(q).toContain("- H1 (BBC, 2026-09-08)\n- A1 (Reuters, 2026-09-01): What A1 says & why");
    expect(q).not.toContain("&nbsp;");
    expect("queries" in d ? d.queries[1] : "").toMatch(/^Summarise these notes on China in one paragraph/);
    expect("queries" in d ? d.queries.length : 0).toBe(4);
    for (const w of "queries" in d ? d.queries : []) expect(w).not.toMatch(/news|headline|coverage|source|cite|look anything up/i);
    expect("context" in d ? d.context : undefined).toBeUndefined();
    expect(await deriveInput(brief, news, {})).toHaveProperty("skip");
    // A search miner's one-line answer is the note when no article came back at all.
    const thin = await deriveInput(brief, news, { search: { articles: [], answer: "Recent items include X from Y." } });
    expect("queries" in thin ? thin.queries[0] : "").toContain("- Recent items include X from Y.");
  });
  it("strips the words that ask for a search from the subject", () => {
    expect(subjectOf('Headlines "Flood"')).toBe("Flood");
    expect(subjectOf("China Top headlines and news")).toBe("China");
    expect(subjectOf("Headlines about Human trafficking")).toBe("Human trafficking");
    expect(subjectOf("Crime headlines")).toBe("Crime");
    expect(subjectOf("AI regulation")).toBe("AI regulation");
    expect(subjectOf("Worldwide headlines")).toBe("Worldwide");
    expect(subjectOf("headlines")).toBeNull();
    expect(dateOf("Tue, 08 Sep 2026 04:08:44 GMT")).toBe("2026-09-08");
    expect(dateOf("not a date at all")).toBe("not a date");
    expect(proseForTranslation("## Brief\n\n**Bold** point.\n- one\n- two")).toBe("Brief Bold point. one two");
  });
  it("translates the briefing as plain prose, else the titles the earlier steps carried in either shape", async () => {
    const news = parseQuery("news", "AI regulation in India in Spanish");
    const translate = NEWS_STEPS.find((s) => s.id === "translate")!;
    const withBrief = await deriveInput(translate, news, { brief: { text: "**Bold** lead. Second sentence." } });
    expect("queries" in withBrief ? withBrief.queries[0] : "").toBe('Translate "Bold lead. Second sentence." into Spanish.');
    const fromArticles = await deriveInput(translate, news, { headlines: { articles: [{ title: "H1 - BBC", source: "BBC" }] }, search: { items: [{ title: "A1." }] } });
    expect("queries" in fromArticles ? fromArticles.queries[0] : "").toBe('Translate "H1. A1" into Spanish.');
    expect(await deriveInput(translate, news, { headlines: { articles: [] } })).toHaveProperty("skip");
  });
  it("phrases headlines and search with the region", async () => {
    const news = parseQuery("news", "AI regulation in India");
    const h = await deriveInput(NEWS_STEPS[0]!, news, {});
    expect("queries" in h && h.queries[0]).toBe("What are the top news headlines about AI regulation in India today?");
    const s = await deriveInput(NEWS_STEPS[1]!, news, {});
    expect("queries" in s && s.queries[0]).toBe("Find recent news articles from the last 7 days about AI regulation in India.");
  });
});

describe("safety", () => {
  it("plans only the checks the input allows", async () => {
    expect(buildPlan(parseQuery("safety", "Verify at https://example.com/x and send ETH to 0x000000000000000000000000000000000000dEaD to unlock your prize now")).map((s) => s.id)).toEqual(["scan", "cert", "where", "scam", "redflags"]);
    expect(buildPlan(parseQuery("safety", "https://example.com")).map((s) => s.id)).toEqual(["scan", "cert", "where", "scam"]);
    expect(buildPlan(parseQuery("safety", "0x000000000000000000000000000000000000dEaD")).map((s) => s.id)).toEqual(["scam"]);
    for (const s of SAFETY_STEPS) expect(s.accept).toContain(s.intent);
  });
  it("asks about the wallet before the site, classifies the message, and skips a host that does not resolve", async () => {
    const p = parseQuery("safety", "Send 0.1 ETH to 0x000000000000000000000000000000000000dEaD via https://no-such-host.invalid/ to claim your prize today please");
    const spec = (id: string) => SAFETY_STEPS.find((s) => s.id === id)!;
    const scam = await deriveInput(spec("scam"), p, {});
    expect("queries" in scam && scam.queries[0]).toMatch(/^How likely is the wallet 0x0000/);
    const flags = await deriveInput(spec("redflags"), p, {});
    expect("queries" in flags && flags.queries[0]).toMatch(/^Read this message someone received/);
    expect("queries" in flags && flags.queries[1]).toMatch(/^Classify this text message as one of: scam, phishing, spam, legitimate/);
    expect("queries" in flags && flags.queries[0]).toMatch(/\[a wallet address\] via \[a link\]/);
    expect("queries" in flags && flags.queries[0]).not.toMatch(/0x0000/);
    const cert = await deriveInput(spec("cert"), p, {});
    expect("queries" in cert && cert.queries[0]).toBe("Is the TLS certificate for no-such-host.invalid currently valid, and who issued it?");
    expect(await deriveInput(spec("where"), p, {})).toHaveProperty("skip");
  });
});

describe("summary", () => {
  it("counts every question asked and what it cost, including failed ones, and names the paper", async () => {
    const parsed = parseQuery("research", "https://arxiv.org/abs/1");
    const steps: StepResult[] = [
      {
        id: "extract",
        title: "Key facts",
        intent: "CONTENT_EXTRACTION",
        status: "ok",
        receipt: null,
        data: { facts: ["dates: 2017"] },
        error: null,
        attempts: [
          { phrasing: 1, minerSlug: "a", minerRank: 2, intent: "WEB_SEARCH", outcome: "off-target", durationMs: 10, costUsd: 0.01, note: null },
          { phrasing: 2, minerSlug: "b", minerRank: 3, intent: "CONTENT_EXTRACTION", outcome: "ok", durationMs: 10, costUsd: 0.01, note: null },
        ],
      },
      { id: "fraud", title: "Fraud", intent: "FRAUD_DETECTION", status: "error", receipt: null, data: null, error: "boom", attempts: [] },
    ];
    const s = summarize(parsed, steps, { title: "T", authors: ["A"], year: "2017" });
    expect(s.calls).toBe(2);
    expect(s.costUsd).toBe(0.02);
    expect(s.lines[0]).toMatch(/^Paper: T — A \(2017\)/);
    expect(s.lines.some((l) => l.includes("boom"))).toBe(true);
  });
});
