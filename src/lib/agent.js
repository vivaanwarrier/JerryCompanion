/*
 * agent.js - client for the mood agent (POST /api/agent).
 *
 * The endpoint reasons with an LLM (via the Claude API, key stays server-side)
 * and returns one coordinated reaction, already normalized to the serial
 * protocol's vocabulary. On any failure it returns a rule-based reaction with
 * source "rules" - the caller can just use it.
 */

import { normalizeReaction } from "./protocol.js";

const TIMEOUT_MS = 20000;

/**
 * @param {{text:string, sentiment:object, light:number, buttonOnly:boolean}} payload
 * @param {string} [endpoint]
 * @returns {Promise<{face,servo,lcd,tone,reasoning,source}>}
 */
export async function decide(payload, endpoint = "/api/agent") {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`mood agent ${res.status}: ${detail.slice(0, 200)}`);
  }

  const raw = await res.json();
  return {
    ...normalizeReaction(raw),
    reasoning: String(raw.reasoning ?? ""),
    source: raw.source === "llm" ? "llm" : "rules",
  };
}
