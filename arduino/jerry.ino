/*
 * jerry.ino - main firmware for Jerry, the AI mood-reactive desk companion.
 *
 * Jerry only ever does two things:
 *   1. Read its two inputs (ambient light, push button) and stream them:
 *        LIGHT:412,BTN:0                         (every ~500 ms)
 *   2. Parse one command line per decision and drive the outputs:
 *        FACE:SLEEPY;SERVO:NOD;LCD:Rest up.;TONE:NONE
 *
 * Malformed / partial lines are ignored - Jerry keeps running. On boot it
 * prints "READY jerry v1" so the host knows it (re)started.
 *
 * Pin map (Arduino Uno; pins 0-1 are the USB serial line - unused here):
 *   MAX7219 dot-matrix   DIN=12  CLK=11  CS=10
 *   SG90 servo           SIG=9
 *   Buzzer               SIG=8
 *   Push button          D7  (INPUT_PULLUP, pressed = LOW)
 *   LCD1602 (4-bit)      RS=13  E=6  D4=5  D5=4  D6=3  D7=2
 *   Photoresistor        A0  (voltage divider with the kit resistor)
 *
 * Libraries: LedControl, Servo, LiquidCrystal
 */

#include <LedControl.h>
#include <Servo.h>
#include <LiquidCrystal.h>

// ---- pins ----
const uint8_t PIN_MATRIX_DIN = 12;
const uint8_t PIN_MATRIX_CLK = 11;
const uint8_t PIN_MATRIX_CS  = 10;
const uint8_t PIN_SERVO      = 9;
const uint8_t PIN_BUZZER     = 8;
const uint8_t PIN_BUTTON     = 7;
const uint8_t PIN_LIGHT      = A0;

// ---- peripherals ----
LedControl matrix(PIN_MATRIX_DIN, PIN_MATRIX_CLK, PIN_MATRIX_CS, 1);
Servo nodServo;
LiquidCrystal lcd(13, 6, 5, 4, 3, 2);  // RS, E, D4, D5, D6, D7

// ---- 8x8 faces (row bitmaps, MSB = left) ----
const byte FACE_HAPPY[8]     = {0x00,0x66,0x66,0x00,0x81,0x42,0x3C,0x00};
const byte FACE_NEUTRAL[8]   = {0x00,0x66,0x66,0x00,0x00,0x7E,0x00,0x00};
const byte FACE_CONCERNED[8] = {0x00,0x66,0x66,0x00,0x00,0x3C,0x42,0x81};
const byte FACE_SLEEPY[8]    = {0x00,0x7E,0x00,0x00,0x00,0x3C,0x00,0x00};

const byte* currentFace = FACE_NEUTRAL;

// ---- LCD scroll state ----
String lcdText = "Hi, I'm Jerry.";
int lcdOffset = 0;
unsigned long lcdLastScroll = 0;
const unsigned long LCD_SCROLL_MS = 320;

// ---- blink state (non-blocking) ----
unsigned long blinkAt = 0;
bool blinking = false;

// ---- telemetry cadence ----
unsigned long lastTelemetry = 0;
const unsigned long TELEMETRY_MS = 500;

// ---- button debounce ----
int btnStable = HIGH;
int btnLastRead = HIGH;
unsigned long btnChangedAt = 0;
const unsigned long BTN_DEBOUNCE_MS = 25;

// ---- serial line buffer ----
String rxLine = "";

const int SERVO_REST = 90;

void setup() {
  Serial.begin(9600);

  matrix.shutdown(0, false);
  matrix.setIntensity(0, 2);   // keep low - see docs/wiring.md current-draw note
  matrix.clearDisplay(0);
  drawFace(FACE_NEUTRAL);

  nodServo.attach(PIN_SERVO);
  nodServo.write(SERVO_REST);

  lcd.begin(16, 2);
  lcd.print("Jerry ready");

  pinMode(PIN_BUTTON, INPUT_PULLUP);
  pinMode(PIN_BUZZER, OUTPUT);

  delay(300);
  lcd.clear();
  Serial.println("READY jerry v1");
  scheduleBlink();
}

void loop() {
  readSerial();
  updateButton();
  scrollLcd();
  updateBlink();

  unsigned long now = millis();
  if (now - lastTelemetry >= TELEMETRY_MS) {
    lastTelemetry = now;
    Serial.print("LIGHT:");
    Serial.print(analogRead(PIN_LIGHT));
    Serial.print(",BTN:");
    Serial.println(btnStable == LOW ? 1 : 0);   // pull-up: pressed = LOW
  }
}

