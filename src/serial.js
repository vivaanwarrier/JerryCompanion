/*
 * serial.js - thin Web Serial API wrapper for talking to Jerry.
 *
 * Jerry -> browser (every ~500 ms):  LIGHT:412,BTN:0
 * browser -> Jerry (per decision):   FACE:SLEEPY;SERVO:NOD;LCD:...;TONE:NONE
 *
 * Chrome / Edge only. Requires a user gesture to call connect().
 */

export class JerrySerial {
  constructor({ baudRate = 9600 } = {}) {
    this.baudRate = baudRate;
    this.port = null;
    this.reader = null;
    this.writer = null;
    this._readLoop = null;
    this._buf = "";
    /** @type {(t: {light:number, btn:number}) => void} */
    this.onTelemetry = () => {};
    /** @type {(line: string) => void} */
    this.onLine = () => {};
    this.onDisconnect = () => {};
  }

  get connected() {
    return !!this.port && !!this.writer;
  }

  async connect() {
    if (!("serial" in navigator)) {
      throw new Error("Web Serial API not available. Use Chrome or Edge.");
    }
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: this.baudRate });

    const textDecoder = new TextDecoderStream();
    this.port.readable.pipeTo(textDecoder.writable).catch(() => {});
    this.reader = textDecoder.readable.getReader();

    const textEncoder = new TextEncoderStream();
    textEncoder.readable.pipeTo(this.port.writable).catch(() => {});
    this.writer = textEncoder.writable.getWriter();

    this._readLoop = this._read();
  }

  async _read() {
    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) break;
        this._buf += value;
        let nl;
        while ((nl = this._buf.indexOf("\n")) !== -1) {
          const line = this._buf.slice(0, nl).trim();
          this._buf = this._buf.slice(nl + 1);
          if (line) this._dispatch(line);
        }
      }
    } catch (err) {
      // reader cancelled or device unplugged
    } finally {
      this.onDisconnect();
    }
  }

  _dispatch(line) {
    this.onLine(line);
    const m = /^LIGHT:(\d+),BTN:([01])/.exec(line);
    if (m) {
      this.onTelemetry({ light: Number(m[1]), btn: Number(m[2]) });
    }
  }

  /** Send one command line. `fields` may be a string or an object. */
  async send(fields) {
    if (!this.writer) throw new Error("Not connected.");
    let line;
    if (typeof fields === "string") {
      line = fields;
    } else {
      line = [
        `FACE:${(fields.face ?? "neutral").toUpperCase()}`,
        `SERVO:${(fields.servo ?? "still").toUpperCase()}`,
        `LCD:${(fields.lcd ?? "").replace(/;/g, ",")}`,
        `TONE:${(fields.tone ?? "none").toUpperCase()}`,
      ].join(";");
    }
    await this.writer.write(line + "\n");
    return line;
  }

  async disconnect() {
    try { await this.reader?.cancel(); } catch {}
    try { await this.writer?.close(); } catch {}
    try { await this.port?.close(); } catch {}
    this.port = this.reader = this.writer = null;
  }
}
