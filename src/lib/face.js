/*
 * face.js - the on-screen Jerry.
 *
 * A simulated 128x64 OLED that mirrors whatever command was last sent to the
 * device, drawn with the same face shapes as arduino/jerry.ino (eyes, mouth
 * curve, blink, "z z", scrolling message). Also drives the servo indicator and
 * plays the tone through WebAudio. Works the same in mock mode and with real
 * hardware, so the screen always shows what Jerry is doing.
 */

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const OLED_W = 128;
const OLED_H = 64;
const SCALE = 3;
const INK = "#b7ecff";

export class JerryStage {
  /**
   * @param {{canvas:HTMLCanvasElement, servo:HTMLElement, tone:HTMLElement}} els
   */
  constructor(els) {
    this.canvas = els.canvas;
    this.canvas.width = OLED_W * SCALE;
    this.canvas.height = OLED_H * SCALE;
    this.ctx = this.canvas.getContext("2d");
    this.ctx.scale(SCALE, SCALE);
    this.ctx.lineCap = "round";
    this.ctx.textBaseline = "alphabetic";

    this.servoEl = els.servo;
    this.toneEl = els.tone;

    this.face = "neutral";
    this.message = "Hi, I'm Jerry.";
    this.listening = false;

    this._scrollX = 0;
    this._blink = false;
    this._blinkEnd = 0;
    this._nextBlink = performance.now() + 2600;
    this._audio = null;

    this.setServo("still");
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  /** Apply an agent reaction: {face, servo, lcd, tone}. */
  apply(reaction) {
    if (reaction.face) this.face = reaction.face;
    if (typeof reaction.lcd === "string") {
      this.message = reaction.lcd.trim() || " ";
      this._scrollX = 0;
    }
    this.gesture(reaction.servo || "still");
    this.playTone(reaction.tone || "none");
  }

  setListening(on) {
    this.listening = !!on;
  }

  // ---------------------------------------------------------- animation loop ---
  _loop(now) {
    if (!this._blink && now >= this._nextBlink) {
      this._blink = true;
      this._blinkEnd = now + 130;
    } else if (this._blink && now >= this._blinkEnd) {
      this._blink = false;
      this._nextBlink = now + 2600 + Math.random() * 3200;
    }

    const c = this.ctx;
    c.font = `600 10px ${MONO}`;
    const tw = c.measureText(this.message).width;
    if (tw > OLED_W - 6) {
      this._scrollX -= 0.7;
      const span = tw + 20;
      if (this._scrollX <= -span) this._scrollX += span;
    }

    this._draw(tw);
    requestAnimationFrame(this._loop);
  }

  _draw(tw) {
    const c = this.ctx;
    c.fillStyle = "#05070a";
    c.fillRect(0, 0, OLED_W, OLED_H);
    c.fillStyle = INK;
    c.strokeStyle = INK;
    c.lineWidth = 2;

    const ex1 = 44;
    const ex2 = 84;
    const ey = 25;
    const eyeR = this.listening ? 7 : 5.5;

    if (this._blink) {
      this._seg(ex1 - 6, ey, ex1 + 6, ey);
      this._seg(ex2 - 6, ey, ex2 + 6, ey);
    } else if (this.face === "sleepy") {
      this._curve(ex1, ey, 7, -3);
      this._curve(ex2, ey, 7, -3);
    } else {
      this._disc(ex1, ey, eyeR);
      this._disc(ex2, ey, eyeR);
    }

    if (this.face === "concerned") {
      this._seg(ex1 - 8, ey - 8, ex1 + 5, ey - 12);
      this._seg(ex2 + 8, ey - 8, ex2 - 5, ey - 12);
    }

    let curve = 0;
    if (this.face === "happy") curve = 8;
    else if (this.face === "concerned") curve = -6;
    else if (this.face === "sleepy") curve = 2;
    this._curve(64, 41, 17, curve);

    if (this.face === "sleepy") {
      c.font = `600 9px ${MONO}`;
      c.fillText("z", 99, 17);
      c.fillText("z", 107, 11);
    }

    c.font = `600 10px ${MONO}`;
    const y = 58;
    if (tw <= OLED_W - 6) {
      c.fillText(this.message, (OLED_W - tw) / 2, y);
    } else {
      const span = tw + 20;
      c.fillText(this.message, this._scrollX, y);
      c.fillText(this.message, this._scrollX + span, y);
    }
  }

  _disc(x, y, r) {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  _seg(x1, y1, x2, y2) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }
  _curve(cx, cy, w, k) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(cx - w, cy);
    for (let x = -w + 1; x <= w; x++) {
      c.lineTo(cx + x, cy + (k * (w * w - x * x)) / (w * w));
    }
    c.stroke();
  }

  // ------------------------------------------------------------------- servo ---
  setServo(action, angle) {
    const deg = angle ?? (action === "still" ? 0 : action === "perk" ? -16 : 12);
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
      setTimeout(step, 150);
    };
    step();
  }

  // -------------------------------------------------------------------- tone ---
  playTone(tone) {
    this.toneEl.dataset.tone = tone;
    if (tone === "none") return;
    this.toneEl.classList.remove("pulse");
    void this.toneEl.offsetWidth;
    this.toneEl.classList.add("pulse");

    try {
      this._audio ??= new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this._audio;
      const notes = tone === "chime" ? [880, 1320] : [523];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const t0 = ctx.currentTime + i * 0.16;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.24);
      });
    } catch {
      /* WebAudio needs a user gesture first - the visual pulse still fires */
    }
  }
}
