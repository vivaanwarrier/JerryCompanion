/*
 * jerry.ino - main firmware for Jerry, the AI mood-reactive desk companion.
 *
 * Jerry only ever does two things:
 *   1. Read its two inputs (ambient light, push button) and stream them:
 *        LIGHT:412,BTN:0                          (every ~500 ms)
 *   2. Parse one command line per decision and drive the outputs:
 *        FACE:SLEEPY;SERVO:NOD;LCD:Rest up.;TONE:NONE
 *
 * Malformed / partial lines are ignored - Jerry keeps running. Commands are
 * accepted with any line ending (or none - they're processed on a short pause).
 * On boot it prints "READY jerry v3".
 *
 * Hardware (Arduino Uno):
 *   SSD1306 128x64 I2C OLED   SDA=A4  SCL=A5   VCC=5V  GND=GND   (Jerry's face + message)
 *   SG90 servo               signal=9                            (nod / perk)
 *   Passive buzzer           signal=8                            (tone)
 *   Push button              pin 7 (INPUT_PULLUP, pressed = LOW)  (check-in)
 *   Photoresistor            A0 (voltage divider with a 10k resistor)
 *
 * Libraries: U8g2 (page-buffer mode - light on RAM), Servo.
 *
 * The serial protocol, the website, and the mood agent are all unchanged from
 * the original design; only the "face" is rendered differently (an OLED drawing
 * instead of an 8x8 LED matrix).
 */

#include <U8g2lib.h>
#include <Wire.h>
#include <Servo.h>

void readSerial();
void updateButton();
void handle(String line);
void setFace(String v);
void doServo(String v);
void doTone(String v);
void scheduleBlink();
void mouth(int cx, int cy, int w, int curve);
void render();
void drawScene();

U8G2_SSD1306_128X64_NONAME_1_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);
Servo nodServo;

const uint8_t PIN_SERVO  = 9;
const uint8_t PIN_BUZZER = 8;
const uint8_t PIN_BUTTON = 7;
const uint8_t PIN_LIGHT  = A0;
const int     SERVO_REST = 90;

enum Face { F_HAPPY, F_NEUTRAL, F_CONCERNED, F_SLEEPY };
Face face = F_NEUTRAL;
String message = "Hi, I'm Jerry.";
int  scrollX = 0;
bool dirty = true;

unsigned long lastScroll = 0, lastTele = 0, blinkAt = 0, lastRxAt = 0;
bool blinking = false;
const unsigned long SCROLL_MS = 90, TELE_MS = 500;

int btnStable = HIGH, btnLast = HIGH;
unsigned long btnChanged = 0;
String rx = "";

void setup() {
  Serial.begin(9600);
  delay(400);
  Serial.println(F("READY jerry v3"));

  nodServo.attach(PIN_SERVO);
  nodServo.write(SERVO_REST);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_BUTTON, INPUT_PULLUP);

  u8g2.begin();
  scheduleBlink();
}

void loop() {
  readSerial();
  updateButton();

  unsigned long now = millis();
  int tw = message.length() * 6;
  bool scrolling = tw > 122;

  if (scrolling && now - lastScroll >= SCROLL_MS) {
    lastScroll = now;
    int span = tw + 20;
    scrollX -= 3;
    if (scrollX <= -span) scrollX += span;
    dirty = true;
  }

  if (!blinking && now >= blinkAt)     { blinking = true;  blinkAt = now + 120; dirty = true; }
  else if (blinking && now >= blinkAt) { blinking = false; scheduleBlink();     dirty = true; }

  if (dirty) { render(); dirty = false; }

  if (now - lastTele >= TELE_MS) {
    lastTele = now;
    Serial.print(F("LIGHT:"));
    Serial.print(analogRead(PIN_LIGHT));
    Serial.print(F(",BTN:"));
    Serial.println(btnStable == LOW ? 1 : 0);
  }
}

// ---------------------------------------------------------------- inputs ---
void updateButton() {
  int r = digitalRead(PIN_BUTTON);
  if (r != btnLast) { btnChanged = millis(); btnLast = r; }
  if (millis() - btnChanged > 25 && r != btnStable) btnStable = r;
}

