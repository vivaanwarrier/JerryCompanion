/*
 * main.js - orchestrator + UI wiring.
 *
 * Flow:
 *   1. Pick a transport: real hardware (Web Serial) or the mock (no hardware).
 *   2. Receive LIGHT/BTN telemetry continuously.
 *   3. "Talk": Web Speech API transcribes -> sentiment model -> mood agent -> Jerry.
 *   4. Button (physical or on-screen): mood agent runs with buttonOnly=true.
 *
 * The mood agent runs once per meaningful event, never on a timer.
 */

import { SerialTransport } from "./lib/serial.js";
import { MockTransport } from "./lib/mock.js";
import { classify, preloadSentimentModel } from "./lib/sentiment.js";
import { decide } from "./lib/agent.js";
import { JerryStage } from "./lib/face.js";
import { lightBucket } from "./lib/protocol.js";

const $ = (id) => document.getElementById(id);

const stage = new JerryStage({
  canvas: $("screen"),
  servo: $("servo"),
  tone: $("tone-indicator"),
});

let transport = null;
let latestLight = 512;
let lastBtn = 0;
let busy = false;

// ---------------------------------------------------------------- transport ---
function wireTransport(t) {
  t.onStatus = (s) => setStatus(s);
  t.onLine = (line, dir) => log((dir === "tx" ? "> " : "") + line);
  t.onTelemetry = ({ light, btn }) => {
    latestLight = light;
    $("light-val").textContent = light;
    $("light-bucket").textContent = lightBucket(light);
    $("btn-val").textContent = btn ? "pressed" : "idle";
    if (btn === 1 && lastBtn === 0) runCheckin();
    lastBtn = btn;
  };
}

async function connect() {
  const useMock = $("mode").value === "mock";
  try {
    transport = useMock ? new MockTransport() : new SerialTransport();
    wireTransport(transport);
    await transport.connect();
    $("connect").textContent = "Disconnect";
    $("connect").blur(); // so the spacebar goes to "talk", not back to this button
    $("talk").disabled = false;
    $("checkin").disabled = false;
    $("mock-controls").hidden = !useMock;
    if (!useMock) preloadSentimentModel().then((ok) => setModelBadge(ok));
    else setModelBadge(null);
  } catch (err) {
    setStatus("error: " + err.message);
    transport = null;
  }
}

async function disconnect() {
  stopTalk();
  setListening(false);
  await transport?.disconnect();
  transport = null;
  $("connect").textContent = "Connect";
  $("talk").disabled = true;
  $("checkin").disabled = true;
  $("mock-controls").hidden = true;
}

$("connect").addEventListener("click", () => (transport ? disconnect() : connect()));
$("mode").addEventListener("change", () => {
  if (transport) disconnect();
});

// ------------------------------------------------------------ mock controls ---
$("light-slider").addEventListener("input", (e) => {
  const v = Number(e.target.value);
  $("slider-val").textContent = v;
  transport?.setLight?.(v);
});
$("mock-button").addEventListener("click", () => transport?.pressButton?.());

// -------------------------------------------------------------------- speech ---
// Tap-to-toggle: start listening, show words live, auto-send after a pause or a
// second tap. Hold-to-talk is unreliable with the Web Speech API (it self-ends
// on every pause), so we run it in continuous mode and control it ourselves.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false; // the user wants to be listening
let silenceTimer = null;

if (SR) {
  recognition = new SR();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.addEventListener("result", (e) => {
    let text = "";
    for (const r of e.results) text += r[0].transcript;
    $("transcript").textContent = text.trim();
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => stopTalk(), 2500); // auto-send after quiet
  });

  recognition.addEventListener("end", () => {
    if (listening) {
      try { recognition.start(); } catch {} // Chrome drops the session periodically
      return;
    }
    const text = ($("transcript").textContent || "").trim();
    if (text) runFromText(text);
  });

  recognition.addEventListener("error", (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return; // 'end' handles it
    listening = false;
    setListening(false);
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      $("speech-note").textContent =
        "Microphone blocked. Click the tune/lock icon at the left of Chrome's address bar, set Microphone to Allow, then reload.";
    } else {
      setStatus("speech error: " + e.error);
    }
  });
} else {
  $("speech-note").textContent =
    "Speech input isn't available in this browser — type below, or use “Just check in”.";
}

