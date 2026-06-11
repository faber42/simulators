// ============================================================
// links.js - Kabeltypen und Verbindungen
// ============================================================

export const LinkType = {
  ETHERNET: 'ethernet',  // Point-to-point (Stern)
  COAX: 'coax',          // Shared medium (Bus)
};

let linkIdCounter = 0;

/**
 * Point-to-point link between two devices (Ethernet / Stern-Topologie)
 */
export class EthernetLink {
  constructor(deviceA, deviceB) {
    this.id = linkIdCounter++;
    this.type = LinkType.ETHERNET;
    this.deviceA = deviceA;
    this.deviceB = deviceB;
    this.glow = 0;        // 0..1 how bright the cable is glowing
    this.glowColor = null; // color when active
    this.glowLabel = '';   // e.g. "TCP SYN"

    // Register on both devices
    deviceA.ports.push(this);
    deviceB.ports.push(this);
  }

  getOtherDevice(device) {
    if (device === this.deviceA) return this.deviceB;
    if (device === this.deviceB) return this.deviceA;
    return null;
  }

  hasDevice(device) {
    return this.deviceA === device || this.deviceB === device;
  }
}

/**
 * Bus segment - shared coax cable that multiple devices tap into.
 * Devices connect via T-connectors (stubs).
 */
export class BusSegment {
  constructor() {
    this.id = linkIdCounter++;
    this.type = LinkType.COAX;
    this.devices = [];     // devices attached to the bus, in order
    this.glow = 0;
    this.glowColor = null;
    this.glowLabel = '';
    this.y = 0;            // y position of the horizontal bus cable
    this.xStart = 0;
    this.xEnd = 0;
  }

  addDevice(device) {
    this.devices.push(device);
    device.ports.push(this);
    this.recalcLayout();
  }

  recalcLayout() {
    if (this.devices.length === 0) return;
    // Bus cable runs horizontally through device positions
    const xs = this.devices.map(d => d.x);
    this.xStart = Math.min(...xs) - 60;
    this.xEnd = Math.max(...xs) + 60;
    this.y = this.devices[0].y + 70; // bus below devices
  }

  getOtherDevice(device) {
    // On a bus, "other" means all other devices (shared medium)
    return null; // handled differently in simulation
  }

  getAllOtherDevices(device) {
    return this.devices.filter(d => d !== device);
  }

  hasDevice(device) {
    return this.devices.includes(device);
  }
}

export function resetLinkIds() {
  linkIdCounter = 0;
}
