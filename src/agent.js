/*
 * agent.js - client for the mood agent. Calls the /api/agent serverless
 * endpoint, which reasons with an LLM (the Claude API key can't live in
 * browser code, so it stays server-side).
 *
 * Input:  { text, sentiment: {label, score, bucket}, light, buttonOnly }
 * Output: { face, servo, lcd, tone, reasoning } - already normalized to the
 *         serial protocol's vocabulary.
 */

const FACES = new Set(["happy", "neutral", "concerned", "sleepy"]);
const SERVOS = new Set(["nod", "perk", "still"]);
const TONES = new Set(["chime", "gentle_beep", "none"]);

export async function decide(payload) {
  const res = await fetch("/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`/api/agent ${res.status}: ${detail}`);
  }

  const raw = await res.json();
  return {
    face: FACES.has(raw.face) ? raw.face : "neutral",
    servo: SERVOS.has(raw.servo) ? raw.servo : "still",
    lcd: String(raw.lcd ?? "").slice(0, 80),
    tone: TONES.has(raw.tone) ? raw.tone : "none",
    reasoning: raw.reasoning ?? "",
  };
}
