/*
 * mock.js - a fake Jerry, so the whole app works with no hardware plugged in.
 *
 * Same interface as SerialTransport. It streams telemetry on a timer from a
 * simulated light level and button, and "executes" commands by echoing them
 * back on the line (main.js mirrors them onto the on-screen Jerry either way).
 */

import { buildCommand, parseCommand, parseTelemetry } from "./protocol.js";

export class MockTransport {
  kind = "mock";

  constructor() {
    this.connected = false;
    this._timer = null;
    this._light = 512; // 0..1023, driven by the UI slider
    this._btn = 0;
    this.onTelemetry = () => {};
    this.onLine = () => {};
    this.onStatus = () => {};
    this.onCommand = () => {}; // extra hook the mock offers: parsed reaction
  }

  static get supported() {
    return true;
  }

  async connect() {
    this.connected = true;
    this.onStatus("connected (mock)");
    this.onLine("READY jerry-mock", "rx");
    this._timer = setInterval(() => this._emit(), 500);
    this._emit();
  }

  _emit() {
    const jitter = Math.round((Math.random() - 0.5) * 8);
    const light = Math.min(1023, Math.max(0, this._light + jitter));
    const line = `LIGHT:${light},BTN:${this._btn}`;
    this.onLine(line, "rx");
    this.onTelemetry(parseTelemetry(line));
  }

  /** UI hook: set the simulated ambient light (0..1023). */
  setLight(value) {
    this._light = Math.min(1023, Math.max(0, Math.round(value)));
  }

  /** UI hook: simulate a physical button press (momentary). */
  pressButton() {
    this._btn = 1;
    this._emit();
    setTimeout(() => {
      this._btn = 0;
      this._emit();
    }, 150);
  }

  async send(reaction) {
    if (!this.connected) throw new Error("Not connected.");
    const line = typeof reaction === "string" ? reaction : buildCommand(reaction);
    this.onLine(line, "tx");
    this.onCommand(parseCommand(line));
    // echo, the way a real Jerry's serial monitor would show nothing back but
    // the on-screen face updates from onCommand
    return line;
  }

  async disconnect() {
    clearInterval(this._timer);
    this._timer = null;
    this.connected = false;
    this.onStatus("disconnected");
  }
}