// ----------------------------------------------------- host -> outputs ---
void readSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    lastRxAt = millis();
    if (c == '\n' || c == '\r') {
      if (rx.length()) { handle(rx); rx = ""; }
    } else {
      rx += c;
      if (rx.length() > 120) rx = "";
    }
  }
  if (rx.length() && millis() - lastRxAt > 120) { handle(rx); rx = ""; }  // no line ending -> process on pause
}

// FACE:X;SERVO:Y;LCD:some text;TONE:Z  - unknown fields / values are skipped.
void handle(String line) {
  line.trim();
  if (!line.length()) return;

  int start = 0;
  while (start < (int)line.length()) {
    int sep = line.indexOf(';', start);
    if (sep == -1) sep = line.length();
    String f = line.substring(start, sep);
    start = sep + 1;

    int c = f.indexOf(':');
    if (c == -1) continue;
    String k = f.substring(0, c); k.trim(); k.toUpperCase();
    String v = f.substring(c + 1); v.trim();

    if (k == "FACE")       setFace(v);
    else if (k == "SERVO") doServo(v);
    else if (k == "LCD")   { if (v.length()) { message = v.substring(0, 90); scrollX = 0; } }
    else if (k == "TONE")  doTone(v);
  }
  dirty = true;
}

void setFace(String v) {
  v.toUpperCase();
  if (v == "HAPPY")          face = F_HAPPY;
  else if (v == "NEUTRAL")   face = F_NEUTRAL;
  else if (v == "CONCERNED") face = F_CONCERNED;
  else if (v == "SLEEPY")    face = F_SLEEPY;
}

void doServo(String v) {
  v.toUpperCase();
  if (v == "NOD") {
    for (int i = 0; i < 2; i++) { nodServo.write(66); delay(150); nodServo.write(114); delay(150); }
  } else if (v == "PERK") {
    nodServo.write(130); delay(170); nodServo.write(70); delay(120);
  }
  nodServo.write(SERVO_REST);
}

void doTone(String v) {
  v.toUpperCase();
  if (v == "CHIME") {
    tone(PIN_BUZZER, 880, 120);  delay(150);
    tone(PIN_BUZZER, 1320, 180); delay(210);
    noTone(PIN_BUZZER);
  } else if (v == "GENTLE_BEEP") {
    tone(PIN_BUZZER, 523, 200); delay(230);
    noTone(PIN_BUZZER);
  }
}

// --------------------------------------------------------- output: the face ---
void scheduleBlink() { blinkAt = millis() + 2600 + random(2800); }

void mouth(int cx, int cy, int w, int curve) {
  int px = cx - w, py = cy;
  for (int x = -w + 1; x <= w; x++) {
    int y = cy + curve * (w * w - x * x) / (w * w);
    u8g2.drawLine(px, py, cx + x, y);
    px = cx + x; py = y;
  }
}

void render() {
  u8g2.firstPage();
  do { drawScene(); } while (u8g2.nextPage());
}

void drawScene() {
  int lx = 44, rx2 = 84, ey = 22;

  if (blinking) {
    u8g2.drawHLine(lx - 6, ey, 12);
    u8g2.drawHLine(rx2 - 6, ey, 12);
  } else if (face == F_SLEEPY) {
    mouth(lx, ey, 7, -3);
    mouth(rx2, ey, 7, -3);
  } else {
    u8g2.drawDisc(lx, ey, 5);
    u8g2.drawDisc(rx2, ey, 5);
  }

  if (face == F_CONCERNED) {
    u8g2.drawLine(lx - 8, ey - 8, lx + 5, ey - 12);
    u8g2.drawLine(rx2 + 8, ey - 8, rx2 - 5, ey - 12);
  }

  int curve = 0;
  if (face == F_HAPPY)          curve = 7;
  else if (face == F_CONCERNED) curve = -6;
  else if (face == F_SLEEPY)    curve = 2;
  mouth(64, 38, 16, curve);

  u8g2.setFont(u8g2_font_6x10_tf);
  if (face == F_SLEEPY) {
    u8g2.drawStr(98, 14, "z");
    u8g2.drawStr(106, 8, "z");
  }

  int tw = message.length() * 6;
  if (tw <= 122) {
    u8g2.drawStr((128 - tw) / 2, 62, message.c_str());
  } else {
    int span = tw + 20;
    u8g2.drawStr(scrollX, 62, message.c_str());
    u8g2.drawStr(scrollX + span, 62, message.c_str());
  }
}
