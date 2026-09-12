import { describe, expect, it } from "vitest";
import { articlesFromProse, arxivFromExcerpt, carriedArticles, cleanNote, cleanTitle, fallbackData, genericNews, READERS, readerFor, splitAuthors, titlesFromProse, translationTooShort } from "@/lib/adapters";

const ARXIV_EXCERPT =
  "Skip to main content Search Submit Donate Log in Search arXiv Press Enter to search &middot; Advanced search -- Computer Science Computation and Language arXiv:1706.03762 (cs) [Submitted on 12 Jun 2017 ( v1 ), last revised 2 Aug 2023 (this version, v7)] Title: Attention Is All You Need Authors: Ashish Vaswani , Noam Shazeer , Niki Parmar , Jakob Uszkoreit View a PDF of the paper titled Attention Is All You Need, by Ashish Vaswani";

describe("content extraction readers", () => {
  it("netwire: reads title, authors and date out of an arXiv excerpt", () => {
    const parsed = READERS.CONTENT_EXTRACTION!["netwire-content-extraction"]!({ title: "[1706.03762] Attention Is All You Need", excerpt: ARXIV_EXCERPT, char_count: 4930 }, { url: "https://arxiv.org/abs/1706.03762" });
    expect(parsed.data).toMatchObject({ title: "Attention Is All You Need", authors: ["Ashish Vaswani", "Noam Shazeer", "Niki Parmar", "Jakob Uszkoreit"], date: "12 Jun 2017", year: "2017", charCount: 4930, abstract: null });
    expect(READERS.CONTENT_EXTRACTION!["netwire-content-extraction"]!({}, { url: "https://arxiv.org/abs/1706.03762" }).unusable).toBeTruthy();
    // A step that supplied text and no link: the router filled the URL with a placeholder page.
    expect(READERS.CONTENT_EXTRACTION!["netwire-content-extraction"]!({ title: "Example Domain", excerpt: "This domain is for use in documentation examples", char_count: 112 }, { text: "An abstract." }).unusable).toMatch(/placeholder/);
  });

  it("microlink: yields the bibliographic record", () => {
    const parsed = READERS.CONTENT_EXTRACTION!["microlink-url-extraction"]!({ status: "success", data: { title: "Attention Is All You Need", author: "Vaswani, Ashish", description: "We propose the Transformer.", date: "2017-06-12T00:00:00.000Z" } }, { url: "https://arxiv.org/abs/1706.03762" });
    expect(parsed.data).toMatchObject({ title: "Attention Is All You Need", authors: ["Vaswani, Ashish"], abstract: "We propose the Transformer.", year: "2017" });
    expect(READERS.CONTENT_EXTRACTION!["microlink-url-extraction"]!({ status: "fail" }, { url: "https://arxiv.org/abs/1706.03762" }).unusable).toBeTruthy();
    expect(READERS.CONTENT_EXTRACTION!["microlink-url-extraction"]!({ status: "success", data: { title: "Example Domain" } }, { text: "An abstract." }).unusable).toMatch(/placeholder/);
  });

  it("livecert: structured fields become a flat list of facts", () => {
    const p = READERS.CONTENT_EXTRACTION!.livecert!({ verdict: "date_event", extracted: { dates: ["12 June 2017"], events: [], places: ["Google"] }, confidence: 1, reason: "One date and one place were found." }, {});
    expect(p.data).toMatchObject({ facts: ["dates: 12 June 2017", "places: Google"] });
    expect(p.answer).toMatch(/^One date and one place were found\.\ndates: 12 June 2017/);
    expect(READERS.CONTENT_EXTRACTION!.livecert!({}, {}).unusable).toBeTruthy();
  });
});

describe("authorship reader", () => {
  it("caliber reports P(AI) and the certainty for the stated label", () => {
    const r = READERS.AI_TEXT_DETECTION!["caliber-truthport-text-auth"]!;
    const p = r({ confidence: 0.248271, label: "human_written", reason: "low burstiness", model: "caliber-truthport-v2" }, {});
    expect(p.label).toBe("human_written");
    expect(p.confidence).toBeCloseTo(0.7517, 3);
    expect(p.data).toMatchObject({ pAi: 0.2483, model: "caliber-truthport-v2" });
    expect(r({ confidence: 0.9, label: "ai_generated" }, {}).confidence).toBe(0.9);
  });
  it("bittensor's bare probability becomes a verdict with certainty for it", () => {
    const r = READERS.AI_TEXT_DETECTION!["bittensor-sn32-itsai"]!;
    expect(r({ answer: 0, report_id: "x", segmentation_tokens: [], status: "success" }, {})).toMatchObject({ label: "human_written", confidence: 1, data: { pAi: 0 } });
    expect(r({ answer: 0.83, status: "success" }, {})).toMatchObject({ label: "ai_generated", confidence: 0.83 });
    expect(r({ status: "error" }, {}).unusable).toMatch(/no probability/);
  });
  it("livecert says when no passage reached it", () => {
    expect(READERS.AI_TEXT_DETECTION!.livecert!({ verdict: "unknown", reason: "No passage long enough to analyse was supplied." }, {}).unusable).toBeTruthy();
  });
});

