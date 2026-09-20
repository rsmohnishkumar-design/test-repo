// ===================================================================
// Circuit Builder — a real Kirchhoff's-law (Modified Nodal Analysis)
// DC circuit solver, with click-and-drag part placement on a grid.
// ===================================================================

const WIRE_RESISTANCE = 0.05; // ohms — small but non-zero, keeps the math well-behaved

function solveLinearSystem(A, z) {
  const n = z.length;
  if (n === 0) return [];
  // Gaussian elimination with partial pivoting on augmented matrix.
  const M = A.map((row, i) => [...row, z[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const pv = M[col][col];
    if (Math.abs(pv) < 1e-12) continue; // singular row (isolated/degenerate) — leave as 0
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / pv;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = 0; r < n; r++) {
    const pv = M[r][r];
    x[r] = Math.abs(pv) < 1e-12 ? 0 : M[r][n] / pv;
  }
  return x;
}

class CircuitSim {
  constructor() {
    this.canvas = document.getElementById('circuit-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.spacing = 50;
    this.cols = 14;
    this.rows = 8;
    this.originX = 30;
    this.originY = 30;

    this.tool = 'wire';
    this.elements = []; // {id,type,a:{i,j},b:{i,j},value,closed}
    this.nextId = 1;
    this.dragStart = null;
    this.dragPos = null;
    this.selected = null;
    this.results = null; // Map id -> {current, vDrop}
    this.clock = 0;

    this._bindToolbar();
    this._bindCanvas();
    document.getElementById('circuit-clear').addEventListener('click', () => this.clear());
    document.getElementById('circuit-example').addEventListener('click', () => this.loadExample());

    this.loadExample();
    requestAnimationFrame(this._loop.bind(this));
  }

  // ---------- grid helpers ----------
  pixelOf(p) { return { x: this.originX + p.i * this.spacing, y: this.originY + p.j * this.spacing }; }
  key(p) { return `${p.i},${p.j}`; }
  samePoint(a, b) { return a.i === b.i && a.j === b.j; }

  snapToGrid(px, py) {
    const i = Math.round((px - this.originX) / this.spacing);
    const j = Math.round((py - this.originY) / this.spacing);
    if (i < 0 || i > this.cols || j < 0 || j > this.rows) return null;
    const p = { i, j };
    const pix = this.pixelOf(p);
    const d = Math.hypot(px - pix.x, py - pix.y);
    return d < 18 ? p : null;
  }

  // ---------- toolbar ----------
  _bindToolbar() {
    document.querySelectorAll('#circuit-toolbar .tool-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#circuit-toolbar .tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.tool = btn.dataset.tool;
        this.dragStart = null;
      });
    });
  }

  // ---------- canvas interaction ----------
  _canvasPos(evt) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const cx = (evt.touches ? evt.touches[0].clientX : evt.clientX) - rect.left;
    const cy = (evt.touches ? evt.touches[0].clientY : evt.clientY) - rect.top;
    return { x: cx * scaleX, y: cy * scaleY };
  }

  _bindCanvas() {
    const isPlacingTool = () => ['wire', 'resistor', 'battery', 'bulb', 'switch'].includes(this.tool);

    this.canvas.addEventListener('mousedown', (e) => {
      const pos = this._canvasPos(e);
      if (isPlacingTool()) {
        const p = this.snapToGrid(pos.x, pos.y);
        if (p) { this.dragStart = p; this.dragPos = pos; }
      }
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const pos = this._canvasPos(e);
      this.dragPos = pos;
      if (!this.dragStart) {
        this.hoverPoint = this.snapToGrid(pos.x, pos.y);
        this.hoverElement = this.dragStart ? null : this._nearestElement(pos);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (this.dragStart) {
        const pos = this._canvasPos(e);
        const p = this.snapToGrid(pos.x, pos.y);
        if (p && !this.samePoint(this.dragStart, p)) {
          this._placeElement(this.tool, this.dragStart, p);
        }
        this.dragStart = null;
      }
    });

    this.canvas.addEventListener('click', (e) => {
      if (this.tool !== 'select' && this.tool !== 'delete') return;
      const pos = this._canvasPos(e);
      const el = this._nearestElement(pos);
      if (!el) { this.selected = null; this._updateInspector(); return; }
      if (this.tool === 'delete') {
        this.elements = this.elements.filter(x => x.id !== el.id);
        if (this.selected && this.selected.id === el.id) this.selected = null;
        this._solve();
      } else {
        if (el.type === 'switch') {
          el.closed = !el.closed;
          this._solve();
        }
        this.selected = el;
        this._updateInspector();
      }
    });
  }

  _placeElement(type, a, b) {
    // avoid an exact duplicate of the same type between the same two points
    const dup = this.elements.some(el => el.type === type && this._samePair(el, a, b));
    if (dup) return;
    const el = { id: this.nextId++, type, a: { ...a }, b: { ...b } };
    if (type === 'resistor') el.value = 100;
    if (type === 'battery') el.value = 5;
    if (type === 'bulb') el.value = 40;
    if (type === 'switch') el.closed = true;
    this.elements.push(el);
    this._solve();
  }

  _samePair(el, a, b) {
    return (this.samePoint(el.a, a) && this.samePoint(el.b, b)) ||
           (this.samePoint(el.a, b) && this.samePoint(el.b, a));
  }

  _parallelIndex(el) {
    // returns [index, total] among elements sharing the same two endpoints, for drawing offset
    const siblings = this.elements.filter(e => this._samePair(e, el.a, el.b));
    return [siblings.indexOf(el), siblings.length];
  }

  _nearestElement(pos) {
    let best = null, bestDist = 14;
    for (const el of this.elements) {
      const a = this.pixelOf(el.a), b = this.pixelOf(el.b);
      const d = this._pointSegDist(pos, a, b);
      if (d < bestDist) { bestDist = d; best = el; }
    }
    return best;
  }

  _pointSegDist(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = a.x + t * dx, cy = a.y + t * dy;
    return Math.hypot(p.x - cx, p.y - cy);
  }

  // ---------- inspector ----------
  _updateInspector() {
    const box = document.getElementById('circuit-props');
    const el = this.selected;
    if (!el) { box.innerHTML = 'Click a component with the Select tool to edit it.'; return; }
    const r = this.results && this.results.get(el.id);
    let html = `<div><b>${this._label(el.type)}</b></div>`;
    if (el.type === 'resistor' || el.type === 'bulb') {
      html += `<label>Resistance (Ω)</label>
        <input type="number" min="1" max="10000" step="1" id="prop-value" value="${el.value}">`;
    }
    if (el.type === 'battery') {
      html += `<label>Voltage (V)</label>
        <input type="number" min="-24" max="24" step="0.5" id="prop-value" value="${el.value}">`;
    }
    if (el.type === 'switch') {
      html += `<button class="toggle-btn" id="prop-toggle">${el.closed ? '🔓 Open switch' : '🔒 Close switch'}</button>`;
    }
    if (r) {
      html += `<div style="margin-top:10px;font-size:0.8rem;color:var(--muted)">
        Current: <b style="color:var(--text)">${formatCurrent(r.current)}</b><br>
        Voltage drop: <b style="color:var(--text)">${formatVoltage(r.vDrop)}</b>
        ${el.type === 'bulb' ? `<br>Power: <b style="color:var(--text)">${formatPower(r.current * r.current * el.value)}</b>` : ''}
      </div>`;
    }
    html += `<button class="del-btn" id="prop-delete">Delete part</button>`;
    box.innerHTML = html;

    const valueInput = document.getElementById('prop-value');
    if (valueInput) {
      valueInput.addEventListener('input', () => {
        const v = parseFloat(valueInput.value);
        if (!isNaN(v)) { el.value = v; this._solve(); this._updateInspector(); }
      });
    }
    const toggleBtn = document.getElementById('prop-toggle');
    if (toggleBtn) toggleBtn.addEventListener('click', () => { el.closed = !el.closed; this._solve(); this._updateInspector(); });
    document.getElementById('prop-delete').addEventListener('click', () => {
      this.elements = this.elements.filter(x => x.id !== el.id);
      this.selected = null;
      this._solve();
      this._updateInspector();
    });
  }

  _label(type) {
    return { wire: 'Wire', resistor: 'Resistor', battery: 'Battery', bulb: 'Bulb', switch: 'Switch' }[type] || type;
  }

  // ---------- solving (Modified Nodal Analysis) ----------
  clear() {
    this.elements = [];
    this.selected = null;
    this._solve();
    this._updateInspector();
  }

  loadExample() {
    this.elements = [];
    this.nextId = 1;
    const b = (i, j) => ({ i, j });
    this._placeElement('battery', b(3, 3), b(3, 4));
    this._placeElement('wire', b(3, 3), b(3, 2));
    this._placeElement('wire', b(3, 2), b(7, 2));
    this._placeElement('resistor', b(7, 2), b(7, 3));
    this._placeElement('wire', b(7, 3), b(7, 4));
    this._placeElement('bulb', b(7, 4), b(3, 4));
    this.selected = null;
    this._solve();
    this._updateInspector();
  }

  _solve() {
    const active = this.elements.filter(e => e.type !== 'switch' || e.closed);
    const points = new Map(); // key -> point
    active.forEach(e => { points.set(this.key(e.a), e.a); points.set(this.key(e.b), e.b); });

    // connectivity graph (for choosing a ground per isolated sub-circuit)
    const adj = new Map();
    active.forEach(e => {
      const ka = this.key(e.a), kb = this.key(e.b);
      if (!adj.has(ka)) adj.set(ka, []);
      if (!adj.has(kb)) adj.set(kb, []);
      adj.get(ka).push(kb);
      adj.get(kb).push(ka);
    });

    const visited = new Set();
    const globalIndex = new Map();
    let counter = 0;
    for (const k of points.keys()) {
      if (visited.has(k)) continue;
      // ground of this component = first point found
      globalIndex.set(k, -1);
      visited.add(k);
      const queue = [k];
      while (queue.length) {
        const cur = queue.pop();
        for (const nb of (adj.get(cur) || [])) {
          if (!visited.has(nb)) {
            visited.add(nb);
            globalIndex.set(nb, counter++);
            queue.push(nb);
          }
        }
      }
    }

    const totalNodes = counter;
    const resistive = active.filter(e => e.type !== 'battery');
    const batteries = active.filter(e => e.type === 'battery');
    const n = totalNodes + batteries.length;
    const A = Array.from({ length: n }, () => new Array(n).fill(0));
    const z = new Array(n).fill(0);

    const resOf = (e) => {
      if (e.type === 'resistor' || e.type === 'bulb') return Math.max(0.01, e.value);
      return WIRE_RESISTANCE; // wire or closed switch
    };

    resistive.forEach(e => {
      const ia = globalIndex.get(this.key(e.a));
      const ib = globalIndex.get(this.key(e.b));
      const g = 1 / resOf(e);
      if (ia >= 0) A[ia][ia] += g;
      if (ib >= 0) A[ib][ib] += g;
      if (ia >= 0 && ib >= 0) { A[ia][ib] -= g; A[ib][ia] -= g; }
    });

    batteries.forEach((e, k) => {
      const row = totalNodes + k;
      const ia = globalIndex.get(this.key(e.a)); // '+' terminal
      const ib = globalIndex.get(this.key(e.b)); // '-' terminal
      if (ia >= 0) { A[ia][row] += 1; A[row][ia] += 1; }
      if (ib >= 0) { A[ib][row] -= 1; A[row][ib] -= 1; }
      z[row] = e.value;
    });

    const x = solveLinearSystem(A, z);
    const voltage = (key) => {
      const idx = globalIndex.get(key);
      return idx >= 0 ? x[idx] : 0;
    };

    const results = new Map();
    resistive.forEach(e => {
      const va = voltage(this.key(e.a));
      const vb = voltage(this.key(e.b));
      const r = resOf(e);
      const current = (va - vb) / r; // from a -> b
      results.set(e.id, { current, vDrop: va - vb });
    });
    batteries.forEach((e, k) => {
      // MNA's raw branch variable is the internal (- to +) current; negate so a positive
      // value reads intuitively as "current supplied out of the + terminal".
      const current = -x[totalNodes + k];
      const va = voltage(this.key(e.a)), vb = voltage(this.key(e.b));
      results.set(e.id, { current, vDrop: va - vb });
    });
    // open switches carry no current
    this.elements.filter(e => e.type === 'switch' && !e.closed).forEach(e => {
      results.set(e.id, { current: 0, vDrop: 0 });
    });

    this.results = results;
    this._updateReadouts();
  }

  _updateReadouts() {
    const box = document.getElementById('circuit-readouts');
    if (!this.elements.length) { box.innerHTML = '<span style="color:var(--muted)">Nothing built yet.</span>'; return; }
    const batteries = this.elements.filter(e => e.type === 'battery');
    const bulbs = this.elements.filter(e => e.type === 'bulb');
    let rows = '';
    let maxCurrent = 0;
    batteries.forEach((b, idx) => {
      const r = this.results.get(b.id);
      maxCurrent = Math.max(maxCurrent, Math.abs(r.current));
      rows += `<div class="row"><span>Battery ${idx + 1} supplies</span><span>${formatCurrent(r.current)}</span></div>`;
    });
    bulbs.forEach((bulb, idx) => {
      const r = this.results.get(bulb.id);
      const p = r.current * r.current * bulb.value;
      rows += `<div class="row"><span>Bulb ${idx + 1} power</span><span>${formatPower(p)}</span></div>`;
    });
    if (maxCurrent > 5) {
      rows += `<div class="row warn">⚠ Very high current — check for a short circuit!</div>`;
    } else if (batteries.length && maxCurrent < 1e-6) {
      rows += `<div class="row warn">⚠ No current flows — circuit may be open (check switches/loop).</div>`;
    } else if (batteries.length) {
      rows += `<div class="row ok">✅ Circuit is complete.</div>`;
    }
    box.innerHTML = rows;
  }

  // ---------- rendering ----------
  _loop(ts) {
    this.clock = ts / 1000;
    this._render();
    requestAnimationFrame(this._loop.bind(this));
  }

  _render() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);

    // grid dots
    ctx.fillStyle = getCss('--grid-dot');
    for (let i = 0; i <= this.cols; i++) {
      for (let j = 0; j <= this.rows; j++) {
        const p = this.pixelOf({ i, j });
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // hover point highlight
    if (this.hoverPoint && !this.dragStart) {
      const p = this.pixelOf(this.hoverPoint);
      ctx.strokeStyle = getCss('--accent');
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.stroke();
    }

    // elements
    for (const el of this.elements) this._drawElement(el);

    // drag preview
    if (this.dragStart && this.dragPos) {
      const a = this.pixelOf(this.dragStart);
      ctx.strokeStyle = getCss('--muted');
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(this.dragPos.x, this.dragPos.y); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  _endpoints(el) {
    let a = this.pixelOf(el.a), b = this.pixelOf(el.b);
    const [idx, total] = this._parallelIndex(el);
    if (total > 1) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const offset = (idx - (total - 1) / 2) * 10;
      a = { x: a.x + nx * offset, y: a.y + ny * offset };
      b = { x: b.x + nx * offset, y: b.y + ny * offset };
    }
    return [a, b];
  }

  _drawElement(el) {
    const ctx = this.ctx;
    const [a, b] = this._endpoints(el);
    const r = this.results && this.results.get(el.id);
    const isSelected = this.selected && this.selected.id === el.id;
    const isHover = this.hoverElement === el;

    ctx.lineWidth = isSelected ? 3.5 : 2.5;
    ctx.strokeStyle = isSelected ? getCss('--accent') : (isHover ? '#ffffff' : this._colorFor(el));

    if (el.type === 'wire') {
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    } else if (el.type === 'resistor') {
      this._drawZigzag(a, b);
    } else if (el.type === 'battery') {
      this._drawBattery(a, b, el);
    } else if (el.type === 'bulb') {
      this._drawBulb(a, b, el, r);
    } else if (el.type === 'switch') {
      this._drawSwitch(a, b, el);
    }

    // current flow animation
    if (r && Math.abs(r.current) > 1e-5 && el.type !== 'switch') {
      this._drawCurrentDots(a, b, r.current);
    }
  }

  _colorFor(el) {
    return { wire: '#8fa1c7', resistor: '#ffb454', battery: '#4da3ff', bulb: '#f4d35e', switch: '#8fa1c7' }[el.type];
  }

  _drawZigzag(a, b) {
    const ctx = this.ctx;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const zigLen = len * 0.5, straight = (len - zigLen) / 2;
    const teeth = 6, amp = 7;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    let cx = a.x + ux * straight, cy = a.y + uy * straight;
    ctx.lineTo(cx, cy);
    for (let t = 0; t <= teeth; t++) {
      const along = straight + (zigLen * t) / teeth;
      const side = (t % 2 === 0 ? 1 : -1) * (t === 0 || t === teeth ? 0 : amp);
      const px = a.x + ux * along + nx * side;
      const py = a.y + uy * along + ny * side;
      ctx.lineTo(px, py);
    }
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  _drawBattery(a, b, el) {
    const ctx = this.ctx;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const gap = 6;
    const p1 = { x: mid.x - ux * gap, y: mid.y - uy * gap };
    const p2 = { x: mid.x + ux * gap, y: mid.y + uy * gap };
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p2.x, p2.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    // long plate (+) near a-side, short plate (-) near b-side
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(p1.x - nx * 12, p1.y - ny * 12); ctx.lineTo(p1.x + nx * 12, p1.y + ny * 12); ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(p2.x - nx * 6, p2.y - ny * 6); ctx.lineTo(p2.x + nx * 6, p2.y + ny * 6); ctx.stroke();
    ctx.fillStyle = '#8fa1c7';
    ctx.font = '11px sans-serif';
    ctx.fillText('+', p1.x - nx * 18 - 3, p1.y - ny * 18 + 4);
    ctx.fillText('−', p2.x + nx * 14 - 3, p2.y + ny * 14 + 4);
    ctx.fillStyle = '#e7ecf7';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`${el.value}V`, mid.x + 10, mid.y - 10);
  }

  _drawBulb(a, b, el, r) {
    const ctx = this.ctx;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const radius = 12;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    const p1 = { x: mid.x - ux * radius, y: mid.y - uy * radius };
    const p2 = { x: mid.x + ux * radius, y: mid.y + uy * radius };
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p2.x, p2.y); ctx.lineTo(b.x, b.y); ctx.stroke();

    const power = r ? r.current * r.current * el.value : 0;
    const brightness = Math.min(1, power / 2); // 2W ~ full brightness
    if (brightness > 0.02) {
      const glow = ctx.createRadialGradient(mid.x, mid.y, 2, mid.x, mid.y, radius * 2.2);
      glow.addColorStop(0, `rgba(255, 240, 150, ${0.85 * brightness})`);
      glow.addColorStop(1, 'rgba(255, 240, 150, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(mid.x, mid.y, radius * 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(mid.x, mid.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = brightness > 0.02 ? `rgba(255, 220, ${Math.round(120 + 100 * (1 - brightness))}, ${0.4 + 0.6 * brightness})` : 'rgba(244,211,94,0.15)';
    ctx.fill();
    ctx.strokeStyle = '#f4d35e';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mid.x - radius * 0.6, mid.y - radius * 0.6);
    ctx.lineTo(mid.x + radius * 0.6, mid.y + radius * 0.6);
    ctx.moveTo(mid.x + radius * 0.6, mid.y - radius * 0.6);
    ctx.lineTo(mid.x - radius * 0.6, mid.y + radius * 0.6);
    ctx.stroke();
  }

  _drawSwitch(a, b, el) {
    const ctx = this.ctx;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const p1 = { x: a.x + ux * len * 0.3, y: a.y + uy * len * 0.3 };
    const p2 = { x: a.x + ux * len * 0.7, y: a.y + uy * len * 0.7 };
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p2.x, p2.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(p1.x, p1.y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(p2.x, p2.y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = el.closed ? '#22d3aa' : '#ff6b6b';
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    if (el.closed) ctx.lineTo(p2.x, p2.y);
    else ctx.lineTo(p1.x + ux * len * 0.3 + nx * 14, p1.y + uy * len * 0.3 + ny * 14);
    ctx.stroke();
  }

  _drawCurrentDots(a, b, current) {
    const ctx = this.ctx;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const dir = current >= 0 ? 1 : -1;
    const speed = Math.min(2.5, 0.15 + Math.abs(current) * 0.6);
    const nDots = Math.max(1, Math.round(len / 22));
    ctx.fillStyle = '#7dffcf';
    for (let k = 0; k < nDots; k++) {
      let t = ((k / nDots) + dir * this.clock * speed * 0.35) % 1;
      if (t < 0) t += 1;
      const x = a.x + dx * t, y = a.y + dy * t;
      ctx.beginPath();
      ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function getCss(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function formatCurrent(a) {
  const abs = Math.abs(a);
  if (abs < 1e-9) return '0 A';
  if (abs < 1) return `${(a * 1000).toFixed(1)} mA`;
  return `${a.toFixed(3)} A`;
}
function formatVoltage(v) {
  return `${v.toFixed(2)} V`;
}
function formatPower(p) {
  const abs = Math.abs(p);
  if (abs < 1) return `${(p * 1000).toFixed(1)} mW`;
  return `${p.toFixed(2)} W`;
}
