/* Bring-up 3/5: passive buzzer.
 * Wire ONLY the buzzer: SIG=8, GND=GND.
 * Expected: a two-note "chime" every 2 s.
 * No library needed. */

const int BUZZER = 8;

void setup() {
  pinMode(BUZZER, OUTPUT);
}

void loop() {
  tone(BUZZER, 880, 120);  delay(140);
  tone(BUZZER, 1175, 160); delay(180);
  noTone(BUZZER);
  delay(2000);
}
