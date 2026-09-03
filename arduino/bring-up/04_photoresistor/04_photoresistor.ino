/* Bring-up 4/5: photoresistor (LDR).
 * Wire ONLY the divider: 5V - LDR - A0 - 10k resistor - GND.
 * Expected: Serial Monitor (9600) prints a value that drops when you
 *   cover the sensor and rises under light.
 * No library needed. */

void setup() {
  Serial.begin(9600);
}

void loop() {
  Serial.print("LIGHT:");
  Serial.println(analogRead(A0));
  delay(500);
}
