// ===================================================================
// Projectile Motion — ideal kinematics, solved analytically and
// animated in real time.
// ===================================================================

class ProjectileSim {
  constructor() {
    this.canvas = document.getElementById('proj-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.running = false;
    this.t = 0;
    this.trail = [];
    this._bindUI();
    this._recompute();
    requestAnimationFrame(this._loop.bind(this));
  }

  _bindUI() {
    const speed = document.getElementById('proj-speed');
    const angle = document.getElementById('proj-angle');
    const height = document.getElementById('proj-height');
    const gravity = document.getElementById('proj-gravity');
    const sync = () => {
      document.getElementById('proj-speed-val').textContent = speed.value;
      document.getElementById('proj-angle-val').textContent = angle.value;
      document.getElementById('proj-height-val').textContent = height.value;
      this._recompute();
      this.running = false;
      this.t = 0;
      this.trail = [];
    };
    [speed, angle, height, gravity].forEach(el => el.addEventListener('input', sync));
    document.getElementById('proj-launch').addEventListener('click', () => this.launch());
    document.getElementById('proj-reset').addEventListener('click', () => sync());
  }

  _params() {
    return {
      v0: parseFloat(document.getElementById('proj-speed').value),
      angleDeg: parseFloat(document.getElementById('proj-angle').value),
      y0: parseFloat(document.getElementById('proj-height').value),
      g: parseFloat(document.getElementById('proj-gravity').value),
    };
  }

  _recompute() {
    const { v0, angleDeg, y0, g } = this._params();
    const rad = angleDeg * Math.PI / 180;
    const vx = v0 * Math.cos(rad);
    const vy = v0 * Math.sin(rad);
    const T = (vy + Math.sqrt(vy * vy + 2 * g * y0)) / g;
    const maxHeight = y0 + (vy > 0 ? (vy * vy) / (2 * g) : 0);
    const range = vx * T;
    this.params = { v0, angleDeg, y0, g, vx, vy, T, maxHeight, range };
    // animate long flights faster so they still land within a few seconds
    this.timeScale = Math.max(1, T / 6);
    this._renderResults();
    this._render();
  }

  launch() {
    this._recompute();
    this.t = 0;
    this.trail = [];
    this.running = true;
  }

  _renderResults() {
    const p = this.params;
    document.getElementById('proj-results').innerHTML = `
      <div class="row"><span>Time of flight</span><span>${p.T.toFixed(2)} s</span></div>
      <div class="row"><span>Max height</span><span>${p.maxHeight.toFixed(2)} m</span></div>
      <div class="row"><span>Range</span><span>${p.range.toFixed(2)} m</span></div>
      <div class="row"><span>v₀ₓ / v₀ᵧ</span><span>${p.vx.toFixed(1)} / ${p.vy.toFixed(1)} m/s</span></div>
    `;
  }

  _loop(now) {
    if (this.running) {
      if (!this._lastTs) this._lastTs = now;
      const dt = Math.min(0.05, (now - this._lastTs) / 1000);
      this._lastTs = now;
      this.t += dt * this.timeScale;
      const p = this.params;
      if (this.t >= p.T) {
        this.t = p.T;
        this.running = false;
      }
      const x = p.vx * this.t;
      const y = p.y0 + p.vy * this.t - 0.5 * p.g * this.t * this.t;
      this.trail.push({ x, y: Math.max(0, y) });
      this._renderLive(x, Math.max(0, y));
    } else {
      this._lastTs = null;
    }
    this._render();
    requestAnimationFrame(this._loop.bind(this));
  }

  _renderLive(x, y) {
    const p = this.params;
    const vy = p.vy - p.g * this.t;
    const speed = Math.hypot(p.vx, vy);
    document.getElementById('proj-live').innerHTML = `
      <div class="row"><span>Time</span><span>${this.t.toFixed(2)} s</span></div>
      <div class="row"><span>x</span><span>${x.toFixed(1)} m</span></div>
      <div class="row"><span>y</span><span>${y.toFixed(1)} m</span></div>
      <div class="row"><span>vₓ</span><span>${p.vx.toFixed(1)} m/s</span></div>
      <div class="row"><span>vᵧ</span><span>${vy.toFixed(1)} m/s</span></div>
      <div class="row"><span>Speed</span><span>${speed.toFixed(1)} m/s</span></div>
    `;
  }

  _render() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    const p = this.params;
    const margin = 50;
    const worldW = Math.max(p.range, 5) * 1.15;
    const worldH = Math.max(p.maxHeight, 5) * 1.25;
    const scale = Math.min((W - margin * 1.5) / worldW, (H - margin * 1.5) / worldH);
    const originX = margin, originY = H - margin;
    const toPx = (x, y) => ({ x: originX + x * scale, y: originY - y * scale });

    // ground
    ctx.strokeStyle = '#3a4770';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, originY); ctx.lineTo(W, originY); ctx.stroke();
    // axes ticks
    ctx.fillStyle = '#93a0c0';
    ctx.font = '11px sans-serif';
    for (let gx = 0; gx <= worldW; gx += Math.max(5, Math.round(worldW / 10 / 5) * 5)) {
      const pt = toPx(gx, 0);
      ctx.beginPath(); ctx.moveTo(pt.x, originY - 4); ctx.lineTo(pt.x, originY + 4); ctx.stroke();
      ctx.fillText(`${gx}m`, pt.x - 8, originY + 18);
    }
    // launch height marker
    if (p.y0 > 0) {
      const launchPt = toPx(0, p.y0);
      ctx.strokeStyle = '#2a3555';
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(0, launchPt.y); ctx.lineTo(W, launchPt.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    // ideal trajectory (faint, full path preview)
    ctx.strokeStyle = 'rgba(77,163,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const tt = (p.T * i) / 60;
      const xx = p.vx * tt;
      const yy = Math.max(0, p.y0 + p.vy * tt - 0.5 * p.g * tt * tt);
      const pt = toPx(xx, yy);
      if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    // trail actually flown
    if (this.trail.length > 1) {
      ctx.strokeStyle = '#22d3aa';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      this.trail.forEach((pt, i) => {
        const px = toPx(pt.x, pt.y);
        if (i === 0) ctx.moveTo(px.x, px.y); else ctx.lineTo(px.x, px.y);
      });
      ctx.stroke();
    }

    // projectile marker
    const curX = this.trail.length ? this.trail[this.trail.length - 1].x : 0;
    const curY = this.trail.length ? this.trail[this.trail.length - 1].y : p.y0;
    const cp = toPx(curX, curY);
    ctx.fillStyle = '#4da3ff';
    ctx.beginPath(); ctx.arc(cp.x, cp.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e7ecf7'; ctx.lineWidth = 1.5; ctx.stroke();

    // launch point marker
    const lp = toPx(0, p.y0);
    ctx.fillStyle = '#ffb454';
    ctx.beginPath(); ctx.arc(lp.x, lp.y, 4, 0, Math.PI * 2); ctx.fill();
  }
}