describe("translation readers", () => {
  it("livecert returns the translation, langwire flags an unsupported pair", () => {
    const l = READERS.LANGUAGE_TRANSLATION!.livecert!;
    expect(l({ verdict: "translated", confidence: 1, translation: "नमस्ते" }, { language: { name: "Hindi", code: "hi" } })).toMatchObject({ answer: "नमस्ते", data: { translation: "नमस्ते", language: "Hindi" } });
    expect(READERS.LANGUAGE_TRANSLATION!["langwire-translation"]!({ translation: null, supported: false, summary: "not available" }, {}).unusable).toBe("not available");
  });
  it("a fragment of a long source is unusable", () => {
    const source = "Recent developments include NASA’s efforts to refine data from space telescopes using the Artifact InSPECtor tool, the discovery of a galactic gem by the Chandra X-ray Observatory, and remarks by Commissioner Lahbib in Moldova.";
    const l = READERS.LANGUAGE_TRANSLATION!.livecert!;
    expect(l({ verdict: "translated", translation: "Останні розробки включають NASA" }, { text: source, language: { name: "Ukrainian", code: "uk" } }).unusable).toMatch(/only a fragment/);
    expect(l({ verdict: "translated", translation: "Останні розробки включають зусилля NASA щодо уточнення даних з космічних телескопів за допомогою інструменту Artifact InSPECtor, відкриття галактичної перлини обсерваторією Чандра та зауваження комісара Лахбіба в Молдові." }, { text: source, language: { name: "Ukrainian", code: "uk" } }).data).toMatchObject({ language: "Ukrainian" });
    expect(translationTooShort("नमस्ते", "Good morning")).toBe(false);
  });
});

describe("news readers", () => {
  it("livecert headlines become items; an empty list is unusable", () => {
    const r = READERS.NEWS_HEADLINES!.livecert!;
    expect(r({ topic: "technology", headlines: [{ title: "A", source: "BBC", published: "2026-09-06" }], confidence: 1, reason: "..." }, {}).data).toMatchObject({ items: [{ title: "A", source: "BBC" }], category: "technology" });
    expect(r({ headlines: [] }, {}).unusable).toBeTruthy();
  });
  it("verity articles carry source and description", () => {
    const p = READERS.NEWS_SEARCH!["verity-news-search"]!({ articles: [{ title: "T", url: "u", published_at: "d", source: "s", description: "x" }], answer: "ans", confidence: 0.9 }, {});
    expect(p.data).toMatchObject({ articles: [{ title: "T", source: "s", url: "u", description: "x" }], answer: "ans" });
  });
  it("newswire-search and any unknown news miner: the first titled list under a usual key, in either date form", () => {
    const r = READERS.NEWS_SEARCH!["newswire-search"]!;
    const p = r({ articles: [{ title: "T - Src", source: "Src", url: "u", published_at: "Tue, 08 Sep 2026 04:08:44 GMT" }], summary: "One line.", confidence: 0.96 }, {});
    expect(p.data).toMatchObject({ articles: [{ title: "T - Src", source: "Src", url: "u", published: "Tue, 08 Sep 2026 04:08:44 GMT" }], answer: "One line." });
    expect(p.answer).toBe("One line.");
    expect(readerFor("NEWS_HEADLINES", "someone-new")).toBe(genericNews);
    expect(genericNews({ results: [{ headline: "H", source: { name: "N" }, link: "l", date: "2026-09-01" }] }, {}).data).toMatchObject({ articles: [{ title: "H", source: "N", url: "l", published: "2026-09-01" }] });
    expect(genericNews({ summary: "Nothing matched." }, {}).data).toEqual({ articles: [], answer: "Nothing matched." });
    expect(genericNews({ articles: [] }, {}).unusable).toBeTruthy();
  });
  it("livecert's news search answers in prose; the quoted titles become articles", () => {
    const reason = 'Recent coverage of AI regulation in India from the last 7 days includes: "India\'s technology sector calls for fairness in global tax and AI regulations" (Traders Union, 11 September 2026); "Video | India vs AI: The Big Battle" (NDTV Profit, 9 September 2026); "Urgent Call for AI Regulation Amid Extinction Fears" (Devdiscourse). 3 articles, most recent first.';
    const p = READERS.NEWS_SEARCH!.livecert!({ confidence: 0.9, reason, verdict: "articles" }, {});
    expect(p.unusable).toBeUndefined();
    expect(p.data).toMatchObject({
      articles: [
        { title: "India's technology sector calls for fairness in global tax and AI regulations", source: "Traders Union", published: "11 September 2026" },
        { title: "Video | India vs AI: The Big Battle", source: "NDTV Profit", published: "9 September 2026" },
        { title: "Urgent Call for AI Regulation Amid Extinction Fears", source: "Devdiscourse", published: null },
      ],
    });
    expect(p.label).toBe("3 articles");
    expect(READERS.NEWS_SEARCH!.livecert!({ confidence: 0.9, reason: "No coverage of that subject was published in the last 30 days.", verdict: "none" }, {}).unusable).toMatch(/No coverage/);
    expect(articlesFromProse("“Curly quoted title here” (Reuters, 2026-09-01) and 'no' \"short\"")).toEqual([{ title: "Curly quoted title here", source: "Reuters", url: null, published: "2026-09-01", description: null }]);
    // The generic reader reads the same prose under reason, and names an empty answer for what it is.
    expect((genericNews({ reason, verdict: "articles" }, {}).data as { articles: Array<{ title: string }> }).articles[1]?.title).toBe("Video | India vs AI: The Big Battle");
    expect(genericNews({ reason: "A news index that does not respond: the index could not be queried." }, {}).unusable).toBeTruthy();
  });
  it("carried articles read both shapes, drop the feed's leftovers and the duplicates", () => {
    const got = carriedArticles({
      items: [{ title: "Rates rise - The Times", source: "The Times", published: "2026-09-08", description: "Rates rise &nbsp;&nbsp; The Times" }],
      articles: [{ title: "Rates Rise", source: { name: "The Times" } }, { title: "Bank fined &amp; warned", source: "FT", description: "<p>Detail \\here</p>" }, { title: "" }],
    });
    expect(got).toEqual([
      { title: "Rates rise", source: "The Times", url: null, published: "2026-09-08", description: null },
      { title: "Bank fined & warned", source: "FT", url: null, published: null, description: "Detail here" },
    ]);
    expect(cleanNote("  a &#39;b&#39; <b>c</b>\\d  ")).toBe("a 'b' c d");
    expect(cleanNote("")).toBeNull();
  });
  it("groq output is the briefing text", () => {
    expect(READERS.CHAT_COMPLETION!["groq-llama31-instant-miner"]!({ output: "Brief.", confidence: 0.8 }, {}).data).toEqual({ text: "Brief." });
  });
});

