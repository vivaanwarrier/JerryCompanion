/* Bring-up 6/6: push button.
 * Wire ONLY the button: one leg to D7, the diagonal leg to GND.
 *   Uses the internal pull-up, so no external resistor is needed.
 * Expected: Serial Monitor (9600) prints BTN:1 while held, BTN:0 otherwise,
 *   with simple debouncing.
 * No library needed. */

const int BUTTON = 7;
int stableState = HIGH;
int lastReading = HIGH;
unsigned long lastChange = 0;
const unsigned long DEBOUNCE_MS = 25;

void setup() {
  Serial.begin(9600);
  pinMode(BUTTON, INPUT_PULLUP);
}

void loop() {
  int reading = digitalRead(BUTTON);
  if (reading != lastReading) {
    lastChange = millis();
    lastReading = reading;
  }
  if (millis() - lastChange > DEBOUNCE_MS && reading != stableState) {
    stableState = reading;
    Serial.print("BTN:");
    Serial.println(stableState == LOW ? 1 : 0);  // pressed = LOW
  }
}
