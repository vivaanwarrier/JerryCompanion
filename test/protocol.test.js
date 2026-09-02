import { describe, it, expect } from "vitest";
import {
  buildCommand,
  parseCommand,
  parseTelemetry,
  normalizeReaction,
  sanitizeLcd,
  lightBucket,
} from "../src/lib/protocol.js";

describe("buildCommand", () => {
  it("builds the four-field command line", () => {
    expect(
      buildCommand({ face: "sleepy", servo: "nod", lcd: "Rest up.", tone: "none" }),
    ).toBe("FACE:SLEEPY;SERVO:NOD;LCD:Rest up.;TONE:NONE");
  });

  it("fills defaults for missing / invalid fields", () => {
    expect(buildCommand({ face: "bogus" })).toBe(
      "FACE:NEUTRAL;SERVO:STILL;LCD:;TONE:NONE",
    );
  });

  it("strips semicolons and newlines from the LCD text", () => {
    const cmd = buildCommand({ lcd: "a; b\nc" });
    expect(cmd).toBe("FACE:NEUTRAL;SERVO:STILL;LCD:a b c;TONE:NONE");
    expect(cmd.split(";")).toHaveLength(4);
  });
});

describe("parseTelemetry", () => {
  it("parses a well-formed line", () => {
    expect(parseTelemetry("LIGHT:412,BTN:0")).toEqual({ light: 412, btn: 0 });
    expect(parseTelemetry("LIGHT:5,BTN:1\r")).toEqual({ light: 5, btn: 1 });
  });

  it("rejects malformed / out-of-range lines", () => {
    for (const bad of ["", "LIGHT:412", "BTN:0", "LIGHT:foo,BTN:0", "LIGHT:9999,BTN:0", "FACE:HAPPY"]) {
      expect(parseTelemetry(bad)).toBeNull();
    }
  });
});

describe("parseCommand", () => {
  it("round-trips with buildCommand", () => {
    const r = { face: "happy", servo: "perk", lcd: "Nice one!", tone: "chime" };
    expect(parseCommand(buildCommand(r))).toEqual(r);
  });

  it("tolerates missing fields and bad values", () => {
    expect(parseCommand("FACE:HAPPY;TONE:WAT")).toEqual({
      face: "happy",
      servo: "still",
      lcd: "",
      tone: "none",
    });
  });
});

describe("sanitizeLcd", () => {
  it("collapses whitespace and caps length", () => {
    expect(sanitizeLcd("  hi   there  ")).toBe("hi there");
    expect(sanitizeLcd("x".repeat(200)).length).toBe(80);
  });
  it("handles nullish", () => {
    expect(sanitizeLcd(undefined)).toBe("");
    expect(sanitizeLcd(null)).toBe("");
  });
});

describe("normalizeReaction", () => {
  it("is case-insensitive on enums", () => {
    expect(normalizeReaction({ face: "HAPPY", servo: "Perk", tone: "CHIME" })).toEqual({
      face: "happy",
      servo: "perk",
      lcd: "",
      tone: "chime",
    });
  });
});

describe("lightBucket", () => {
  it("buckets raw analog readings", () => {
    expect(lightBucket(100)).toBe("dim");
    expect(lightBucket(500)).toBe("normal");
    expect(lightBucket(800)).toBe("bright");
    expect(lightBucket("nonsense")).toBe("normal");
  });
});
