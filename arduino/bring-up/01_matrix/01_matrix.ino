/* Bring-up 1/6: MAX7219 8x8 dot-matrix.
 * Wire ONLY the matrix: DIN=12, CLK=11, CS=10, VCC=5V, GND=GND.
 * Expected: a happy face appears, then blinks every 2 s.
 * Library: LedControl (Library Manager). */

#include <LedControl.h>

LedControl matrix(12, 11, 10, 1);
const byte FACE_HAPPY[8] = {0x00,0x66,0x66,0x00,0x81,0x42,0x3C,0x00};

void setup() {
  matrix.shutdown(0, false);
  matrix.setIntensity(0, 2);
  matrix.clearDisplay(0);
}

void loop() {
  for (int r = 0; r < 8; r++) matrix.setRow(0, r, FACE_HAPPY[r]);
  delay(2000);
  matrix.clearDisplay(0);
  delay(500);
}
