// ============================================================
// scenarios.js - Vorgefertigte Demo-Netzwerke
// ============================================================

import { Device, DeviceType, resetDeviceIds } from './devices.js';
import { EthernetLink, BusSegment, resetLinkIds } from './links.js';

export const SCENARIOS = [
  {
    id: 'bus',
    name: 'Bus-Netzwerk (Koax)',
    desc: '4 Workstations am klassischen BNC-Koax-Bus — Shared Medium',
  },
  {
    id: 'star-hub',
    name: 'Stern mit Hub',
    desc: 'Hub verteilt Pakete an alle Ports (Layer 1 Broadcast)',
  },
  {
    id: 'star-switch',
    name: 'Stern mit Switch',
    desc: 'Switch lernt MAC-Adressen und leitet gezielt weiter (Layer 2)',
  },
  {
    id: 'internet',
    name: 'Internet-Simulation',
    desc: '2 Subnetze verbunden über Router — Hop-by-Hop Forwarding',
  },
];

export function loadScenario(id, canvasW, canvasH) {
  resetDeviceIds();
  resetLinkIds();

  const cx = canvasW / 2;
  const cy = canvasH / 2;

  switch (id) {
    case 'bus': return buildBusScenario(cx, cy);
    case 'star-hub': return buildStarHubScenario(cx, cy);
    case 'star-switch': return buildStarSwitchScenario(cx, cy);
    case 'internet': return buildInternetScenario(cx, cy);
    default: return { devices: [], links: [], buses: [] };
  }
}

function buildBusScenario(cx, cy) {
  const devices = [];
  const links = [];
  const buses = [];

  const bus = new BusSegment();

  const spacing = 120;
  const startX = cx - spacing * 1.5;

  for (let i = 0; i < 4; i++) {
    const ws = new Device(
      DeviceType.WORKSTATION,
      startX + i * spacing,
      cy - 60,
      `PC ${i + 1}`
    );
    ws.ip = `192.168.1.${10 + i}`;
    ws.subnet = '255.255.255.0';
    devices.push(ws);
    bus.addDevice(ws);
  }

  buses.push(bus);
  return { devices, links, buses };
}

function buildStarHubScenario(cx, cy) {
  const devices = [];
  const links = [];
  const buses = [];

  const hub = new Device(DeviceType.HUB, cx, cy, 'Hub 1');
  devices.push(hub);

  const count = 5;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    const dist = 160;
    const ws = new Device(
      DeviceType.WORKSTATION,
      cx + dist * Math.cos(angle),
      cy + dist * Math.sin(angle),
      `PC ${i + 1}`
    );
    ws.ip = `192.168.1.${10 + i}`;
    ws.subnet = '255.255.255.0';
    devices.push(ws);
    links.push(new EthernetLink(hub, ws));
  }

  return { devices, links, buses };
}

function buildStarSwitchScenario(cx, cy) {
  const devices = [];
  const links = [];
  const buses = [];

  const sw = new Device(DeviceType.SWITCH, cx, cy, 'Switch 1');
  devices.push(sw);

  const positions = [
    { x: cx - 180, y: cy - 120 },
    { x: cx + 180, y: cy - 120 },
    { x: cx - 180, y: cy + 120 },
    { x: cx + 180, y: cy + 120 },
  ];

  // 3 workstations + 1 server
  for (let i = 0; i < 3; i++) {
    const ws = new Device(
      DeviceType.WORKSTATION,
      positions[i].x,
      positions[i].y,
      `PC ${i + 1}`
    );
    ws.ip = `192.168.1.${10 + i}`;
    ws.subnet = '255.255.255.0';
    devices.push(ws);
    links.push(new EthernetLink(sw, ws));
  }

  const srv = new Device(
    DeviceType.SERVER,
    positions[3].x,
    positions[3].y,
    'Webserver'
  );
  srv.ip = '192.168.1.100';
  srv.subnet = '255.255.255.0';
  devices.push(srv);
  links.push(new EthernetLink(sw, srv));

  return { devices, links, buses };
}

function buildInternetScenario(cx, cy) {
  const devices = [];
  const links = [];
  const buses = [];

  // Scale factor based on canvas width
  const scale = Math.min(1, cx / 350);
  const sx = 160 * scale;  // horizontal spacing
  const sy = 75 * scale;   // vertical spacing

  // Left subnet: Switch + 2 Workstations
  const sw1 = new Device(DeviceType.SWITCH, cx - sx * 1.1, cy, 'Switch 1');
  devices.push(sw1);

  const pc1 = new Device(DeviceType.WORKSTATION, cx - sx * 1.8, cy - sy, 'Client A');
  pc1.ip = '192.168.1.10';
  pc1.subnet = '255.255.255.0';
  pc1.gateway = '192.168.1.1';
  devices.push(pc1);
  links.push(new EthernetLink(sw1, pc1));

  const pc2 = new Device(DeviceType.WORKSTATION, cx - sx * 1.8, cy + sy, 'Client B');
  pc2.ip = '192.168.1.11';
  pc2.subnet = '255.255.255.0';
  pc2.gateway = '192.168.1.1';
  devices.push(pc2);
  links.push(new EthernetLink(sw1, pc2));

  // Left router
  const r1 = new Device(DeviceType.ROUTER, cx - sx * 0.35, cy, 'Router 1');
  r1.ip = '192.168.1.1';
  devices.push(r1);
  links.push(new EthernetLink(sw1, r1));

  // Right router
  const r2 = new Device(DeviceType.ROUTER, cx + sx * 0.35, cy, 'Router 2');
  r2.ip = '172.16.0.1';
  devices.push(r2);
  links.push(new EthernetLink(r1, r2));

  // Right subnet: Switch + Server
  const sw2 = new Device(DeviceType.SWITCH, cx + sx * 1.1, cy, 'Switch 2');
  devices.push(sw2);
  links.push(new EthernetLink(r2, sw2));

  const srv = new Device(DeviceType.SERVER, cx + sx * 1.8, cy - sy, 'Webserver');
  srv.ip = '172.16.0.10';
  srv.subnet = '255.255.255.0';
  devices.push(srv);
  links.push(new EthernetLink(sw2, srv));

  const srv2 = new Device(DeviceType.SERVER, cx + sx * 1.8, cy + sy, 'DB Server');
  srv2.ip = '172.16.0.11';
  srv2.subnet = '255.255.255.0';
  devices.push(srv2);
  links.push(new EthernetLink(sw2, srv2));

  // Setup routing tables
  r1.routingTable = [
    { network: '192.168.1.0', mask: '255.255.255.0', nextHop: null, iface: 0 }, // port 0 = sw1
    { network: '172.16.0.0', mask: '255.255.0.0', nextHop: '10.0.0.2', iface: 1 }, // port 1 = r2
    { network: '0.0.0.0', mask: '0.0.0.0', nextHop: '10.0.0.2', iface: 1 }, // default
  ];

  r2.routingTable = [
    { network: '172.16.0.0', mask: '255.255.0.0', nextHop: null, iface: 1 }, // port 1 = sw2
    { network: '192.168.1.0', mask: '255.255.255.0', nextHop: '10.0.0.1', iface: 0 }, // port 0 = r1
    { network: '0.0.0.0', mask: '0.0.0.0', nextHop: '10.0.0.1', iface: 0 }, // default
  ];

  return { devices, links, buses };
}
