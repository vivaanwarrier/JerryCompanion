# Jerry — AI Mood-Reactive Desk Companion

Jerry is a small physical desk companion built on an Arduino Uno. You speak to
it about how you're doing, a pretrained sentiment model reads the emotional tone
of what you said, a single Claude agent combines that with the room's real
ambient light level, and Jerry reacts — a pixel-art face, a nodding servo, a
scrolling LCD message, and a short tone.

A real, fully-wired hardware build. Not a simulation.

> _Demo gif: TODO once the build is assembled._

## How it works

1. Open the web page (Chrome/Edge), connected to Jerry over USB.
2. Hold **talk** and say a sentence about your day — the browser's Web Speech
   API transcribes it live.
3. A pretrained DistilBERT SST-2 sentiment model (Transformers.js, in-browser
   WASM) reads the tone.
4. Sentiment + Jerry's live ambient-light reading go to `/api/agent`, which
   calls the Claude API with tool use.
5. The browser sends one command string down the USB serial line and Jerry
   physically reacts.

You can also press the physical button on Jerry's board for a check-in with no
talking.

See [`DESIGN.md`](DESIGN.md) for the architecture, serial protocol, and agent
definition.

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
[`arduino/jerry.ino`](arduino/jerry.ino). Full wiring notes and the
matrix+servo current-draw gotcha: [`docs/wiring.md`](docs/wiring.md).

## Run locally

```bash
npm install
cp .env.example .env      # add your ANTHROPIC_API_KEY
npm run dev               # vercel dev -> http://localhost:3000
```

Open the page in Chrome or Edge (Web Serial + Web Speech are Chromium-only),
click **Connect to Jerry**, and pick the Uno's serial port.

### Test by hand first

- **Serial protocol:** in the Arduino Serial Monitor (9600 baud, newline), type
  `FACE:HAPPY;SERVO:NOD;LCD:Hello;TONE:CHIME` and confirm Jerry reacts.
- **Agent in isolation:**
  ```bash
  curl -s localhost:3000/api/agent -H 'content-type: application/json' \
    -d '{"text":"kind of a rough day","sentiment":{"label":"NEGATIVE","score":0.97,"bucket":"negative"},"light":180,"buttonOnly":false}'
  ```

## Deploy

Hosted on Vercel — static frontend (`src/`) + the serverless function
(`api/agent.js`) together. Set `ANTHROPIC_API_KEY` in the Vercel project
environment.

```bash
vercel deploy
```

## Repo layout

```
arduino/      jerry.ino + per-component bring-up sketches
src/          frontend: Web Serial, sentiment model, agent client, UI
api/          agent.js — serverless endpoint calling the Claude API
docs/         wiring notes + breadboard photos
DESIGN.md     architecture, protocol, agent definition, decisions
```

## Status

Scaffold. Firmware, frontend, and API are written and internally consistent;
none of it has been run against real hardware yet. Next: per-component bring-up.

## License

MIT — see [`LICENSE`](LICENSE).
