/* Bring-up 3/6: LCD1602 in 4-bit parallel mode.
 * Wire ONLY the LCD: RS=13, E=6, D4=5, D5=4, D6=3, D7=2,
 *   plus VSS=GND, VDD=5V, RW=GND, A=5V (via ~220R), K=GND,
 *   and a 10k pot on V0 for contrast (turn it until text is crisp).
 * Expected: a message scrolls across the top row.
 * Library: LiquidCrystal (built in). */

#include <LiquidCrystal.h>

LiquidCrystal lcd(13, 6, 5, 4, 3, 2);
String msg = "Jerry LCD bring-up ok   ";
int off = 0;

void setup() {
  lcd.begin(16, 2);
}

void loop() {
  lcd.setCursor(0, 0);
  for (int i = 0; i < 16; i++) lcd.print(msg.charAt((off + i) % msg.length()));
  off = (off + 1) % msg.length();
  delay(350);
}
