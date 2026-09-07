import { describe, expect, it } from "vitest";
import { finalText, parseCommand, progressText } from "@/lib/telegram";

describe("telegram commands", () => {
  it("maps commands to modes", () => {
    expect(parseCommand("/research https://arxiv.org/abs/1706.03762 in Hindi")).toEqual({ kind: "run", mode: "research", query: "https://arxiv.org/abs/1706.03762 in Hindi" });
    expect(parseCommand("/news@DossierBot AI regulation in India")).toEqual({ kind: "run", mode: "news", query: "AI regulation in India" });
    expect(parseCommand("/safe http://sbi-kyc-update.xyz")).toEqual({ kind: "run", mode: "safety", query: "http://sbi-kyc-update.xyz" });
    expect(parseCommand("/start")).toEqual({ kind: "help" });
    expect(parseCommand("/news")).toEqual({ kind: "help" });
    expect(parseCommand("   ")).toEqual({ kind: "empty" });
  });
  it("guesses the mode for plain text", () => {
    const modeOf = (t: string) => {
      const c = parseCommand(t);
      return c.kind === "run" ? c.mode : c.kind;
    };
    expect(modeOf("https://arxiv.org/abs/1810.04805")).toBe("research");
    expect(modeOf("Is https://github.com safe?")).toBe("safety");
    expect(modeOf("Dear customer your account will be blocked today, verify your KYC now or lose access to your funds immediately")).toBe("safety");
    expect(modeOf("cricket world cup")).toBe("news");
  });
  it("renders progress and the final summary as Telegram HTML", () => {
    const p = progressText("Research dossier", [{ title: "Key facts", status: "ok", label: "date_event" }, { title: "Summary" }], 3);
    expect(p).toContain("✅ 1/3 Key facts — <i>date_event</i>");
    expect(p).toContain("⏳ 2/3 Summary");
    expect(p).toContain("· 3/3 …");
    const f = finalText({ ok: false, error: "No <link>", parsed: null, source: null, sourceError: null, steps: [], dossier: null, url: null });
    expect(f).toBe("Could not run that: No &lt;link&gt;");
  });
});
