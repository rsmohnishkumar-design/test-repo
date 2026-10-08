// ===================================================================
// App shell — tab navigation, lazily instantiates each simulator the
// first time its tab is opened.
// ===================================================================

document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.panel');
  const sims = {};

  function activate(name) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    panels.forEach(p => p.classList.toggle('active', p.id === name));
    if (!sims[name]) {
      if (name === 'circuit') sims.circuit = new CircuitSim();
      if (name === 'projectile') sims.projectile = new ProjectileSim();
      if (name === 'pendulum') sims.pendulum = new PendulumSim();
      if (name === 'incline') sims.incline = new InclineSim();
      if (name === 'spring') sims.spring = new SpringSim();
    }
  }

  tabs.forEach(t => t.addEventListener('click', () => activate(t.dataset.tab)));

  // start with the circuit lab active (it doubles as the default demo)
  activate('circuit');
});
