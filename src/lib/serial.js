/*
 * serial.js - Web Serial transport for Jerry.
 *
 * Shape shared with mock.js (so main.js doesn't care which is in use):
 *   .kind            "serial"
 *   .connected       boolean
 *   .connect()       -> Promise (needs a user gesture)
 *   .disconnect()    -> Promise
 *   .send(reaction)  -> Promise<string>   (object or raw command line)
 *   .onTelemetry     (t: {light, btn}) => void
 *   .onLine          (line: string, dir: "rx"|"tx") => void
 *   .onStatus        (status: string) => void
 *
 * Chrome / Edge only.
 */

import { buildCommand, parseTelemetry } from "./protocol.js";

export class SerialTransport {
  kind = "serial";

  constructor({ baudRate = 9600 } = {}) {
    this.baudRate = baudRate;
    this.port = null;
    this.reader = null;
    this.writer = null;
    this._buf = "";
    this._keepReading = false;
    this.onTelemetry = () => {};
    this.onLine = () => {};
    this.onStatus = () => {};
  }

  static get supported() {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  get connected() {
    return !!this.writer;
  }

  async connect() {
    if (!SerialTransport.supported) {
      throw new Error("Web Serial API not available - use Chrome or Edge on desktop.");
    }
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: this.baudRate });
    this.onStatus("connected");

    const decoder = new TextDecoderStream();
    this._readableClosed = this.port.readable.pipeTo(decoder.writable).catch(() => {});
    this.reader = decoder.readable.getReader();

    const encoder = new TextEncoderStream();
    this._writableClosed = encoder.readable.pipeTo(this.port.writable).catch(() => {});
    this.writer = encoder.writable.getWriter();

    this._keepReading = true;
    this._readLoop();

    navigator.serial.addEventListener("disconnect", this._onUnplug);
  }

  _onUnplug = (e) => {
    if (e.target === this.port) {
      this.onStatus("disconnected (unplugged)");
      this._teardown();
    }
  };

  async _readLoop() {
    try {
      while (this._keepReading) {
        const { value, done } = await this.reader.read();
        if (done) break;
        this._buf += value;
        let nl;
        while ((nl = this._buf.indexOf("\n")) !== -1) {
          const line = this._buf.slice(0, nl).replace(/\r$/, "").trim();
          this._buf = this._buf.slice(nl + 1);
          if (line) this._dispatch(line);
        }
      }
    } catch {
      /* reader cancelled */
    }
  }

  _dispatch(line) {
    this.onLine(line, "rx");
    const t = parseTelemetry(line);
    if (t) this.onTelemetry(t);
  }

  async send(reaction) {
    if (!this.writer) throw new Error("Not connected.");
    const line = typeof reaction === "string" ? reaction : buildCommand(reaction);
    await this.writer.write(line + "\n");
    this.onLine(line, "tx");
    return line;
  }

  async disconnect() {
    this._keepReading = false;
    await this._teardown();
    this.onStatus("disconnected");
  }

  async _teardown() {
    if (typeof navigator !== "undefined" && navigator.serial) {
      navigator.serial.removeEventListener("disconnect", this._onUnplug);
    }
    try { await this.reader?.cancel(); } catch {}
    try { await this._readableClosed; } catch {}
    try { await this.writer?.close(); } catch {}
    try { await this._writableClosed; } catch {}
    try { await this.port?.close(); } catch {}
    this.reader = this.writer = this.port = null;
  }
}
