/*
 * /api/agent.js - Jerry's mood agent.
 *
 * A single stateless serverless endpoint. It hands the situation (what you
 * said + the sentiment label + the room's light level) to an LLM via the
 * Claude API and asks for one coordinated reaction, using a single strict
 * tool call so the result is always schema-valid. No database, no persistent
 * state. Runs once per meaningful event.
 *
 * Request  (POST JSON):
 *   { text, sentiment: {label, score, bucket}, light, buttonOnly }
 * Response (JSON):
 *   { face, servo, lcd, tone, reasoning, source }   source: "llm" | "rules"
 *
 * If ANTHROPIC_API_KEY is unset, or the API call fails, it falls back to the
 * deterministic rules in src/lib/rules.js so Jerry always reacts.
 *
 * Env: ANTHROPIC_API_KEY (optional but recommended)
 *      ANTHROPIC_MODEL    (optional, default "claude-opus-5")
 *      ANTHROPIC_EFFORT   (optional, default "low")
 */

import Anthropic from "@anthropic-ai/sdk";
import { FACES, SERVOS, TONES, normalizeReaction, lightBucket } from "../src/lib/protocol.js";
import { ruleBasedReaction } from "../src/lib/rules.js";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
const EFFORT = process.env.ANTHROPIC_EFFORT || "low";

const TOOL = {
  name: "set_reaction",
  description:
    "Set Jerry's single coordinated physical reaction: face, servo gesture, a short LCD line, and a tone.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["face", "servo", "lcd", "tone", "reasoning"],
    properties: {
      face: { type: "string", enum: FACES },
      servo: { type: "string", enum: SERVOS },
      lcd: {
        type: "string",
        description: "Warm, brief, <= 40 characters. Scrolls across a 16x2 LCD.",
      },
      tone: { type: "string", enum: TONES },
      reasoning: {
        type: "string",
        description: "One short sentence on why this reaction fits.",
      },
    },
  },
};

const SYSTEM = `You are the reasoning core of Jerry, a small physical desk companion.

You are given how the user is doing (a sentiment label plus their raw words, if
any) and the room's ambient light level. Call set_reaction exactly once with
Jerry's single coordinated physical response.

Guidance - reason about it, don't apply it mechanically:
- Positive sentiment  -> happy face, perk, upbeat line, chime.
- Negative + bright/normal room -> concerned face, nod, supportive line, gentle_beep.
- Negative + dim room -> sleepy face, nod, gentle wind-down line, tone none.
- Neutral -> neutral face, still, a light acknowledgment, tone none.
- Button-only check-in (no speech) -> a warm, low-key greeting; lean neutral.

Keep the LCD line under 40 characters. Be kind and brief. Never give medical,
crisis, or safety advice - if the user sounds like they're in real distress,
just be warm and gentle and keep it short.`;

function buildUserMessage({ text, sentiment, light, buttonOnly }) {
  return [
    `Event: ${buttonOnly ? "physical button check-in (no speech)" : "user finished speaking"}`,
    `User said: ${text ? JSON.stringify(text) : "(nothing)"}`,
    `Sentiment: ${sentiment?.bucket || "neutral"} ` +
      `(model label ${sentiment?.label ?? "n/a"}, ` +
      `confidence ${typeof sentiment?.score === "number" ? sentiment.score.toFixed(2) : "n/a"})`,
    `Ambient light: raw ${light} -> ${lightBucket(light)}`,
  ].join("\n");
}

async function askClaude(input) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1000,
    output_config: { effort: EFFORT },
    system: SYSTEM,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "set_reaction" },
    messages: [{ role: "user", content: buildUserMessage(input) }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`model refused (${response.stop_details?.category ?? "unknown"})`);
  }

  const call = response.content.find(
    (b) => b.type === "tool_use" && b.name === "set_reaction",
  );
  if (!call) throw new Error("model did not call set_reaction");

  const { reasoning = "" } = call.input;
  return { ...normalizeReaction(call.input), reasoning: String(reasoning), source: "llm" };
}

function validate(body) {
  const text = typeof body.text === "string" ? body.text.slice(0, 2000) : "";
  const buttonOnly = body.buttonOnly === true;
  let light = Number(body.light);
  if (!Number.isFinite(light)) light = 512;
  light = Math.min(1023, Math.max(0, Math.round(light)));

  const s = body.sentiment || {};
  const sentiment = {
    label: typeof s.label === "string" ? s.label.slice(0, 20) : "NEUTRAL",
    score: Number.isFinite(Number(s.score)) ? Number(s.score) : 0,
    bucket: ["positive", "negative", "neutral"].includes(s.bucket) ? s.bucket : "neutral",
  };
  return { text, buttonOnly, light, sentiment };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch {
    return res.status(400).json({ error: "invalid JSON body" });
  }

  const input = validate(body);

  if (!process.env.ANTHROPIC_API_KEY) {
    res.setHeader("x-jerry-source", "rules");
    return res.status(200).json(ruleBasedReaction(input));
  }

  try {
    const reaction = await askClaude(input);
    res.setHeader("x-jerry-source", "llm");
    return res.status(200).json(reaction);
  } catch (err) {
    console.error("mood agent: falling back to rules -", err?.message || err);
    res.setHeader("x-jerry-source", "rules");
    res.setHeader("x-jerry-fallback", "1");
    return res.status(200).json({
      ...ruleBasedReaction(input),
      reasoning: `LLM call failed (${err?.message || "error"}); used rule-based fallback.`,
    });
  }
}
