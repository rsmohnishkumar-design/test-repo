// ===================================================================
// Incline Plane Lab — Newton's second law with static & kinetic
// friction: a = g(sinθ − μcosθ) once sliding, or a = 0 if
// tanθ ≤ μ (static friction holds the block in place).
// ===================================================================

class InclineSim {
  constructor() {
    this.canvas = document.getElementById('incline-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.rampLength = 4; // meters
    this.running = false;
    this._bindUI();
    this.reset();
    requestAnimationFrame(this._loop.bind(this));
  }

  _bindUI() {
    const mass = document.getElementById('inc-mass');
    const angle = document.getElementById('inc-angle');
    const mu = document.getElementById('inc-mu');
    const gravity = document.getElementById('inc-gravity');
    const sync = () => {
      document.getElementById('inc-mass-val').textContent = mass.value;
      document.getElementById('inc-angle-val').textContent = angle.value;
      document.getElementById('inc-mu-val').textContent = mu.value;
      this.reset();
    };
    [mass, angle, mu, gravity].forEach(el => el.addEventListener('input', sync));
    document.getElementById('inc-release').addEventListener('click', () => this.release());
    document.getElementById('inc-reset').addEventListener('click', () => this.reset());
  }

  _params() {
    return {
      m: parseFloat(document.getElementById('inc-mass').value),
      angleDeg: parseFloat(document.getElementById('inc-angle').value),
      mu: parseFloat(document.getElementById('inc-mu').value),
      g: parseFloat(document.getElementById('inc-gravity').value),
    };
  }

  reset() {
    const p = this._params();
    this.p = p;
    this.theta = p.angleDeg * Math.PI / 180;
    this.s = 0;
    this.v = 0;
    this.t = 0;
    this.running = false;
    this.landed = false;

    const N = p.m * p.g * Math.cos(this.theta);
    const gravityAlong = p.m * p.g * Math.sin(this.theta);
    const maxStatic = p.mu * N;
    this.willSlide = gravityAlong > maxStatic;
    this.a = this.willSlide ? p.g * (Math.sin(this.theta) - p.mu * Math.cos(this.theta)) : 0;
    this.N = N;
    this.frictionForce = this.willSlide ? p.mu * N : gravityAlong;
    this.gravityAlong = gravityAlong;

    this._renderInfo();
    this._render();
  }

  release() {
    if (!this.willSlide) return; // static friction holds it — nothing to release
    this.s = 0;
    this.v = 0;
    this.t = 0;
    this.landed = false;
    this.running = true;
    this._lastTs = null;
  }

  _renderInfo() {
    const p = this.p;
    document.getElementById('inc-readouts').innerHTML = `
      <div class="row"><span>Normal force N</span><span>${this.N.toFixed(1)} N</span></div>
      <div class="row"><span>Gravity along ramp</span><span>${this.gravityAlong.toFixed(1)} N</span></div>
      <div class="row"><span>Friction force</span><span>${this.frictionForce.toFixed(1)} N</span></div>
      <div class="row"><span>Acceleration</span><span>${this.a.toFixed(2)} m/s²</span></div>
      ${this.willSlide
        ? '<div class="row ok">✅ tanθ &gt; μ — it will slide.</div>'
        : '<div class="row warn">⚠ tanθ ≤ μ — static friction holds it still.</div>'}
    `;
  }

  _renderLive() {
    document.getElementById('inc-live').innerHTML = `
      <div class="row"><span>Time</span><span>${this.t.toFixed(2)} s</span></div>
      <div class="row"><span>Distance along ramp</span><span>${this.s.toFixed(2)} m</span></div>
      <div class="row"><span>Speed</span><span>${this.v.toFixed(2)} m/s</span></div>
      ${this.landed ? `<div class="row ok">🏁 Reached the bottom at ${this.v.toFixed(2)} m/s</div>` : ''}
    `;
  }

  _loop(now) {
    if (this.running) {
      if (!this._lastTs) this._lastTs = now;
      const dt = Math.min(0.05, (now - this._lastTs) / 1000);
      this._lastTs = now;
      this.v += this.a * dt;
      this.s += this.v * dt;
      this.t += dt;
      if (this.s >= this.rampLength) {
        this.s = this.rampLength;
        this.running = false;
        this.landed = true;
      }
      this._renderLive();
    } else {
      this._lastTs = null;
    }
    this._render();
    requestAnimationFrame(this._loop.bind(this));
  }

  _render() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    const scale = 70; // px per meter
    const Lpx = this.rampLength * scale;
    const top = { x: 90, y: 60 };
    const cosT = Math.cos(this.theta), sinT = Math.sin(this.theta);
    const bottom = { x: top.x + Lpx * cosT, y: top.y + Lpx * sinT };
    const corner = { x: bottom.x, y: top.y };

    // triangle
    ctx.fillStyle = '#161d2e';
    ctx.beginPath();
    ctx.moveTo(top.x, top.y); ctx.lineTo(bottom.x, bottom.y); ctx.lineTo(corner.x, corner.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#3a4770';
    ctx.lineWidth = 2;
    ctx.stroke();

    // ground extension
    ctx.beginPath();
    ctx.moveTo(bottom.x, bottom.y);
    ctx.lineTo(Math.min(W - 20, bottom.x + 140), bottom.y);
    ctx.strokeStyle = '#3a4770';
    ctx.stroke();

    // angle arc + label
    ctx.strokeStyle = '#93a0c0';
    ctx.beginPath();
    ctx.arc(bottom.x, bottom.y, 30, Math.PI, Math.PI + this.theta, false);
    ctx.stroke();
    ctx.fillStyle = '#93a0c0';
    ctx.font = '12px sans-serif';
    ctx.fillText(`${this.p.angleDeg}°`, bottom.x - 46, bottom.y - 8);

    // block position along ramp
    const sx = top.x + this.s * scale * cosT;
    const sy = top.y + this.s * scale * sinT;
    const blockOffset = 14; // lift block above the surface line
    const nx = sinT, ny = -cosT; // outward normal from the incline surface
    const blockX = sx + nx * blockOffset;
    const blockY = sy + ny * blockOffset;

    // force vectors
    const mg = this.p.m * this.p.g;
    const fscale = 55 / Math.max(1, mg);
    this._arrow(blockX, blockY, 0, mg * fscale, '#ff6b6b', 'mg');
    this._arrow(blockX, blockY, nx * this.N * fscale, ny * this.N * fscale, '#4da3ff', 'N');
    if (this.frictionForce > 0.01) {
      // friction always opposes the down-slope tendency, so it points up-slope
      this._arrow(blockX, blockY, -cosT * this.frictionForce * fscale, -sinT * this.frictionForce * fscale, '#f4d35e', 'f');
    }

    // block
    ctx.save();
    ctx.translate(blockX, blockY);
    ctx.rotate(this.theta);
    ctx.fillStyle = '#22d3aa';
    ctx.fillRect(-16, -16, 32, 16);
    ctx.strokeStyle = '#0f1420';
    ctx.strokeRect(-16, -16, 32, 16);
    ctx.restore();
  }

  _arrow(x, y, dx, dy, color, label) {
    const ctx = this.ctx;
    const len = Math.hypot(dx, dy);
    if (len < 4) return;
    const ex = x + dx, ey = y + dy;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
    const ang = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - 8 * Math.cos(ang - 0.4), ey - 8 * Math.sin(ang - 0.4));
    ctx.lineTo(ex - 8 * Math.cos(ang + 0.4), ey - 8 * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(label, ex + 4, ey + 4);
  }
}
