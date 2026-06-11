// ============================================================
// devices.js - Netzwerk-Gerätetypen
// ============================================================

export const DeviceType = {
  WORKSTATION: 'workstation',
  SERVER: 'server',
  HUB: 'hub',
  SWITCH: 'switch',
  ROUTER: 'router',
};

const DEVICE_CONFIG = {
  [DeviceType.WORKSTATION]: {
    label: 'Workstation',
    color: '#00d2ff',
    radius: 24,
    layer: 'endpoint',
  },
  [DeviceType.SERVER]: {
    label: 'Server',
    color: '#6bcb77',
    radius: 26,
    layer: 'endpoint',
  },
  [DeviceType.HUB]: {
    label: 'Hub',
    color: '#ffd93d',
    radius: 28,
    layer: 1,
  },
  [DeviceType.SWITCH]: {
    label: 'Switch',
    color: '#7b2ff7',
    radius: 28,
    layer: 2,
  },
  [DeviceType.ROUTER]: {
    label: 'Router',
    color: '#ff6b6b',
    radius: 30,
    layer: 3,
  },
};

let macCounter = 0;

function generateMAC() {
  macCounter++;
  const b1 = ((macCounter >> 16) & 0xff).toString(16).padStart(2, '0');
  const b2 = ((macCounter >> 8) & 0xff).toString(16).padStart(2, '0');
  const b3 = (macCounter & 0xff).toString(16).padStart(2, '0');
  return `AA:BB:CC:${b1}:${b2}:${b3}`.toUpperCase();
}

let deviceIdCounter = 0;

export class Device {
  constructor(type, x, y, name) {
    this.id = deviceIdCounter++;
    this.type = type;
    this.config = DEVICE_CONFIG[type];
    this.x = x;
    this.y = y;
    this.name = name || `${this.config.label} ${this.id}`;
    this.mac = generateMAC();
    this.ip = null;
    this.subnet = null;
    this.gateway = null;
    this.ports = []; // links connected to this device
    this.activity = 0; // visual pulse 0..1
    this.pulsePhase = Math.random() * Math.PI * 2;

    // Switch-specific: MAC address table {mac -> portIndex}
    if (type === DeviceType.SWITCH) {
      this.macTable = {};
    }

    // Router-specific: routing table and interface IPs
    if (type === DeviceType.ROUTER) {
      this.routingTable = []; // {network, mask, nextHop, iface}
      this.interfaces = {};   // {portIndex -> {ip, subnet}}
    }
  }

  get r() {
    return this.config.radius;
  }

  get color() {
    return this.config.color;
  }

  get layer() {
    return this.config.layer;
  }

  isEndpoint() {
    return this.type === DeviceType.WORKSTATION || this.type === DeviceType.SERVER;
  }

  /**
   * Process incoming frame based on device type.
   * Returns array of {link, frame} to forward.
   */
  processFrame(frame, incomingLink) {
    this.activity = 1;
    const portIndex = this.ports.indexOf(incomingLink);

    if (this.type === DeviceType.HUB) {
      // Layer 1: flood to all ports except incoming
      return this.ports
        .filter((p, i) => i !== portIndex)
        .map(link => ({ link, frame: { ...frame } }));
    }

    if (this.type === DeviceType.SWITCH) {
      // Layer 2: learn source MAC, forward by dest MAC
      this.macTable[frame.srcMAC] = portIndex;

      if (frame.dstMAC === 'FF:FF:FF:FF:FF:FF') {
        // Broadcast: flood to all except incoming
        return this.ports
          .filter((p, i) => i !== portIndex)
          .map(link => ({ link, frame: { ...frame } }));
      }

      const destPort = this.macTable[frame.dstMAC];
      if (destPort !== undefined && this.ports[destPort]) {
        return [{ link: this.ports[destPort], frame: { ...frame } }];
      }
      // Unknown dest: flood
      return this.ports
        .filter((p, i) => i !== portIndex)
        .map(link => ({ link, frame: { ...frame } }));
    }

    if (this.type === DeviceType.ROUTER) {
      // Layer 3: check dest IP, rewrite MACs, forward
      const destIP = frame.dstIP;
      if (!destIP) return [];

      // Find matching route
      for (const route of this.routingTable) {
        if (ipInSubnet(destIP, route.network, route.mask)) {
          const outLink = this.ports[route.iface];
          if (outLink && outLink !== incomingLink) {
            const newFrame = { ...frame };
            // Rewrite MAC addresses for next hop
            newFrame.srcMAC = this.mac;
            const nextDevice = outLink.getOtherDevice(this);
            if (nextDevice) {
              newFrame.dstMAC = nextDevice.mac;
            }
            return [{ link: outLink, frame: newFrame }];
          }
        }
      }
      return [];
    }

    // Endpoints don't forward
    return [];
  }
}

function ipToNum(ip) {
  if (!ip) return 0;
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function ipInSubnet(ip, network, mask) {
  const ipNum = ipToNum(ip);
  const netNum = ipToNum(network);
  const maskNum = ipToNum(mask);
  return (ipNum & maskNum) === (netNum & maskNum);
}

export function resetDeviceIds() {
  deviceIdCounter = 0;
  macCounter = 0;
}
