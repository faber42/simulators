// ============================================================
// main.js - App Bootstrap, Render Loop, Event Handling
// ============================================================

import { Device, DeviceType } from './devices.js';
import { EthernetLink, BusSegment } from './links.js';
import { SimulationEngine } from './frames.js';
import { Renderer } from './renderer.js';
import { SCENARIOS, loadScenario } from './scenarios.js';
import { runWebPageFetch, runPing } from './protocols.js';

// ---- State ----
let devices = [];
let links = [];
let buses = [];
let engine = new SimulationEngine();
let renderer;

let mode = 'select';          // select, workstation, server, hub, switch, router, connect-eth, connect-bus
let selectedDevice = null;
let hoveredDevice = null;
let dragDevice = null;
let dragOffset = { x: 0, y: 0 };
let connectFrom = null;       // first device when connecting
let activeBus = null;         // bus being built
let busDevices = [];           // devices to put on a bus

// For protocol simulations - pick source & target
let protoMode = null;         // 'http' or 'ping'
let protoSource = null;

// ---- Init ----
export function init() {
  const canvas = document.getElementById('canvas');
  const container = document.getElementById('canvas-container');
  renderer = new Renderer(canvas);

  window.addEventListener('resize', () => {
    renderer.resize();
  });

  // Setup event handlers
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('dblclick', onDblClick);

  // Engine log callback
  engine.onLog = (entry) => {
    addLogEntry(entry);
  };

  // Toolbar buttons
  setupToolbar();
  setupScenarioMenu();

  // Speed slider
  const speedSlider = document.getElementById('speed-slider');
  if (speedSlider) {
    speedSlider.addEventListener('input', (e) => {
      engine.speed = parseFloat(e.target.value);
      document.getElementById('speed-value').textContent = engine.speed.toFixed(1) + 'x';
    });
  }

  // Load default scenario
  loadScenarioById('star-switch');

  // Start render loop
  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // Update simulation
    engine.update(dt);

    // Decay device activity
    for (const d of devices) {
      d.activity *= 0.95;
    }

    // Render
    renderer.update(dt);
    renderer.clear();

    // Draw buses
    for (const bus of buses) {
      const glow = engine.getLinkGlow(bus);
      renderer.drawBusSegment(bus, glow);
    }

    // Draw ethernet links
    for (const link of links) {
      const glow = engine.getLinkGlow(link);
      renderer.drawEthernetLink(link, glow);
    }

    // Draw devices
    for (const dev of devices) {
      renderer.drawDevice(dev, dev === selectedDevice, dev === hoveredDevice);
    }

    // Update stats
    updateStats();

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

// ---- Toolbar ----
function setupToolbar() {
  const buttons = {
    'btn-select': 'select',
    'btn-workstation': 'workstation',
    'btn-server': 'server',
    'btn-hub': 'hub',
    'btn-switch': 'switch',
    'btn-router': 'router',
    'btn-connect-eth': 'connect-eth',
    'btn-connect-bus': 'connect-bus',
  };

  for (const [id, m] of Object.entries(buttons)) {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => {
        setMode(m);
      });
    }
  }

  // Action buttons
  document.getElementById('btn-http')?.addEventListener('click', () => {
    mode = 'select';
    connectFrom = null;
    busDevices = [];
    protoMode = 'http';
    protoSource = null;
    document.querySelectorAll('.toolbar button').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-http').classList.add('active');
    showStatus('Klicke den Client, dann den Server für HTTP-Abruf');
  });

  document.getElementById('btn-ping')?.addEventListener('click', () => {
    mode = 'select';
    connectFrom = null;
    busDevices = [];
    protoMode = 'ping';
    protoSource = null;
    document.querySelectorAll('.toolbar button').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-ping').classList.add('active');
    showStatus('Klicke Quell-Gerät, dann Ziel-Gerät für Ping');
  });

  document.getElementById('btn-reset')?.addEventListener('click', () => {
    engine.reset();
    clearLog();
    showStatus('Simulation zurückgesetzt');
  });

  document.getElementById('btn-clear')?.addEventListener('click', () => {
    devices = [];
    links = [];
    buses = [];
    engine.reset();
    selectedDevice = null;
    clearLog();
    showStatus('Alles gelöscht');
  });
}

