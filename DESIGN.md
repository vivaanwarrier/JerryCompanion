# Jerry — Design

## Architecture

```
[Jerry: photoresistor + button] ──USB serial──> [Browser: transport (serial | mock)]
                                                          │
[You speak] ─> [Web Speech API: voice→text] ─> [Transformers.js sentiment model] ─> label + score
                                                          │
                          [Orchestrator (main.js): sentiment + ambient light + button state]
                                                          │
                     [Mood agent (/api/agent)] ──> [LLM: Claude API, one strict tool call]
                                                          │         (else: deterministic rules)
                                            set_reaction: { face, servo, lcd, tone, reasoning }
                                                          │
                              <──USB serial── [Browser sends one command string]
[Jerry: OLED face + message, servo, buzzer] ── executes the command   (on-screen Jerry mirrors it)
```

Jerry's firmware only ever (a) reads its two inputs and (b) executes command
strings. All reasoning is off-board. The mood agent runs **once per meaningful
event** — a completed transcription or a button press — never on a timer, so
API cost stays near zero.

## Serial protocol

Plain text, one line per message, 9600 baud.

**Jerry → browser** (every ~500 ms):
```
LIGHT:412,BTN:0
```

**Browser → Jerry** (once per mood-agent decision):
```
FACE:SLEEPY;SERVO:NOD;LCD:Rough days happen. Rest up.;TONE:NONE
```

Malformed or partial lines are ignored on both sides — Jerry keeps running, and
`parseTelemetry` / `parseCommand` in [`src/lib/protocol.js`](src/lib/protocol.js)
only act on lines that match. That module is the single source of truth for the
protocol and is shared by the frontend, the mock, the endpoint, and the tests.

| Field | Values |
|---|---|
| `FACE` | `HAPPY` `NEUTRAL` `CONCERNED` `SLEEPY` |
| `SERVO` | `NOD` `PERK` `STILL` |
| `LCD` | free text — the message shown under the face (delimiters + newlines stripped, capped ~80 chars). Field kept named `LCD` for protocol compatibility even though it's an OLED now. |
| `TONE` | `CHIME` `GENTLE_BEEP` `NONE` |

## The mood agent

The mood agent is Jerry's own reasoning component (`api/agent.js`) — a small
agent that hands the situation to an LLM (via the Claude API) and gets back one
coordinated reaction. It is not a service run by anyone else; it's part of this
project and you own it.

**Role:** interpret how the user is doing (sentiment label + raw text) plus the
room's ambient light, and decide Jerry's single coordinated reaction.

**Trigger:** completed speech transcription, or a button press.

**Mechanism:** one `client.messages.create` call on `claude-opus-5` (override
with `ANTHROPIC_MODEL`) at `effort: low`, with a single **strict** tool,
`set_reaction`, forced via `tool_choice`. Strict mode + an enum schema means the
result is always protocol-valid — `{ face, servo, lcd, tone, reasoning }` — with
no multi-tool orchestration to get wrong.

Why one tool instead of four (`set_face` / `move_servo` / …): a desk toy must
*always* end up with a complete, valid command. Four independent tool calls can
arrive partial, out of order, or need a follow-up turn. One strict call can't.

**Fallback:** if `ANTHROPIC_API_KEY` is unset, or the API call fails or refuses,
the endpoint returns a deterministic reaction from
[`src/lib/rules.js`](src/lib/rules.js) (response header `x-jerry-source: rules`).
Jerry never freezes.

**Intended behavior shape** (the LLM reasons about this; the rules encode it):

| Sentiment | Ambient light | Reaction |
|---|---|---|
| Positive | any | happy · perk · upbeat · chime |
| Negative | bright/normal | concerned · nod · supportive · gentle_beep |
| Negative | dim | sleepy · nod · gentle wind-down · none |
| Neutral | any | neutral · still · light acknowledgment · none |
| Button-only check-in | any | warm low-key greeting, lean neutral |

Light bucketing lives in `src/lib/protocol.js` (`LIGHT_THRESHOLDS`, raw
`analogRead` units) — tune `dim` / `bright` to your room and divider resistor.

## The face

The build uses a **128×64 I²C OLED** as Jerry's face — it draws real eyes, a
mouth curve per mood (`happy` / `neutral` / `concerned` / `sleepy`), an idle
blink, and scrolls the message underneath. This replaces both the 8×8 LED matrix
*and* the LCD1602 from the original parts list — one display does both jobs, with
far less wiring, and it dodges the matrix's current-draw problems.

Firmware ([`arduino/jerry.ino`](arduino/jerry.ino)) drives it with **U8g2 in
page-buffer mode**: the screen buffer is ~128 bytes instead of the full 1 KB, so
the rest of the sketch (Servo, Serial, the command parser's strings) fits in the
Uno's 2 KB of RAM. The full-buffer library crash-loops on boot.

## Hardware-free simulation

The transport is abstracted ([`src/lib/serial.js`](src/lib/serial.js) vs
[`src/lib/mock.js`](src/lib/mock.js), same interface). **Mock mode** streams
telemetry from a light slider + a button, and "executes" commands by driving the
on-screen Jerry ([`src/lib/face.js`](src/lib/face.js)) — a simulated 128×64 OLED
drawn with the same shapes and layout as the firmware, plus an animated servo
indicator and a WebAudio tone. The whole pipeline (speech → sentiment → agent →
reaction) runs with nothing plugged in, so the software is fully testable and
demoable on its own. The on-screen Jerry also mirrors real hardware in USB mode.

## Design decisions

- **Sentiment on-device, mood agent in the cloud.** The classifier is small and
  runs fine in WASM; the Claude API key the mood agent needs cannot live in
  browser code, so a single stateless serverless function proxies it.
- **Binary model → three buckets.** DistilBERT SST-2 is positive/negative only.
  Low-confidence predictions (`score < 0.6`) are treated as neutral rather than
  forcing a side.
- **Firmware stays dumb.** Keeps hardware debugging separable from software
  debugging and lets the whole protocol be exercised from the Serial Monitor.
- **Event-driven, not polled.** One mood-agent call per user action.
- **One strict tool call, not four.** Guarantees a complete valid command every
  time (see the mood-agent section).
- **Always-answers fallback.** No key / API down → rule-based reaction, so a demo
  never dead-ends.
- **One OLED instead of matrix + LCD.** Fewer wires, no matrix current-draw
  gremlins, more expressive face, and it frees ~8 pins. Page-buffer mode keeps it
  inside the Uno's RAM budget (see the face section and [`docs/wiring.md`](docs/wiring.md)).

## Testing

| Layer | How |
|---|---|
| Protocol + rule engine | `npm test` — Vitest, pure functions, no I/O |
| Sentiment model | `/check` page — model vs. a dozen labeled sample sentences |
| Mood agent | `npm run check:agent` — hand-crafted situations → printed decisions |
| Serial protocol | Arduino Serial Monitor, raw command strings, before the browser is involved |
| Full loop | mock mode in the browser (now), then real hardware after bring-up |

## Hardware bring-up

One test sketch per component in `arduino/bring-up/`, verified in isolation
before integration. Full pin map and the current-draw gotcha are in
[`docs/wiring.md`](docs/wiring.md).

## Stretch goals (not yet built)

- RGB LED on 3 free digital pins → a physical mood-colour glow.
- DHT11 temp/humidity on A1 → extra context for the mood agent.
- IR receiver on A2 → alternate physical input to the button.
