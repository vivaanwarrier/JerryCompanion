# Jerry — Design

## Architecture

```
[Jerry: photoresistor + button] ──USB serial──> [Browser: Web Serial API]
                                                          │
[You speak] ─> [Web Speech API: voice→text] ─> [Transformers.js sentiment model] ─> label + score
                                                          │
                          [Orchestrator (main.js): sentiment + ambient light + button state]
                                                          │
                                     [/api/agent] ──> [Claude API + tool use]
                                                          │
                                 tool calls: set_face / move_servo / display_message / play_tone
                                                          │
                              <──USB serial── [Browser sends one command string]
[Jerry: matrix face, servo, LCD, buzzer] ── executes the command
```

Jerry's firmware only ever (a) reads its two inputs and (b) executes command
strings. All reasoning is off-board. The agent runs **once per meaningful
event** — a completed transcription or a button press — never on a timer, so
API cost stays near zero.

## Serial protocol

Plain text, one line per message, 9600 baud.

**Jerry → browser** (every ~500 ms):
```
LIGHT:412,BTN:0
```

**Browser → Jerry** (once per agent decision):
```
FACE:SLEEPY;SERVO:NOD;LCD:Rough days happen. Rest up.;TONE:NONE
```

Malformed or partial lines are ignored on both sides — Jerry keeps running,
`serial.js` only acts on lines matching the telemetry pattern.

| Field | Values |
|---|---|
| `FACE` | `HAPPY` `NEUTRAL` `CONCERNED` `SLEEPY` |
| `SERVO` | `NOD` `PERK` `STILL` |
| `LCD` | free text (semicolons stripped client-side) |
| `TONE` | `CHIME` `GENTLE_BEEP` `NONE` |

## The agent

**Role:** interpret how the user is doing (sentiment label + raw text) plus the
room's ambient light, and decide Jerry's single coordinated reaction.

**Trigger:** completed speech transcription, or a button press.

**Tools** (all four called once per decision, in order):

- `set_face(expression)` — `happy` `neutral` `concerned` `sleepy`
- `move_servo(action)` — `nod` `perk` `still`
- `display_message(text)` — short string, scrolls on the LCD
- `play_tone(sound)` — `chime` `gentle_beep` `none`

**Intended behavior shape** (reasoned, not hard-coded):

| Sentiment | Ambient light | Reaction |
|---|---|---|
| Positive | any | happy · perk · upbeat · chime |
| Negative | bright/normal | concerned · nod · supportive · gentle_beep |
| Negative | dim | sleepy · nod · gentle wind-down · none |
| Neutral | any | neutral · still · light acknowledgment · none |
| Button-only check-in | any | warm low-key greeting, lean neutral |

Light bucketing lives in `api/agent.js` (`DIM_BELOW` / `BRIGHT_ABOVE`, raw
`analogRead` units) — tune to your room and divider resistor.

## Design decisions

- **Sentiment on-device, agent in the cloud.** The classifier is small and runs
  fine in WASM; the Claude API key cannot live in browser code, so a single
  stateless serverless function proxies it.
- **Binary model → three buckets.** DistilBERT SST-2 is positive/negative only.
  Low-confidence predictions (`score < 0.6`) are treated as neutral rather than
  forcing a side.
- **Firmware stays dumb.** Keeps hardware debugging separable from software
  debugging and lets the whole protocol be exercised from the Serial Monitor.
- **Event-driven, not polled.** One agent call per user action.
- **Low matrix brightness by default.** Mitigates the regulator current-draw
  issue before it happens (see [`docs/wiring.md`](docs/wiring.md)).

## Hardware bring-up

One test sketch per component in `arduino/bring-up/`, verified in isolation
before integration. Full pin map and the current-draw gotcha are in
[`docs/wiring.md`](docs/wiring.md).

## Stretch goals (not yet built)

- DHT11 temp/humidity on A1 → extra agent context.
- IR receiver on A2 → alternate physical input to the button.