function setListening(on) {
  $("talk").classList.toggle("listening", on);
  $("talk-label").textContent = on ? "Listening…" : "Talk";
  document.body.classList.toggle("listening", on);
  stage.setListening(on);
}

function startTalk() {
  if (!recognition || listening || busy) return;
  if (!transport) {
    setStatus("connect Jerry first");
    return;
  }
  listening = true;
  $("transcript").textContent = "";
  setListening(true);
  try {
    recognition.start();
  } catch {
    // a previous session is still closing - retry shortly
    setTimeout(() => {
      if (listening) {
        try { recognition.start(); } catch {}
      }
    }, 300);
  }
}

function stopTalk() {
  if (!listening) return;
  listening = false;
  clearTimeout(silenceTimer);
  setListening(false);
  try { recognition.stop(); } catch {}
}

function toggleTalk() {
  listening ? stopTalk() : startTalk();
}

$("talk").addEventListener("click", (e) => { e.preventDefault(); toggleTalk(); });

const isTyping = (el) =>
  el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat || isTyping(e.target)) return;
  e.preventDefault(); // stop page scroll + activating a focused button
  toggleTalk();
});

$("checkin").addEventListener("click", runCheckin);
$("manual-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("manual-text").value.trim();
  if (text) runFromText(text);
  $("manual-text").value = "";
});

// ------------------------------------------------------------------ pipeline ---
async function runFromText(text) {
  if (busy || !transport) return;
  setBusy(true);
  try {
    $("transcript").textContent = text;
    const sentiment = await classify(text);
    $("sentiment-val").textContent = sentiment.bucket;
    $("sentiment-src").textContent = `${sentiment.score.toFixed(2)} · ${sentiment.source}`;
    await dispatch({ text, sentiment, light: latestLight, buttonOnly: false });
  } catch (err) {
    setStatus("error: " + err.message);
  } finally {
    setBusy(false);
  }
}

async function runCheckin() {
  if (busy || !transport) return;
  setBusy(true);
  try {
    $("transcript").textContent = "(button check-in)";
    $("sentiment-val").textContent = "—";
    $("sentiment-src").textContent = "";
    await dispatch({
      text: "",
      sentiment: { label: "NEUTRAL", score: 0, bucket: "neutral" },
      light: latestLight,
      buttonOnly: true,
    });
  } catch (err) {
    setStatus("error: " + err.message);
  } finally {
    setBusy(false);
  }
}

async function dispatch(payload) {
  const reaction = await decide(payload);
  stage.apply(reaction); // on-screen Jerry, immediately
  $("decision").textContent = JSON.stringify(
    { face: reaction.face, servo: reaction.servo, lcd: reaction.lcd, tone: reaction.tone },
    null,
    2,
  );
  $("reasoning").textContent = reaction.reasoning || "";
  $("decision-src").textContent = reaction.source === "llm" ? "LLM" : "rule-based";
  await transport.send(reaction); // down the wire to the real / mock device
}

// --------------------------------------------------------------------- utils ---
function setStatus(s) {
  $("status").textContent = s;
}
function setBusy(b) {
  busy = b;
  $("talk").disabled = b || !transport;
  $("checkin").disabled = b || !transport;
  document.body.classList.toggle("busy", b);
}
function setModelBadge(ok) {
  const el = $("model-badge");
  if (ok === null) el.textContent = "";
  else el.textContent = ok ? "sentiment model ready" : "sentiment: lexicon fallback";
}
function log(line) {
  const el = $("log");
  el.textContent += line + "\n";
  el.scrollTop = el.scrollHeight;
}

// Default to mock so the page is usable immediately.
$("mode").value = "mock";
setStatus("pick a mode and connect");