function setMode(m) {
  mode = m;
  connectFrom = null;
  busDevices = [];
  protoMode = null;
  protoSource = null;

  // Update active button
  document.querySelectorAll('.toolbar button').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('btn-' + m);
  if (btn) btn.classList.add('active');

  const labels = {
    'select': 'Auswählen / Verschieben',
    'workstation': 'Workstation platzieren (Klick)',
    'server': 'Server platzieren (Klick)',
    'hub': 'Hub platzieren (Klick)',
    'switch': 'Switch platzieren (Klick)',
    'router': 'Router platzieren (Klick)',
    'connect-eth': 'Ethernet: Klicke 2 Geräte zum Verbinden',
    'connect-bus': 'Koax-Bus: Klicke Geräte, dann Doppelklick zum Abschließen',
  };
  showStatus(labels[m] || '');
}

function setupScenarioMenu() {
  const menu = document.getElementById('scenario-menu');
  if (!menu) return;

  for (const sc of SCENARIOS) {
    const btn = document.createElement('button');
    btn.className = 'scenario-btn';
    btn.innerHTML = `<strong>${sc.name}</strong><span>${sc.desc}</span>`;
    btn.addEventListener('click', () => {
      loadScenarioById(sc.id);
    });
    menu.appendChild(btn);
  }
}

function loadScenarioById(id) {
  engine.reset();
  clearLog();
  const result = loadScenario(id, renderer.W, renderer.H);
  devices = result.devices;
  links = result.links;
  buses = result.buses;
  selectedDevice = null;
  showStatus(`Szenario geladen: ${SCENARIOS.find(s => s.id === id)?.name || id}`);
}

// ---- Mouse Events ----
function getDeviceAt(mx, my) {
  for (let i = devices.length - 1; i >= 0; i--) {
    const d = devices[i];
    if (Math.hypot(mx - d.x, my - d.y) < d.r + 8) return d;
  }
  return null;
}

