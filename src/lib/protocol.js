/*
 * protocol.js - the Jerry <-> browser serial protocol, as pure functions.
 *
 * Shared by the frontend, the mock transport, the /api/agent endpoint, and the
 * test suite. No DOM, no Node APIs - safe to import anywhere.
 *
 *   Jerry  -> browser :  LIGHT:412,BTN:0
 *   browser -> Jerry  :  FACE:SLEEPY;SERVO:NOD;LCD:Rough days happen.;TONE:NONE
 */

export const FACES = ["happy", "neutral", "concerned", "sleepy"];
export const SERVOS = ["nod", "perk", "still"];
export const TONES = ["chime", "gentle_beep", "none"];

export const DEFAULT_REACTION = Object.freeze({
  face: "neutral",
  servo: "still",
  lcd: "",
  tone: "none",
});

/** Longest message the LCD scroller handles comfortably. */
export const LCD_MAX = 80;

/**
 * Clean a string so it survives the serial protocol and the LCD:
 * strip the field/line delimiters, collapse whitespace, cap the length.
 */
export function sanitizeLcd(text, max = LCD_MAX) {
  return String(text ?? "")
    .replace(/[;\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const inSet = (value, set, fallback) =>
  set.includes(String(value).toLowerCase()) ? String(value).toLowerCase() : fallback;

/** Coerce an arbitrary object into a valid reaction (never throws). */
export function normalizeReaction(raw = {}) {
  return {
    face: inSet(raw.face, FACES, DEFAULT_REACTION.face),
    servo: inSet(raw.servo, SERVOS, DEFAULT_REACTION.servo),
    lcd: sanitizeLcd(raw.lcd),
    tone: inSet(raw.tone, TONES, DEFAULT_REACTION.tone),
  };
}

/** Build the single command line sent down to Jerry (no trailing newline). */
export function buildCommand(reaction) {
  const r = normalizeReaction(reaction);
  return [
    `FACE:${r.face.toUpperCase()}`,
    `SERVO:${r.servo.toUpperCase()}`,
    `LCD:${r.lcd}`,
    `TONE:${r.tone.toUpperCase()}`,
  ].join(";");
}

/**
 * Parse a telemetry line from Jerry.
 * Returns { light, btn } or null if the line isn't telemetry / is malformed.
 */
export function parseTelemetry(line) {
  const m = /^LIGHT:(\d{1,4}),BTN:([01])\s*$/.exec(String(line).trim());
  if (!m) return null;
  const light = Number(m[1]);
  if (light > 1023) return null;
  return { light, btn: Number(m[2]) };
}

/** Parse a command line back into a reaction (used by the mock + tests). */
export function parseCommand(line) {
  const fields = String(line).trim().split(";");
  const out = {};
  for (const field of fields) {
    const idx = field.indexOf(":");
    if (idx === -1) continue;
    const key = field.slice(0, idx).trim().toUpperCase();
    const val = field.slice(idx + 1).trim();
    if (key === "FACE") out.face = val.toLowerCase();
    else if (key === "SERVO") out.servo = val.toLowerCase();
    else if (key === "LCD") out.lcd = val;
    else if (key === "TONE") out.tone = val.toLowerCase();
  }
  return normalizeReaction(out);
}

/** Raw analogRead buckets. Tune the thresholds to your room + divider resistor. */
export const LIGHT_THRESHOLDS = { dim: 300, bright: 650 };

export function lightBucket(raw, t = LIGHT_THRESHOLDS) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return "normal";
  if (n <= t.dim) return "dim";
  if (n >= t.bright) return "bright";
  return "normal";
}
