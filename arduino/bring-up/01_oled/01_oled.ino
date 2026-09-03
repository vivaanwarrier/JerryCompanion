/* Bring-up 1/5: SSD1306 128x64 I2C OLED (Jerry's face).
 * Wire ONLY the OLED, by label:
 *   GND -> GND,  VCC -> 5V,  SCL -> A5,  SDA -> A4
 * Library: U8g2 (Library Manager -> "U8g2" by oliver).
 * Expected: a face with two eyes and a smile, and "hello" scrolling under it.
 * If the screen stays black, swap the SDA/SCL wires and retry. */

#include <U8g2lib.h>
#include <Wire.h>

U8G2_SSD1306_128X64_NONAME_1_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);

int x = 128;

void setup() {
  u8g2.begin();
}

void loop() {
  u8g2.firstPage();
  do {
    u8g2.drawDisc(44, 24, 5);
    u8g2.drawDisc(84, 24, 5);
    for (int i = -16; i <= 16; i++)             // a smile
      u8g2.drawPixel(64 + i, 40 + (7 * (256 - i * i)) / 256);
    u8g2.setFont(u8g2_font_6x10_tf);
    u8g2.drawStr(x, 60, "hello");
  } while (u8g2.nextPage());

  x -= 2;
  if (x < -40) x = 128;
  delay(40);
}
