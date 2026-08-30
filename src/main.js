/*
 * main.js - orchestrator + UI wiring.
 *
 * Flow:
 *   1. Connect to Jerry over USB (Web Serial).
 *   2. Continuously receive LIGHT/BTN telemetry.
 *   3. On "talk": Web Speech API transcribes -> sentiment model -> agent -> Jerry.
 *   4. On button press (physical or on-page): agent runs with buttonOnly=true.
 *
 * The agent runs once per meaningful event, never on a timer.
 */

import { JerrySerial } from "./serial.js";
import { classify, preloadSentimentModel } from "./sentiment.js";
import { decide } from "./agent.js";

const $ = (id) => document.getElementById(id);
const jerry = new JerrySerial();

let latestLight = 512;
let lastBtn = 0;
let busy = false;

// ---- telemetry ----
jerry.onTelemetry = ({ light, btn }) => {
  latestLight = light;
  $("light").textContent = light;
  $("btn").textContent = btn ? "pressed" : "released";
  if (btn === 1 && lastBtn === 0) runCheckin();
  lastBtn = btn;
};

jerry.onLine = (line) => {
  const log = $("log");
  log.textContent += line + "\n";
  log.scrollTop = log.scrollHeight;
};

jerry.onDisconnect = () => {
  $("serial-status").textContent = "disconnected";
  $("talk").disabled = true;
  $("checkin").disabled = true;
};

// ---- connect ----
$("connect").addEventListener("click", async () => {
  try {
    await jerry.connect();
    $("serial-status").textContent = "connected";
    $("talk").disabled = false;
    $("checkin").disabled = false;
    preloadSentimentModel();
  } catch (err) {
    $("serial-status").textContent = "error: " + err.message;
  }
});

// ---- speech ----
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;

  let finalText = "";
  recognition.addEventListener("result", (e) => {
    let interim = "";
    finalText = "";
    for (const r of e.results) {
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    $("transcript").textContent = (finalText || interim).trim();
  });
  recognition.addEventListener("end", () => {
    const text = ($("transcript").textContent || "").trim();
    if (text) runFromText(text);
  });
} else {
  $("transcript").textContent =
    "Web Speech API not available in this browser - use the check-in button.";
}

const talkBtn = $("talk");
const startTalk = () => recognition && recognition.start();
const stopTalk = () => recognition && recognition.stop();
talkBtn.addEventListener("mousedown", startTalk);
talkBtn.addEventListener("mouseup", stopTalk);
talkBtn.addEventListener("touchstart", (e) => { e.preventDefault(); startTalk(); });
talkBtn.addEventListener("touchend", (e) => { e.preventDefault(); stopTalk(); });

$("checkin").addEventListener("click", runCheckin);

// ---- pipeline ----
async function runFromText(text) {
  if (busy) return;
  busy = true;
  try {
    const sentiment = await classify(text);
    $("sentiment").textContent = `${sentiment.bucket} (${sentiment.score.toFixed(2)})`;
    await dispatchDecision({ text, sentiment, light: latestLight, buttonOnly: false });
  } catch (err) {
    $("decision").textContent = "Error: " + err.message;
  } finally {
    busy = false;
  }
}

async function runCheckin() {
  if (busy || !jerry.connected) return;
  busy = true;
  try {
    $("sentiment").textContent = "--";
    await dispatchDecision({
      text: "",
      sentiment: { label: "NEUTRAL", score: 0, bucket: "neutral" },
      light: latestLight,
      buttonOnly: true,
    });
  } catch (err) {
    $("decision").textContent = "Error: " + err.message;
  } finally {
    busy = false;
  }
}

async function dispatchDecision(payload) {
  const decision = await decide(payload);
  $("decision").textContent = JSON.stringify(decision, null, 2);
  const sent = await jerry.send({
    face: decision.face,
    servo: decision.servo,
    lcd: decision.lcd,
    tone: decision.tone,
  });
  jerry.onLine("> " + sent);
}