function getCanvasPos(e) {
  const rect = renderer.canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function onMouseDown(e) {
  const { x, y } = getCanvasPos(e);
  const dev = getDeviceAt(x, y);

  // Protocol mode: select source and target
  if (protoMode && dev) {
    if (!protoSource) {
      protoSource = dev;
      selectedDevice = dev;
      showStatus(`Quelle: ${dev.name} — jetzt Ziel anklicken`);
      return;
    } else {
      // Run protocol
      if (protoMode === 'http') {
        runWebPageFetch(protoSource, dev, engine, devices);
        showStatus(`HTTP-Abruf: ${protoSource.name} → ${dev.name}`);
      } else if (protoMode === 'ping') {
        runPing(protoSource, dev, engine);
        showStatus(`Ping: ${protoSource.name} → ${dev.name}`);
      }
      protoMode = null;
      protoSource = null;
      selectedDevice = null;
      return;
    }
  }

  if (mode === 'select') {
    if (dev) {
      selectedDevice = dev;
      dragDevice = dev;
      dragOffset.x = x - dev.x;
      dragOffset.y = y - dev.y;
      showDeviceInfo(dev);
    } else {
      selectedDevice = null;
      hideDeviceInfo();
    }
    return;
  }

  // Place device modes
  const placeTypes = {
    'workstation': DeviceType.WORKSTATION,
    'server': DeviceType.SERVER,
    'hub': DeviceType.HUB,
    'switch': DeviceType.SWITCH,
    'router': DeviceType.ROUTER,
  };

  if (placeTypes[mode] && !dev) {
    const newDev = new Device(placeTypes[mode], x, y);
    // Auto-assign IP for endpoints
    if (newDev.isEndpoint() || newDev.type === DeviceType.ROUTER) {
      const count = devices.filter(d => d.ip).length;
      newDev.ip = `192.168.1.${10 + count}`;
      newDev.subnet = '255.255.255.0';
    }
    devices.push(newDev);
    selectedDevice = newDev;
    showDeviceInfo(newDev);
    return;
  }

  // Connect ethernet
  if (mode === 'connect-eth' && dev) {
    if (!connectFrom) {
      connectFrom = dev;
      selectedDevice = dev;
      showStatus(`Ethernet: ${dev.name} ausgewählt — jetzt zweites Gerät klicken`);
    } else if (dev !== connectFrom) {
      // Check no duplicate
      const exists = links.some(l =>
        (l.deviceA === connectFrom && l.deviceB === dev) ||
        (l.deviceA === dev && l.deviceB === connectFrom)
      );
      if (!exists) {
        links.push(new EthernetLink(connectFrom, dev));
        showStatus(`Verbunden: ${connectFrom.name} ↔ ${dev.name}`);
      }
      connectFrom = null;
      selectedDevice = null;
    }
    return;
  }

  // Connect bus
  if (mode === 'connect-bus' && dev) {
    if (!busDevices.includes(dev)) {
      busDevices.push(dev);
      showStatus(`Bus: ${busDevices.length} Geräte ausgewählt — Doppelklick zum Abschließen`);
    }
    return;
  }
}

function onMouseMove(e) {
  const { x, y } = getCanvasPos(e);
  hoveredDevice = getDeviceAt(x, y);
  renderer.canvas.style.cursor = hoveredDevice ? 'pointer' : (mode === 'select' ? 'default' : 'crosshair');

  if (dragDevice) {
    dragDevice.x = x - dragOffset.x;
    dragDevice.y = y - dragOffset.y;
  }
}

function onMouseUp() {
  dragDevice = null;
}

function onDblClick(e) {
  // Finalize bus creation
  if (mode === 'connect-bus' && busDevices.length >= 2) {
    const bus = new BusSegment();
    for (const dev of busDevices) {
      bus.addDevice(dev);
    }
    buses.push(bus);
    showStatus(`Koax-Bus erstellt mit ${busDevices.length} Geräten`);
    busDevices = [];
    return;
  }
}

// ---- UI Updates ----
function updateStats() {
  const el = (id, val) => {
    const e = document.getElementById(id);
    if (e) e.textContent = val;
  };
  el('stat-nodes', devices.length);
  el('stat-links', links.length + buses.length);
  el('stat-signals', engine.signals.length);
  el('stat-time', engine.simTime.toFixed(1) + 's');
}

function showStatus(msg) {
  const el = document.getElementById('status-bar');
  if (el) el.textContent = msg;
}

function addLogEntry(entry) {
  const log = document.getElementById('packet-log');
  if (!log) return;

  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `
    <span class="log-time">[${entry.time.toFixed(2)}s]</span>
    <span class="log-label" style="color:${entry.color}">${entry.label}</span>
    <span class="log-detail">${entry.srcIP} → ${entry.dstIP}</span>
  `;
  log.prepend(div);

  // Limit entries
  while (log.children.length > 100) {
    log.removeChild(log.lastChild);
  }
}

function clearLog() {
  const log = document.getElementById('packet-log');
  if (log) log.innerHTML = '';
}

function showDeviceInfo(dev) {
  const panel = document.getElementById('device-info');
  if (!panel) return;
  panel.style.display = 'block';

  let html = `
    <h4 style="color:${dev.color}">${dev.name}</h4>
    <div class="info-row"><span>Typ:</span><span>${dev.config.label}</span></div>
    <div class="info-row"><span>MAC:</span><span>${dev.mac}</span></div>
    <div class="info-row"><span>IP:</span><span>${dev.ip || '—'}</span></div>
    <div class="info-row"><span>Ports:</span><span>${dev.ports.length}</span></div>
  `;

  if (dev.type === DeviceType.SWITCH && dev.macTable) {
    html += '<h5>MAC-Tabelle</h5>';
    const entries = Object.entries(dev.macTable);
    if (entries.length === 0) {
      html += '<div class="info-row"><span>leer</span></div>';
    }
    for (const [mac, port] of entries) {
      html += `<div class="info-row"><span>${mac}</span><span>Port ${port}</span></div>`;
    }
  }

  if (dev.type === DeviceType.ROUTER && dev.routingTable) {
    html += '<h5>Routing-Tabelle</h5>';
    for (const route of dev.routingTable) {
      html += `<div class="info-row"><span>${route.network}/${route.mask}</span><span>→ iface ${route.iface}</span></div>`;
    }
  }

  panel.innerHTML = html;
}

function hideDeviceInfo() {
  const panel = document.getElementById('device-info');
  if (panel) panel.style.display = 'none';
}

// ---- Boot ----
document.addEventListener('DOMContentLoaded', init);
