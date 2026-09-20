// ===================================================================
// Pendulum Lab — numerically integrates the real nonlinear pendulum
// equation theta'' = -(g/L) sin(theta) - b * theta'  (RK4)
// ===================================================================

class PendulumSim {
  constructor() {
    this.canvas = document.getElementById('pend-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.running = false;
    this._bindUI();
    this.reset();
    requestAnimationFrame(this._loop.bind(this));
  }

  _bindUI() {
    const length = document.getElementById('pend-length');
    const angle = document.getElementById('pend-angle');
    const gravity = document.getElementById('pend-gravity');
    const damping = document.getElementById('pend-damping');
    const sync = () => {
      document.getElementById('pend-length-val').textContent = length.value;
      document.getElementById('pend-angle-val').textContent = angle.value;
      document.getElementById('pend-damping-val').textContent = damping.value;
      this.reset();
    };
    [length, angle, gravity, damping].forEach(el => el.addEventListener('input', sync));
    document.getElementById('pend-start').addEventListener('click', () => { this.running = true; this._lastTs = null; });
    document.getElementById('pend-pause').addEventListener('click', () => { this.running = false; });
    document.getElementById('pend-reset').addEventListener('click', () => this.reset());
  }

  _params() {
    return {
      L: parseFloat(document.getElementById('pend-length').value),
      theta0Deg: parseFloat(document.getElementById('pend-angle').value),
      g: parseFloat(document.getElementById('pend-gravity').value),
      b: parseFloat(document.getElementById('pend-damping').value),
    };
  }

  reset() {
    const p = this._params();
    this.p = p;
    this.theta0 = p.theta0Deg * Math.PI / 180;
    this.theta = this.theta0;
    this.omega = 0;
    this.t = 0;
    this.running = false;
    this._lastTs = null;
    this._updateTheory();
    this._render();
    this._renderLive();
  }

  _accel(theta, omega) {
    const { g, L, b } = this.p;
    return -(g / L) * Math.sin(theta) - b * omega;
  }

  _rk4Step(dt) {
    const th = this.theta, om = this.omega;
    const k1t = om, k1o = this._accel(th, om);
    const k2t = om + 0.5 * dt * k1o, k2o = this._accel(th + 0.5 * dt * k1t, om + 0.5 * dt * k1o);
    const k3t = om + 0.5 * dt * k2o, k3o = this._accel(th + 0.5 * dt * k2t, om + 0.5 * dt * k2o);
    const k4t = om + dt * k3o, k4o = this._accel(th + dt * k3t, om + dt * k3o);
    this.theta += (dt / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
    this.omega += (dt / 6) * (k1o + 2 * k2o + 2 * k3o + k4o);
    this.t += dt;
  }

  _updateTheory() {
    const { L, g, theta0Deg } = this.p;
    const theta0 = theta0Deg * Math.PI / 180;
    const T0 = 2 * Math.PI * Math.sqrt(L / g);
    // large-amplitude correction series (theta0 in radians)
    const T = T0 * (1 + (theta0 * theta0) / 16 + (11 * Math.pow(theta0, 4)) / 3072);
    document.getElementById('pend-theory').innerHTML = `
      <p>Small-angle period: T₀ = 2π√(L/g) = <b style="color:var(--text)">${T0.toFixed(3)} s</b></p>
      <p>Large-amplitude corrected period: <b style="color:var(--text)">${T.toFixed(3)} s</b>
      ${theta0Deg > 30 ? '<br><span style="color:var(--warn)">Amplitude is large — the small-angle formula alone would be noticeably off.</span>' : ''}</p>
      <p>Simulation uses full RK4 integration of θ'' = −(g/L)sinθ − bθ′, not the small-angle approximation.</p>
    `;
  }

  _loop(now) {
    if (this.running) {
      if (this._lastTs === null) this._lastTs = now;
      let dt = Math.min(0.05, (now - this._lastTs) / 1000);
      this._lastTs = now;
      const substeps = 4;
      const h = dt / substeps;
      for (let i = 0; i < substeps; i++) this._rk4Step(h);
      this._renderLive();
    }
    this._render();
    requestAnimationFrame(this._loop.bind(this));
  }

  _renderLive() {
    const { L, g } = this.p;
    const m = 1; // unit mass; energies are per kg
    const KE = 0.5 * m * L * L * this.omega * this.omega;
    const PE = m * g * L * (1 - Math.cos(this.theta));
    document.getElementById('pend-live').innerHTML = `
      <div class="row"><span>Time</span><span>${this.t.toFixed(2)} s</span></div>
      <div class="row"><span>Angle</span><span>${(this.theta * 180 / Math.PI).toFixed(1)}°</span></div>
      <div class="row"><span>Angular velocity</span><span>${this.omega.toFixed(2)} rad/s</span></div>
      <div class="row"><span>Kinetic energy</span><span>${KE.toFixed(2)} J/kg</span></div>
      <div class="row"><span>Potential energy</span><span>${PE.toFixed(2)} J/kg</span></div>
      <div class="row"><span>Total energy</span><span>${(KE + PE).toFixed(2)} J/kg</span></div>
    `;
  }

  _render() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    const pivot = { x: W / 2, y: 60 };
    const pxPerM = Math.min(150, (H - 120) / this.p.L);
    const Lpx = this.p.L * pxPerM;
    const bobX = pivot.x + Lpx * Math.sin(this.theta);
    const bobY = pivot.y + Lpx * Math.cos(this.theta);

    // arc showing initial amplitude
    ctx.strokeStyle = 'rgba(147,160,192,0.3)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(pivot.x, pivot.y, Lpx, Math.PI / 2 - this.theta0, Math.PI / 2 + this.theta0);
    ctx.stroke();
    ctx.setLineDash([]);

    // vertical reference
    ctx.strokeStyle = '#2a3555';
    ctx.beginPath(); ctx.moveTo(pivot.x, pivot.y); ctx.lineTo(pivot.x, pivot.y + Lpx + 20); ctx.stroke();

    // rod
    ctx.strokeStyle = '#8fa1c7';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(pivot.x, pivot.y); ctx.lineTo(bobX, bobY); ctx.stroke();

    // pivot
    ctx.fillStyle = '#e7ecf7';
    ctx.beginPath(); ctx.arc(pivot.x, pivot.y, 5, 0, Math.PI * 2); ctx.fill();

    // bob
    const grad = ctx.createRadialGradient(bobX - 5, bobY - 5, 2, bobX, bobY, 18);
    grad.addColorStop(0, '#7fd8ff');
    grad.addColorStop(1, '#4da3ff');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(bobX, bobY, 16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#e7ecf7'; ctx.lineWidth = 1; ctx.stroke();

    // energy bar (KE vs PE), bottom-left
    const m = 1, g = this.p.g, L = this.p.L;
    const KE = 0.5 * m * L * L * this.omega * this.omega;
    const PE = m * g * L * (1 - Math.cos(this.theta));
    const EMax = m * g * L * (1 - Math.cos(this.theta0)) || 1;
    const barX = 20, barY = H - 40, barW = 160, barH = 16;
    const keFrac = Math.max(0, Math.min(1, KE / EMax));
    ctx.fillStyle = '#1d2740'; ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = '#ffb454'; ctx.fillRect(barX, barY, barW * (1 - keFrac), barH);
    ctx.fillStyle = '#22d3aa'; ctx.fillRect(barX + barW * (1 - keFrac), barY, barW * keFrac, barH);
    ctx.strokeStyle = '#3a4770'; ctx.strokeRect(barX, barY, barW, barH);
    ctx.fillStyle = '#93a0c0';
    ctx.font = '11px sans-serif';
    ctx.fillText('PE', barX, barY - 5);
    ctx.fillText('KE', barX + barW - 20, barY - 5);
  }
}
