/*
 * face.js - the on-screen Jerry.
 *
 * Mirrors whatever command was last sent to the device: draws the 8x8 pixel
 * face (same bitmaps as arduino/jerry.ino), animates the servo gesture, scrolls
 * the LCD line, and plays the tone through WebAudio. Works identically in mock
 * mode and with real hardware, so the screen always shows what Jerry is doing.
 */

// 8 rows, MSB = leftmost pixel - identical to the firmware's FACE_* arrays.
const BITMAPS = {
  happy: [0x00, 0x66, 0x66, 0x00, 0x81, 0x42, 0x3c, 0x00],
  neutral: [0x00, 0x66, 0x66, 0x00, 0x00, 0x7e, 0x00, 0x00],
  concerned: [0x00, 0x66, 0x66, 0x00, 0x00, 0x3c, 0x42, 0x81],
  sleepy: [0x00, 0x7e, 0x00, 0x00, 0x00, 0x3c, 0x00, 0x00],
};

export class JerryStage {
  /**
   * @param {{canvas:HTMLCanvasElement, lcd:HTMLElement, servo:HTMLElement, tone:HTMLElement}} els
   */
  constructor(els) {
    this.canvas = els.canvas;
    this.ctx = this.canvas.getContext("2d");
    this.lcdEl = els.lcd;
    this.servoEl = els.servo;
    this.toneEl = els.tone;

    this.reaction = { face: "neutral", servo: "still", lcd: "", tone: "none" };
    this._audio = null;
    this._lcdTimer = null;
    this._lcdOffset = 0;

    this.drawFace("neutral");
    this.setServo("still");
  }

  apply(reaction) {
    this.reaction = { ...this.reaction, ...reaction };
    this.drawFace(this.reaction.face);
    this.gesture(this.reaction.servo);
    this.scrollLcd(this.reaction.lcd || "");
    this.playTone(this.reaction.tone);
  }

  drawFace(face) {
    const rows = BITMAPS[face] || BITMAPS.neutral;
    const { ctx, canvas } = this;
    const n = 8;
    const cell = canvas.width / n;
    const pad = cell * 0.13;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const on = (rows[r] >> (7 - c)) & 1;
        ctx.fillStyle = on ? "#ff5a3c" : "rgba(255,255,255,0.045)";
        ctx.fillRect(c * cell + pad, r * cell + pad, cell - pad * 2, cell - pad * 2);
      }
    }
  }

  setServo(action, angle) {
    const deg = angle ?? (action === "still" ? 0 : action === "perk" ? -18 : 12);
    this.servoEl.style.setProperty("--angle", `${deg}deg`);
    this.servoEl.dataset.action = action;
  }

  gesture(action) {
    if (action === "still") {
      this.setServo("still");
      return;
    }
    const sweep = action === "nod" ? [12, -12, 12, 0] : [-18, 6, -12, 0];
    let i = 0;
    const step = () => {
      if (i >= sweep.length) return;
      this.setServo(action, sweep[i++]);
      setTimeout(step, 160);
    };
    step();
  }

  scrollLcd(text) {
    clearInterval(this._lcdTimer);
    this._lcdOffset = 0;
    const display = (text || "").trim();
    if (display.length <= 16) {
      this.lcdEl.textContent = display.padEnd(16, " ");
      return;
    }
    const padded = display + "   ";
    this._lcdTimer = setInterval(() => {
      const n = padded.length;
      let out = "";
      for (let k = 0; k < 16; k++) out += padded[(this._lcdOffset + k) % n];
      this.lcdEl.textContent = out;
      this._lcdOffset = (this._lcdOffset + 1) % n;
    }, 300);
  }

  playTone(tone) {
    this.toneEl.dataset.tone = tone;
    if (tone === "none") return;
    this.toneEl.classList.remove("pulse");
    void this.toneEl.offsetWidth; // restart CSS animation
    this.toneEl.classList.add("pulse");

    try {
      this._audio ??= new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this._audio;
      const notes = tone === "chime" ? [880, 1175] : [523];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t0 = ctx.currentTime + i * 0.16;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.24);
      });
    } catch {
      /* WebAudio blocked until a user gesture - the visual pulse still fires */
    }
  }
}
