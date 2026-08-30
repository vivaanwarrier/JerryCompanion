/* Bring-up 2/6: SG90 servo.
 * Wire ONLY the servo: SIG=9, VCC=5V (or external module), GND=GND.
 * Expected: two small "nods" every 2 s, returning to center.
 * If the board resets when it moves, power the servo externally (see DESIGN.md).
 * Library: Servo (built in). */

#include <Servo.h>

Servo s;
const int REST = 90;

void setup() {
  s.attach(9);
  s.write(REST);
}

void loop() {
  for (int i = 0; i < 2; i++) {
    s.write(60);  delay(180);
    s.write(120); delay(180);
  }
  s.write(REST);
  delay(2000);
}
