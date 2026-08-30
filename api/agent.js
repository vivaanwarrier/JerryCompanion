/*
 * /api/agent.js - single serverless endpoint that proxies one Claude API call.
 * No database, no persistent state. Runs once per meaningful event.
 *
 * Request body:
 *   {
 *     text: string,                       // raw transcription ("" for a button check-in)
 *     sentiment: { label, score, bucket }, // from the client-side model
 *     light: number,                      // raw 0..1023 photoresistor reading
 *     buttonOnly: boolean                 // true = physical button, no speech
 *   }
 *
 * Response body: { face, servo, lcd, tone, reasoning }
 *
 * Env: ANTHROPIC_API_KEY (required), ANTHROPIC_MODEL (optional)
 */

import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

// Raw analogRead thresholds; tune against your own room + divider resistor.
const DIM_BELOW = 300;
const BRIGHT_ABOVE = 650;

const TOOLS = [
  {
    name: "set_face",
    description: "Choose Jerry's pixel-art facial expression.",
    input_schema: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          enum: ["happy", "neutral", "concerned", "sleepy"],
        },
      },
      required: ["expression"],
    },
  },
  {
    name: "move_servo",
    description: "Choose Jerry's small physical gesture.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["nod", "perk", "still"] },
      },
      required: ["action"],
    },
  },
  {
    name: "display_message",
    description:
      "Set the short text that scrolls across Jerry's LCD. Max ~40 characters, warm and brief.",
    input_schema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  },
  {
    name: "play_tone",
    description: "Choose the short sound Jerry plays.",
    input_schema: {
      type: "object",
      properties: {
        sound: { type: "string", enum: ["chime", "gentle_beep", "none"] },
      },
      required: ["sound"],
    },
  },
];

const SYSTEM = `You are the reasoning core of Jerry, a small physical desk companion.
Given how the user is doing (a sentiment label plus their raw words) and the room's
ambient light level, decide Jerry's single coordinated physical reaction.

You MUST call all four tools exactly once, in this order: set_face, move_servo,
display_message, play_tone.

Guidance (reason about it, don't apply it mechanically):
- Positive sentiment -> happy face, perk, upbeat message, chime.
- Negative + bright/normal room -> concerned face, nod, supportive message, gentle_beep.
- Negative + dim room -> sleepy face, nod, gentle wind-down message, no tone.
- Neutral -> neutral face, still, a light acknowledgment, no tone.
- A button-only check-in (no speech) -> a warm, low-key greeting; lean neutral.
Keep the LCD message under 40 characters. Never give medical or crisis advice;
just be kind and brief.`;

function lightBucket(raw) {
  if (raw <= DIM_BELOW) return "dim";
  if (raw >= BRIGHT_ABOVE) return "bright";
  return "normal";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured" });
    return;
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const { text = "", sentiment = {}, light = 512, buttonOnly = false } = body;

  const userMsg = [
    `Event: ${buttonOnly ? "physical button check-in (no speech)" : "user finished speaking"}`,
    `User said: ${text ? JSON.stringify(text) : "(nothing)"}`,
    `Sentiment: ${sentiment.bucket || "neutral"} (model label ${sentiment.label || "n/a"}, confidence ${
      typeof sentiment.score === "number" ? sentiment.score.toFixed(2) : "n/a"
    })`,
    `Ambient light: raw ${light} -> ${lightBucket(light)}`,
  ].join("\n");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let decision = { face: "neutral", servo: "still", lcd: "", tone: "none" };
  let reasoning = "";

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: SYSTEM,
      tools: TOOLS,
      tool_choice: { type: "any" },
      messages: [{ role: "user", content: userMsg }],
    });

    for (const block of response.content) {
      if (block.type === "text") reasoning += block.text;
      if (block.type !== "tool_use") continue;
      if (block.name === "set_face") decision.face = block.input.expression;
      if (block.name === "move_servo") decision.servo = block.input.action;
      if (block.name === "display_message") decision.lcd = block.input.text;
      if (block.name === "play_tone") decision.tone = block.input.sound;
    }
  } catch (err) {
    res.status(502).json({ error: "Claude API call failed", detail: String(err) });
    return;
  }

  if (!decision.lcd) decision.lcd = buttonOnly ? "Hey. Good to see you." : "Got it.";

  res.status(200).json({ ...decision, reasoning: reasoning.trim() });
}
