/*
 * sentiment.js - pretrained sentiment classifier, client-side via Transformers.js
 * (WebAssembly). No training, no ML server.
 *
 * Model: Xenova/distilbert-base-uncased-finetuned-sst-2-english (SST-2, binary).
 * The binary output is turned into a 3-way bucket: low-confidence predictions
 * (score < NEUTRAL_BAND) are treated as neutral instead of forcing a side.
 *
 * If the model can't be loaded (offline, CDN blocked), classify() falls back to
 * a tiny word-list heuristic and marks the result source as "lexicon" so the UI
 * can say so.
 */

const TRANSFORMERS_CDN = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0";
const MODEL = "Xenova/distilbert-base-uncased-finetuned-sst-2-english";
const NEUTRAL_BAND = 0.6;

let classifierPromise = null;

async function getClassifier() {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      const { pipeline, env } = await import(/* @vite-ignore */ TRANSFORMERS_CDN);
      env.allowLocalModels = false;
      return pipeline("sentiment-analysis", MODEL);
    })();
  }
  return classifierPromise;
}

/** Warm the model so the first real classification isn't slow. Never throws. */
export async function preloadSentimentModel() {
  try {
    await getClassifier();
    return true;
  } catch (e) {
    console.warn("Sentiment model preload failed; will use lexicon fallback.", e);
    return false;
  }
}

const POS = ["good", "great", "happy", "glad", "excited", "love", "awesome", "fine", "better", "calm", "relaxed", "proud", "grateful", "hopeful", "ok", "okay"];
const NEG = ["bad", "sad", "tired", "exhausted", "rough", "stressed", "anxious", "angry", "upset", "down", "lonely", "overwhelmed", "hard", "terrible", "awful", "worried", "sick", "frustrated"];

function lexiconClassify(text) {
  const words = text.toLowerCase().match(/[a-z']+/g) || [];
  let score = 0;
  for (const w of words) {
    if (POS.includes(w)) score += 1;
    if (NEG.includes(w)) score -= 1;
  }
  const bucket = score > 0 ? "positive" : score < 0 ? "negative" : "neutral";
  return {
    label: bucket.toUpperCase(),
    score: Math.min(1, 0.5 + Math.abs(score) * 0.15),
    bucket,
    source: "lexicon",
  };
}

/**
 * @param {string} text
 * @returns {Promise<{label:string, score:number, bucket:"positive"|"negative"|"neutral", source:"model"|"lexicon"}>}
 */
export async function classify(text) {
  const clean = (text || "").trim();
  if (!clean) return { label: "NEUTRAL", score: 0, bucket: "neutral", source: "model" };

  let clf;
  try {
    clf = await getClassifier();
  } catch {
    return lexiconClassify(clean);
  }

  try {
    const [out] = await clf(clean);
    const bucket =
      out.score < NEUTRAL_BAND ? "neutral" : out.label === "POSITIVE" ? "positive" : "negative";
    return { label: out.label, score: out.score, bucket, source: "model" };
  } catch (e) {
    console.warn("Sentiment inference failed; using lexicon fallback.", e);
    return lexiconClassify(clean);
  }
}
