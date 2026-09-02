/*
 * rules.js - a deterministic fallback for the mood agent.
 *
 * Used in two places:
 *   1. Local / offline development, when no ANTHROPIC_API_KEY is configured.
 *   2. As the safety net in /api/agent when the Claude API call fails - Jerry
 *      should still react rather than freeze.
 *
 * This is NOT the product. The real mood agent (api/agent.js) hands the
 * situation to an LLM. These rules just encode the "intended behavior shape"
 * from DESIGN.md so there's always a sensible answer.
 */

import { lightBucket, sanitizeLcd } from "./protocol.js";

const POS_MESSAGES = [
  "Love that. Keep it going!",
  "Great to hear. Onward!",
  "Nice. Enjoy the good day.",
];
const NEG_BRIGHT = [
  "Rough one. I'm with you.",
  "Tough day. Go easy on yourself.",
  "Hang in there. This passes.",
];
const NEG_DIM = [
  "Rough days happen. Rest up.",
  "Late and heavy. Time to wind down.",
  "Be kind to yourself. Sleep on it.",
];
const NEUTRAL = ["Noted. I'm here.", "Got it.", "Here whenever you need me."];
const CHECKIN = ["Hey. Good to see you.", "Hi there.", "Checking in with you too."];

const pick = (arr, seed) => arr[Math.abs(hash(seed)) % arr.length];

function hash(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) {
    h = (h << 5) - h + String(str).charCodeAt(i);
    h |= 0;
  }
  return h;
}

/**
 * @param {{text?:string, sentiment?:{bucket?:string}, light?:number, buttonOnly?:boolean}} input
 * @returns {{face:string, servo:string, lcd:string, tone:string, reasoning:string, source:string}}
 */
export function ruleBasedReaction(input = {}) {
  const { text = "", buttonOnly = false } = input;
  const bucket = input.sentiment?.bucket || "neutral";
  const light = lightBucket(input.light ?? 512);
  const seed = text || bucket + light + buttonOnly;

  let r;
  if (buttonOnly) {
    r = { face: light === "dim" ? "sleepy" : "neutral", servo: "perk", lcd: pick(CHECKIN, seed), tone: "none" };
  } else if (bucket === "positive") {
    r = { face: "happy", servo: "perk", lcd: pick(POS_MESSAGES, seed), tone: "chime" };
  } else if (bucket === "negative" && light === "dim") {
    r = { face: "sleepy", servo: "nod", lcd: pick(NEG_DIM, seed), tone: "none" };
  } else if (bucket === "negative") {
    r = { face: "concerned", servo: "nod", lcd: pick(NEG_BRIGHT, seed), tone: "gentle_beep" };
  } else {
    r = { face: "neutral", servo: "still", lcd: pick(NEUTRAL, seed), tone: "none" };
  }

  return {
    ...r,
    lcd: sanitizeLcd(r.lcd),
    reasoning: `rule-based: sentiment=${bucket}, light=${light}, buttonOnly=${buttonOnly}`,
    source: "rules",
  };
}
