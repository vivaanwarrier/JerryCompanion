import { describe, it, expect } from "vitest";
import { ruleBasedReaction } from "../src/lib/rules.js";
import { FACES, SERVOS, TONES } from "../src/lib/protocol.js";

const S = (bucket) => ({ label: bucket.toUpperCase(), score: 0.9, bucket });

describe("ruleBasedReaction - matches the DESIGN.md behavior table", () => {
  it("positive -> happy / perk / chime", () => {
    const r = ruleBasedReaction({ text: "great day", sentiment: S("positive"), light: 500 });
    expect(r).toMatchObject({ face: "happy", servo: "perk", tone: "chime" });
  });

  it("negative + bright/normal -> concerned / nod / gentle_beep", () => {
    const r = ruleBasedReaction({ text: "rough day", sentiment: S("negative"), light: 700 });
    expect(r).toMatchObject({ face: "concerned", servo: "nod", tone: "gentle_beep" });
  });

  it("negative + dim -> sleepy / nod / none", () => {
    const r = ruleBasedReaction({ text: "rough day", sentiment: S("negative"), light: 120 });
    expect(r).toMatchObject({ face: "sleepy", servo: "nod", tone: "none" });
  });

  it("neutral -> neutral / still / none", () => {
    const r = ruleBasedReaction({ text: "meh", sentiment: S("neutral"), light: 500 });
    expect(r).toMatchObject({ face: "neutral", servo: "still", tone: "none" });
  });

  it("button-only check-in -> warm greeting, perk, no tone", () => {
    const r = ruleBasedReaction({ buttonOnly: true, light: 500 });
    expect(r.servo).toBe("perk");
    expect(r.tone).toBe("none");
    expect(r.lcd.length).toBeGreaterThan(0);
  });

  it("always returns protocol-valid values with a non-empty message", () => {
    for (const bucket of ["positive", "negative", "neutral"]) {
      for (const light of [50, 400, 900]) {
        const r = ruleBasedReaction({ text: "x", sentiment: S(bucket), light });
        expect(FACES).toContain(r.face);
        expect(SERVOS).toContain(r.servo);
        expect(TONES).toContain(r.tone);
        expect(r.lcd.length).toBeGreaterThan(0);
        expect(r.lcd.length).toBeLessThanOrEqual(80);
      }
    }
  });
});