describe("safety readers", () => {
  it("URLhaus: nothing means not listed", () => {
    const p = READERS.URL_SCAN!["url-scan-urlhaus"]!("", { url: "https://example.com" });
    expect(p).toMatchObject({ label: "not listed", data: { listed: false } });
    expect(READERS.URL_SCAN!["url-scan-urlhaus"]!({ threat: "malware_download", url_status: "online" }, {}).label).toBe("malware_download");
  });
  it("sentinel: the verdict is read from the prose", () => {
    const r = READERS.FRAUD_DETECTION!["telegraph-sentinel"]!;
    expect(r({ answer: "It is a phishing/scam message. The warning signs are…", label: "ANSWERED", confidence: 0.7 }, {})).toMatchObject({ label: "scam likely", confidence: 0.7 });
    expect(r({ answer: "NOT_APPLICABLE: burn address. Probability 0 (0% risk).", label: "NOT_APPLICABLE" }, {}).label).toBe("not applicable");
    expect(r({ answer: "This looks legitimate; no warning signs.", label: "ANSWERED" }, {}).label).toBe("looks legitimate");
  });
});

describe("lookup and fallbacks", () => {
  it("finds a reader by the routed intent and miner, and none otherwise", () => {
    expect(readerFor("FACT_CHECK", "qarinah-proofpack")).toBe(READERS.FACT_CHECK!["qarinah-proofpack"]);
    expect(readerFor("FACT_CHECK", "someone-new")).toBeNull();
    expect(readerFor(null, "livecert")).toBeNull();
  });
  it("builds step data from plain answer text when no reader exists", () => {
    expect(fallbackData("brief", "Text.", undefined)).toEqual({ text: "Text." });
    expect(fallbackData("translate", "नमस्ते", undefined)).toEqual({ translation: "नमस्ते" });
    expect(fallbackData("search", "found things", undefined)).toEqual({ articles: [], answer: "found things" });
    expect(fallbackData("related", 'Papers: "PVT v2: Improved baselines" and more', undefined)).toMatchObject({ papers: ["PVT v2: Improved baselines"] });
    expect(fallbackData("extract", "### Quantities:\n- 28.4 BLEU (a score)\n- **3.5 days** (training)\n\nText.", undefined)).toMatchObject({ facts: ["28.4 BLEU (a score)", "3.5 days (training)"] });
  });
});

describe("text helpers", () => {
  it("cleans titles, splits authors, finds titles in prose", () => {
    expect(cleanTitle("[1706.03762] Attention Is All You Need | arXiv")).toBe("Attention Is All You Need");
    expect(splitAuthors("A. Smith; B. Jones and C. Lee")).toEqual(["A. Smith", "B. Jones", "C. Lee"]);
    expect(titlesFromProse('1) "PVT v2: Improved baselines" (2022); 2) Point cloud transformer by Meng-Hao Guo')).toEqual(["PVT v2: Improved baselines", "Point cloud transformer"]);
    expect(arxivFromExcerpt("nothing here")).toEqual({ title: null, authors: [], date: null });
  });
});
