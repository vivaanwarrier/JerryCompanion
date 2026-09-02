# Jerry — AI Mood-Reactive Desk Companion

Jerry is a small physical desk companion built on an Arduino Uno. You speak to
it about how you're doing, a pretrained sentiment model reads the emotional tone
of what you said, a mood agent combines that with the room's real ambient light
level, and Jerry reacts — a pixel-art face, a nodding servo, a scrolling LCD
message, and a short tone.

A real, fully-wired hardware build — and it also runs end to end with **no
hardware at all** (mock mode), so the software can be developed and demoed on
its own.

**Live demo:** https://jerry-companion.vercel.app — works in mock mode with
nothing plugged in. _(Demo gif: TODO once the build is assembled.)_

## How it works

1. Open the web page. Pick **Mock** (nothing to plug in) or **USB serial**
   (Jerry on a cable, Chrome/Edge only).
2. Hold **talk** and say a sentence about your day — the browser's Web Speech
   API transcribes it live. (No mic / not Chrome? Type it, or hit **Just check
   in**.)
3. A pretrained DistilBERT SST-2 sentiment model (Transformers.js, in-browser
   WASM) reads the tone.
4. Sentiment + Jerry's live ambient-light reading go to the mood agent
   (`/api/agent`), which reasons with an LLM (via the Claude API) and returns
   one coordinated reaction through a single strict tool call. If no API key is
   configured, or the call fails, it falls back to deterministic rules so Jerry
   always reacts.
5. The browser sends one command string to Jerry (real or mock) and it reacts.
   The on-screen Jerry mirrors the same command either way.

You can also press the physical button on Jerry's board for a check-in with no
talking.

See [`DESIGN.md`](DESIGN.md) for the architecture, serial protocol, and the
mood agent's definition.

## Run locally

```bash
npm install
npm run dev            # http://localhost:3000  (zero-dependency dev server)
```

That's enough to use the whole app in **mock mode**. For the real LLM:

```bash
cp .env.example .env   # then add ANTHROPIC_API_KEY
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Serves `src/` and runs `api/agent.js` locally |
| `npm test` | Unit tests for the protocol + rule engine (Vitest) |
| `npm run check:agent` | Fires hand-crafted situations at a running `/api/agent` and prints its choices |
| `/check` (in the browser) | Runs the sentiment model against sample sentences so you can eyeball the labels |

## Hardware

| Component | Pin(s) |
|---|---|
| MAX7219 8x8 LED matrix (face) | DIN=12, CLK=11, CS=10 |
| SG90 servo (nod) | 9 |
| LCD1602 (4-bit, scrolling text) | RS=13, E=6, D4=5, D5=4, D6=3, D7=2 |
| Buzzer (tone) | 8 |
| Photoresistor (ambient light) | A0 |
| Push button (check-in) | 7 (`INPUT_PULLUP`) |

Arduino libraries: `LedControl`, `Servo` (built in), `LiquidCrystal` (built in).

Wire and verify **one component at a time** with the sketches in
[`arduino/bring-up/`](arduino/bring-up/), then flash
[`arduino/jerry.ino`](arduino/jerry.ino). On boot Jerry prints `READY jerry v1`.
Full wiring notes and the matrix+servo current-draw gotcha:
[`docs/wiring.md`](docs/wiring.md).

### Test the serial protocol by hand

In the Arduino Serial Monitor (9600 baud, newline), type:

```
FACE:HAPPY;SERVO:NOD;LCD:Hello there;TONE:CHIME
```

Jerry should react. Malformed lines are ignored — it keeps running.

## Deploy

**Live:** https://jerry-companion.vercel.app

Hosted on Vercel — static frontend (`src/`) + the serverless function
(`api/agent.js`) together. The Vercel project is linked to this repo, so every
push to `main` auto-deploys.

Set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT`)
in the Vercel project's **Settings → Environment Variables**, then redeploy.
Without it the mood agent runs on the rule-based fallback.

Open the site in **Chrome or Edge on desktop** (Web Serial + Web Speech are
Chromium-desktop only), set **Mode → USB serial**, connect, and pick Jerry's
port. The browser talks to the USB device directly; Vercel only handles the
Claude call.

## Repo layout

```
arduino/
  jerry.ino              firmware: read inputs, execute command lines
  bring-up/              one tiny test sketch per component
src/
  index.html  main.js    UI + orchestrator
  check.html              sentiment-model sanity check
  lib/
    protocol.js           the serial protocol as pure functions (shared w/ api + tests)
    rules.js              deterministic mood-agent fallback
    serial.js  mock.js    Web Serial transport + a hardware-free mock
    sentiment.js          Transformers.js sentiment classifier
    agent.js  face.js     mood-agent client + the on-screen Jerry
api/
  agent.js               the mood agent: stateless endpoint, one strict Claude tool call
scripts/
  dev-server.mjs          local static + /api/agent server
  check-agent.mjs         mood-agent sanity check
test/                     Vitest suites
docs/                     wiring notes + breadboard photos
DESIGN.md                 architecture, protocol, mood-agent definition, decisions
```

## Status

Software complete and exercised in mock mode (sentiment model, agent, protocol,
UI, tests all green). The live Claude path follows the current SDK but hasn't
been run against a real key yet. Hardware not yet assembled — next step is
per-component bring-up.

## License

MIT — see [`LICENSE`](LICENSE).
