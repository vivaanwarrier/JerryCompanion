/*
 * sentiment.js - pretrained sentiment classifier running client-side
 * via Transformers.js (WASM). No training, no ML server.
 *
 * Model: Xenova/distilbert-base-uncased-finetuned-sst-2-english
 * Returns: { label: "POSITIVE" | "NEGATIVE", score: 0..1 }
 *
 * The three-way bucket (positive / negative / neutral) is derived from the
 * binary model's confidence: low-confidence predictions are treated as neutral.
 */

const TRANSFORMERS_CDN =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2";
const MODEL = "Xenova/distilbert-base-uncased-finetuned-sst-2-english";
const NEUTRAL_BAND = 0.6; // |score| below this -> neutral

let classifierPromise = null;

async function getClassifier() {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      const { pipeline, env } = await import(
        /* @vite-ignore */ `${TRANSFORMERS_CDN}`
      );
      env.allowLocalModels = false; // load from HF hub
      return pipeline("sentiment-analysis", MODEL);
    })();
  }
  return classifierPromise;
}

/** Warm the model so the first real classification isn't slow. */
export function preloadSentimentModel() {
  return getClassifier().catch((e) => {
    console.warn("Sentiment model preload failed:", e);
  });
}

/**
 * @param {string} text
 * @returns {Promise<{label:string, score:number, bucket:"positive"|"negative"|"neutral"}>}
 */
export async function classify(text) {
  const clean = (text || "").trim();
  if (!clean) return { label: "NEUTRAL", score: 0, bucket: "neutral" };

  const clf = await getClassifier();
  const [out] = await clf(clean);

  let bucket;
  if (out.score < NEUTRAL_BAND) bucket = "neutral";
  else bucket = out.label === "POSITIVE" ? "positive" : "negative";

  return { label: out.label, score: out.score, bucket };
}
