# Wiring notes

Arduino Uno. Pins 0 and 1 are the hardware serial / USB line — nothing else goes there.

This is the build as actually assembled: a **128×64 I²C OLED** is Jerry's face (it
draws real eyes + mouth and scrolls the message), replacing the 8×8 LED matrix
*and* the LCD1602 from the original parts list. Everything else is unchanged.

## Pin map

| Component | Arduino pin(s) | Notes |
|---|---|---|
| SSD1306 128×64 OLED | SDA=**A4**, SCL=**A5** | VCC→5V, GND→GND. Connect by label, not pin order. |
| SG90 servo | signal=**9** | +→5V rail, −→GND rail (common ground) |
| Passive buzzer | signal=**8** | other leg→GND |
| Push button | **7** | diagonal leg→GND, `INPUT_PULLUP` (pressed = LOW) |
| Photoresistor | **A0** | 5V — LDR — A0 — **10 kΩ** — GND voltage divider |

Free for later add-ons: digital 2–6, 10–13, and A1–A3 (e.g. an RGB mood LED,
or the DHT11).

## Power

One wire from the Uno's single `5V` pin to the breadboard's red (+) rail, one
from a `GND` pin to the blue (−) rail; the servo, buzzer, OLED and photoresistor
all tap those rails. On a full-size breadboard the rails are **split in the
middle** — bridge the two halves with a jumper on each rail, or keep everything
on the half the feed wires are on.

## Bring-up order

Wire and verify **one component at a time** using the sketches in
[`../arduino/bring-up/`](../arduino/bring-up/):

1. `01_oled` — a face + "hello" scroll appears
2. `02_servo` — nods and recenters
3. `03_buzzer` — two-note chime plays (use the *passive* buzzer)
4. `04_photoresistor` — value tracks light in the Serial Monitor
5. `05_button` — `BTN:1` / `BTN:0` in the Serial Monitor

Then flash [`../arduino/jerry.ino`](../arduino/jerry.ino) and test the protocol
by hand in the Serial Monitor (9600 baud — line ending doesn't matter):

```
FACE:HAPPY;SERVO:NOD;LCD:Hello there;TONE:CHIME
```

## Gotchas learned the hard way

- **Resistor value matters.** 10 Ω instead of 10 kΩ in the photoresistor divider
  dumps ~0.5 A and cooks the resistor (burning smell). 10 kΩ = brown-black-**orange**.
- **Serial Monitor line ending.** The firmware now accepts any line ending (it
  processes a command after a short pause), so "No Line Ending" works too.
- **RAM.** The OLED needs a light-on-RAM library — this build uses **U8g2 in
  page-buffer mode** (`_1_` in the constructor). The full-buffer Adafruit SSD1306
  library leaves too little RAM on an Uno for the rest of the sketch and it
  crash-loops.
- **Servo current.** If the Uno resets or the display glitches when the servo
  moves, power the servo from an external 5 V supply sharing ground with the Uno.

## Photos

Drop breadboard photos in this folder (`docs/`) as you go — `wiring-oled.jpg`,
`wiring-full.jpg`, etc.
