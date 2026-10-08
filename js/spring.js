// ===================================================================
// Spring-Mass Lab — RK4 integration of damped simple harmonic motion
// m x'' = -k x - c x'  on a frictionless horizontal surface.
// ===================================================================

class SpringSim {
  constructor() {
    this.canvas = document.getElementById('spring-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.running = false;
    this._bindUI();
    this.reset();
    requestAnimationFrame(this._loop.bind(this));
  }

  _bindUI() {
    const k = document.getElementById('spr-k');
    const mass = document.getElementById('spr-mass');
    const amp = document.getElementById('spr-amp');
    const damping = document.getElementById('spr-damping');
    const sync = () => {
      document.getElementById('spr-k-val').textContent = k.value;
      document.getElementById('spr-mass-val').textContent = mass.value;
      document.getElementById('spr-amp-val').textContent = amp.value;
      document.getElementById('spr-damping-val').textContent = damping.value;
      this.reset();
    };
    [k, mass, amp, damping].forEach(el => el.addEventListener('input', sync));
    document.getElementById('spr-start').addEventListener('click', () => { this.running = true; this._lastTs = null; });
    document.getElementById('spr-pause').addEventListener('click', () => { this.running = false; });
    document.getElementById('spr-reset').addEventListener('click', () => this.reset());
  }

  _params() {
    return {
      k: parseFloat(document.getElementById('spr-k').value),
      m: parseFloat(document.getElementById('spr-mass').value),
      A: parseFloat(document.getElementById('spr-amp').value),
      c: parseFloat(document.getElementById('spr-damping').value),
    };
  }

  reset() {
    const p = this._params();
    this.p = p;
    this.x = p.A;
    this.v = 0;
    this.t = 0;
    this.running = false;
    this._lastTs = null;
    this._updateTheory();
    this._render();
    this._renderLive();
  }

  _accel(x, v) {
    const { k, m, c } = this.p;
    return (-k * x - c * v) / m;
  }

  _rk4Step(dt) {
    const x = this.x, v = this.v;
    const k1x = v, k1v = this._accel(x, v);
    const k2x = v + 0.5 * dt * k1v, k2v = this._accel(x + 0.5 * dt * k1x, v + 0.5 * dt * k1v);
    const k3x = v + 0.5 * dt * k2v, k3v = this._accel(x + 0.5 * dt * k2x, v + 0.5 * dt * k2v);
    const k4x = v + dt * k3v, k4v = this._accel(x + dt * k3x, v + dt * k3v);
    this.x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    this.v += (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
    this.t += dt;
  }

  _updateTheory() {
    const { k, m, c } = this.p;
    const omega0 = Math.sqrt(k / m);
    const T0 = 2 * Math.PI / omega0;
    const zeta = c / (2 * Math.sqrt(k * m));
    let regime = 'Undamped';
    if (zeta > 0 && zeta < 1) regime = 'Underdamped (oscillates, decays)';
    else if (zeta >= 1) regime = 'Overdamped / critically damped (no oscillation)';
    document.getElementById('spr-theory').innerHTML = `
      <p>Natural angular frequency: ω₀ = √(k/m) = <b style="color:var(--text)">${omega0.toFixed(2)} rad/s</b></p>
      <p>Natural period: T₀ = 2π/ω₀ = <b style="color:var(--text)">${T0.toFixed(3)} s</b></p>
      <p>Damping ratio ζ = <b style="color:var(--text)">${zeta.toFixed(3)}</b> — ${regime}</p>
    `;
  }

  _loop(now) {
    if (this.running) {
      if (this._lastTs === null) this._lastTs = now;
      const dt = Math.min(0.05, (now - this._lastTs) / 1000);
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
    const { k, m } = this.p;
    const KE = 0.5 * m * this.v * this.v;
    const PE = 0.5 * k * this.x * this.x;
    document.getElementById('spr-live').innerHTML = `
      <div class="row"><span>Time</span><span>${this.t.toFixed(2)} s</span></div>
      <div class="row"><span>Displacement x</span><span>${this.x.toFixed(3)} m</span></div>
      <div class="row"><span>Velocity</span><span>${this.v.toFixed(3)} m/s</span></div>
      <div class="row"><span>Kinetic energy</span><span>${KE.toFixed(2)} J</span></div>
      <div class="row"><span>Spring PE</span><span>${PE.toFixed(2)} J</span></div>
      <div class="row"><span>Total energy</span><span>${(KE + PE).toFixed(2)} J</span></div>
    `;
  }

  _render() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    const midY = H / 2;
    const wallX = 60;
    const pxPerM = 120;
    const equilibriumX = wallX + 140;
    const massX = equilibriumX + this.x * pxPerM;

    // wall
    ctx.fillStyle = '#2a3555';
    ctx.fillRect(wallX - 14, midY - 60, 14, 120);

    // equilibrium reference line
    ctx.strokeStyle = 'rgba(147,160,192,0.3)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(equilibriumX, midY - 70); ctx.lineTo(equilibriumX, midY + 70); ctx.stroke();
    ctx.setLineDash([]);

    // spring (zigzag from wall to mass)
    const coils = 14;
    const springStart = wallX, springEnd = massX - 24;
    const segLen = (springEnd - springStart) / (coils * 2);
    ctx.strokeStyle = '#8fa1c7';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(springStart, midY);
    for (let i = 0; i <= coils * 2; i++) {
      const px = springStart + i * segLen;
      const py = midY + (i % 2 === 0 ? -12 : 12) * (i === 0 || i === coils * 2 ? 0 : 1);
      ctx.lineTo(px, py);
    }
    ctx.stroke();

    // mass
    const grad = ctx.createLinearGradient(massX - 24, 0, massX + 24, 0);
    grad.addColorStop(0, '#4da3ff');
    grad.addColorStop(1, '#7fd8ff');
    ctx.fillStyle = grad;
    ctx.fillRect(massX - 24, midY - 24, 48, 48);
    ctx.strokeStyle = '#e7ecf7';
    ctx.strokeRect(massX - 24, midY - 24, 48, 48);

    // floor line
    ctx.strokeStyle = '#3a4770';
    ctx.beginPath(); ctx.moveTo(0, midY + 24); ctx.lineTo(W, midY + 24); ctx.stroke();

    // ruler ticks
    ctx.fillStyle = '#93a0c0';
    ctx.font = '10px sans-serif';
    for (let m = -3; m <= 3; m++) {
      const tx = equilibriumX + m * pxPerM * 0.5;
      if (tx < wallX || tx > W - 10) continue;
      ctx.beginPath(); ctx.moveTo(tx, midY + 40); ctx.lineTo(tx, midY + 46); ctx.strokeStyle = '#3a4770'; ctx.stroke();
    }
  }
}
