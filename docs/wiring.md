# Wiring notes

Arduino Uno. Pins 0 and 1 are the hardware serial / USB line — nothing else goes there.

## Pin map

| Component | Arduino pin(s) | Notes |
|---|---|---|
| MAX7219 8x8 matrix | DIN=12, CLK=11, CS=10 | VCC→5V, GND→GND |
| SG90 servo | SIG=9 | VCC→5V or external module, GND→GND (common ground) |
| Buzzer (passive) | SIG=8 | other leg→GND |
| Push button | D7 | diagonal leg→GND, uses `INPUT_PULLUP` (pressed = LOW) |
| LCD1602 (4-bit) | RS=13, E=6, D4=5, D5=4, D6=3, D7=2 | RW→GND, V0→10k pot wiper, A→5V via ~220Ω, K→GND |
| Photoresistor | A0 | 5V — LDR — A0 — 10k — GND voltage divider |

Every digital pin 2–13 is in use.

## Bring-up order

Wire and verify **one component at a time** using the sketches in
[`../arduino/bring-up/`](../arduino/bring-up/):

1. `01_matrix` — face draws
2. `02_servo` — nods and recenters
3. `03_lcd` — text scrolls (adjust contrast pot)
4. `04_buzzer` — chime plays
5. `05_photoresistor` — value tracks light in Serial Monitor
6. `06_button` — `BTN:1`/`BTN:0` in Serial Monitor

Then flash [`../arduino/jerry.ino`](../arduino/jerry.ino) and test the protocol by
hand in the Serial Monitor (9600 baud, newline):

```
FACE:HAPPY;SERVO:NOD;LCD:Hello there;TONE:CHIME
```

## Current-draw gotcha

Matrix at full brightness + servo moving (or stalling) can exceed the Uno's 5V
regulator → random resets / flicker. Fixes:

- Keep `matrix.setIntensity(0, 2)` low (already set in `jerry.ino`).
- Power the servo from the kit's external power module / 9V pack, sharing ground
  with the Uno.

## Photos

Drop breadboard photos in this folder (`docs/`) as you go —
`wiring-matrix.jpg`, `wiring-full.jpg`, etc.