// ---------------------------------------------------------------- inputs ---
void updateButton() {
  int reading = digitalRead(PIN_BUTTON);
  if (reading != btnLastRead) {
    btnChangedAt = millis();
    btnLastRead = reading;
  }
  if (millis() - btnChangedAt > BTN_DEBOUNCE_MS && reading != btnStable) {
    btnStable = reading;
  }
}

// ------------------------------------------------------- host -> outputs ---
void readSerial() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n') {
      handleCommand(rxLine);
      rxLine = "";
    } else if (c != '\r') {
      rxLine += c;
      if (rxLine.length() > 200) rxLine = "";   // runaway guard
    }
  }
}

// FACE:X;SERVO:Y;LCD:some text;TONE:Z  - unknown fields/values are skipped.
void handleCommand(String line) {
  line.trim();
  if (line.length() == 0) return;

  int start = 0;
  while (start < (int)line.length()) {
    int sep = line.indexOf(';', start);
    if (sep == -1) sep = line.length();
    String field = line.substring(start, sep);
    start = sep + 1;

    int colon = field.indexOf(':');
    if (colon == -1) continue;
    String key = field.substring(0, colon);
    String val = field.substring(colon + 1);
    key.trim(); val.trim(); key.toUpperCase();

    if (key == "FACE")       applyFace(val);
    else if (key == "SERVO") applyServo(val);
    else if (key == "LCD")   applyLcd(val);
    else if (key == "TONE")  applyTone(val);
  }
}

void applyFace(String v) {
  v.toUpperCase();
  if (v == "HAPPY")          drawFace(FACE_HAPPY);
  else if (v == "NEUTRAL")   drawFace(FACE_NEUTRAL);
  else if (v == "CONCERNED") drawFace(FACE_CONCERNED);
  else if (v == "SLEEPY")    drawFace(FACE_SLEEPY);
}

void applyServo(String v) {
  v.toUpperCase();
  if (v == "NOD")        gesture(2, 60, 120);
  else if (v == "PERK")  gesture(1, 90, 140);
  else if (v == "STILL") nodServo.write(SERVO_REST);
}

void applyLcd(String v) {
  if (v.length() == 0) return;
  lcdText = v;
  lcdOffset = 0;
  lcdLastScroll = 0;
}

void applyTone(String v) {
  v.toUpperCase();
  if (v == "CHIME") {
    tone(PIN_BUZZER, 880, 120);  delay(140);
    tone(PIN_BUZZER, 1175, 160); delay(180);
    noTone(PIN_BUZZER);
  } else if (v == "GENTLE_BEEP") {
    tone(PIN_BUZZER, 523, 180);  delay(200);
    noTone(PIN_BUZZER);
  }
  // NONE -> silence
}

// --------------------------------------------------------- output helpers ---
void drawFace(const byte face[8]) {
  currentFace = face;
  for (int r = 0; r < 8; r++) matrix.setRow(0, r, face[r]);
}

void gesture(int reps, int lo, int hi) {
  for (int i = 0; i < reps; i++) {
    nodServo.write(lo); delay(180);
    nodServo.write(hi); delay(180);
  }
  nodServo.write(SERVO_REST);
}

void scrollLcd() {
  unsigned long now = millis();
  if (now - lcdLastScroll < LCD_SCROLL_MS) return;
  lcdLastScroll = now;

  String padded = lcdText + "   ";
  int n = padded.length();
  lcd.setCursor(0, 0);
  if (n <= 16) {
    lcd.print(lcdText);
    for (int i = lcdText.length(); i < 16; i++) lcd.print(' ');
    return;
  }
  for (int i = 0; i < 16; i++) lcd.print(padded.charAt((lcdOffset + i) % n));
  lcdOffset = (lcdOffset + 1) % n;
}

void scheduleBlink() {
  blinkAt = millis() + 3000 + random(2500);
}

void updateBlink() {
  unsigned long now = millis();
  if (!blinking && now >= blinkAt) {
    blinking = true;
    blinkAt = now + 120;
    matrix.setRow(0, 1, 0x00);          // close eyes
    matrix.setRow(0, 2, 0x00);
  } else if (blinking && now >= blinkAt) {
    blinking = false;
    matrix.setRow(0, 1, currentFace[1]); // reopen
    matrix.setRow(0, 2, currentFace[2]);
    scheduleBlink();
  }
}
