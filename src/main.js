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
  canvas: $("matrix"),
  lcd: $("lcd"),
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
    $("btn-val").textContent = btn ? "pressed" : "released";
    if (btn === 1 && lastBtn === 0) runCheckin();
    lastBtn = btn;
  };
  if (t.kind === "mock") {
    t.onCommand = (reaction) => stage.apply(reaction);
  }
}

async function connect() {
  const useMock = $("mode").value === "mock";
  try {
    transport = useMock ? new MockTransport() : new SerialTransport();
    wireTransport(transport);
    await transport.connect();
    $("connect").textContent = "Disconnect";
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
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

if (SR) {
  recognition = new SR();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.addEventListener("result", (e) => {
    let text = "";
    for (const r of e.results) text += r[0].transcript;
    $("transcript").textContent = text.trim();
  });
  recognition.addEventListener("end", () => {
    listening = false;
    $("talk").classList.remove("listening");
    const text = ($("transcript").textContent || "").trim();
    if (text) runFromText(text);
  });
  recognition.addEventListener("error", (e) => {
    listening = false;
    $("talk").classList.remove("listening");
    setStatus("speech error: " + e.error);
  });
} else {
  $("speech-note").textContent =
    "Web Speech API not available here - type below or use the check-in button.";
  $("manual-entry").hidden = false;
}

function startTalk() {
  if (!recognition || listening || busy || !transport) return;
  listening = true;
  $("transcript").textContent = "";
  $("talk").classList.add("listening");
  try {
    recognition.start();
  } catch {
    listening = false;
  }
}
function stopTalk() {
  if (recognition && listening) recognition.stop();
}

const talk = $("talk");
talk.addEventListener("pointerdown", startTalk);
talk.addEventListener("pointerup", stopTalk);
talk.addEventListener("pointerleave", stopTalk);
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !e.repeat && e.target === document.body) {
    e.preventDefault();
    startTalk();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") stopTalk();
});

$("checkin").addEventListener("click", runCheckin);
$("manual-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("manual-text").value.trim();
  if (text) runFromText(text);
});

// ------------------------------------------------------------------ pipeline ---
async function runFromText(text) {
  if (busy || !transport) return;
  setBusy(true);
  try {
    $("transcript").textContent = text;
    const sentiment = await classify(text);
    $("sentiment-val").textContent = `${sentiment.bucket} · ${sentiment.score.toFixed(2)}`;
    $("sentiment-src").textContent = sentiment.source;
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
