// ============================================================
// frames.js - Frame/Paket-Modell und Signalausbreitung
// ============================================================

import { LinkType } from './links.js';

// Frame-Typ Farben
export const PROTOCOL_COLORS = {
  'ARP':       '#ff9f43',
  'TCP SYN':   '#00d2ff',
  'TCP SYN-ACK': '#0abde3',
  'TCP ACK':   '#6bcb77',
  'TCP FIN':   '#a29bfe',
  'TCP RST':   '#ff0000',
  'TLS':       '#ffd93d',
  'HTTP REQ':  '#ff6b6b',
  'HTTP RES':  '#ee5a24',
  'ICMP':      '#00cec9',
  'DEFAULT':   '#636e72',
};

export function getFrameColor(frame) {
  if (frame.protocol === 'TCP') {
    return PROTOCOL_COLORS['TCP ' + frame.flags] || PROTOCOL_COLORS['DEFAULT'];
  }
  if (frame.protocol === 'TLS') return PROTOCOL_COLORS['TLS'];
  if (frame.protocol === 'HTTP') {
    return frame.flags === 'REQUEST' ? PROTOCOL_COLORS['HTTP REQ'] : PROTOCOL_COLORS['HTTP RES'];
  }
  if (frame.protocol === 'ARP') return PROTOCOL_COLORS['ARP'];
  if (frame.protocol === 'ICMP') return PROTOCOL_COLORS['ICMP'];
  return PROTOCOL_COLORS['DEFAULT'];
}

export function getFrameLabel(frame) {
  if (frame.protocol === 'TCP') return `TCP ${frame.flags}`;
  if (frame.protocol === 'TLS') return `TLS ${frame.flags}`;
  if (frame.protocol === 'HTTP') return frame.payload || `HTTP ${frame.flags}`;
  if (frame.protocol === 'ARP') return `ARP ${frame.flags}`;
  if (frame.protocol === 'ICMP') return `ICMP ${frame.flags}`;
  return frame.protocol || 'DATA';
}

/**
 * Represents a frame being transmitted on the network.
 */
export class Frame {
  constructor(opts = {}) {
    this.srcMAC = opts.srcMAC || '00:00:00:00:00:00';
    this.dstMAC = opts.dstMAC || 'FF:FF:FF:FF:FF:FF';
    this.srcIP = opts.srcIP || '';
    this.dstIP = opts.dstIP || '';
    this.protocol = opts.protocol || '';
    this.flags = opts.flags || '';
    this.payload = opts.payload || '';
    this.size = opts.size || 64; // bytes, affects glow duration
    this.seqNum = opts.seqNum || 0;
  }

  get glowDuration() {
    // Larger frames glow longer — make it clearly visible
    return 0.6 + (this.size / 1500) * 1.2;
  }

  get color() {
    return getFrameColor(this);
  }

  get label() {
    return getFrameLabel(this);
  }
}

/**
 * An active signal on a link - the cable is "lit up"
 */
export class Signal {
  constructor(link, frame, sender, direction) {
    this.link = link;
    this.frame = frame;
    this.sender = sender;
    this.direction = direction; // 'AtoB', 'BtoA', or 'broadcast' (for bus)
    this.progress = 0;   // 0..1 propagation across cable
    this.duration = frame.glowDuration || (0.6 + ((frame.size || 64) / 1500) * 1.2);
    this.elapsed = 0;
    this.delivered = false;
    this.color = frame.color || getFrameColor(frame);
    this.label = frame.label || getFrameLabel(frame);
  }

  update(dt) {
    this.elapsed += dt;
    // Signal propagates quickly then stays lit for duration
    this.progress = Math.min(1, this.elapsed / 0.1); // propagation takes 0.1s
    if (this.elapsed >= this.duration) {
      this.delivered = true;
    }
  }

  get glowIntensity() {
    // Quick ramp up, hold, then fade out
    const fadeStart = this.duration * 0.7;
    if (this.elapsed < 0.05) {
      return this.elapsed / 0.05; // ramp up
    }
    if (this.elapsed > fadeStart) {
      return 1 - (this.elapsed - fadeStart) / (this.duration - fadeStart);
    }
    return 1;
  }
}

/**
 * The simulation engine manages signal propagation and device processing.
 */
export class SimulationEngine {
  constructor() {
    this.signals = [];
    this.eventQueue = []; // {time, callback}
    this.simTime = 0;
    this.speed = 1.0;
    this.packetLog = [];  // {time, srcIP, dstIP, label, color}
    this.onLog = null;    // callback for new log entries
  }

  /**
   * Send a frame from a device onto a specific link.
   */
  sendFrame(sender, link, frame) {
    // Use standalone functions in case frame is a plain object (spread copy from switch/router)
    const color = frame.color || getFrameColor(frame);
    const label = frame.label || getFrameLabel(frame);

    // Log it
    const logEntry = {
      time: this.simTime,
      srcIP: frame.srcIP || sender.ip || sender.mac,
      dstIP: frame.dstIP || frame.dstMAC,
      label,
      color,
      srcName: sender.name,
    };
    this.packetLog.push(logEntry);
    if (this.onLog) this.onLog(logEntry);

    if (link.type === 'coax') {
      // Bus: entire segment lights up
      const signal = new Signal(link, frame, sender, 'broadcast');
      this.signals.push(signal);

      // After propagation, all other devices on bus receive the frame
      this.scheduleEvent(frame.glowDuration * 0.8, () => {
        const otherDevices = link.getAllOtherDevices(sender);
        for (const dev of otherDevices) {
          dev.activity = 1;
          if (dev.isEndpoint()) {
            // Check if frame is for this device
            if (frame.dstMAC === dev.mac || frame.dstMAC === 'FF:FF:FF:FF:FF:FF') {
              this.deliverToEndpoint(dev, frame);
            }
          } else {
            // Infrastructure device: process and potentially forward
            const forwards = dev.processFrame(frame, link);
            for (const fwd of forwards) {
              this.scheduleEvent(0.15, () => {
                this.sendFrame(dev, fwd.link, fwd.frame);
              });
            }
          }
        }
      });
    } else {
      // Ethernet point-to-point
      const receiver = link.getOtherDevice(sender);
      const direction = link.deviceA === sender ? 'AtoB' : 'BtoA';
      const signal = new Signal(link, frame, sender, direction);
      this.signals.push(signal);

      // After propagation, receiver gets the frame
      this.scheduleEvent(frame.glowDuration * 0.8, () => {
        if (!receiver) return;
        receiver.activity = 1;

        if (receiver.isEndpoint()) {
          if (frame.dstMAC === receiver.mac || frame.dstMAC === 'FF:FF:FF:FF:FF:FF') {
            this.deliverToEndpoint(receiver, frame);
          }
        } else {
          const forwards = receiver.processFrame(frame, link);
          for (const fwd of forwards) {
            this.scheduleEvent(0.15, () => {
              this.sendFrame(receiver, fwd.link, fwd.frame);
            });
          }
        }
      });
    }
  }

  deliverToEndpoint(device, frame) {
    // Trigger protocol handler if registered
    if (device._onFrameReceived) {
      device._onFrameReceived(frame);
    }
  }

  scheduleEvent(delay, callback) {
    this.eventQueue.push({
      time: this.simTime + delay / this.speed,
      callback,
    });
    this.eventQueue.sort((a, b) => a.time - b.time);
  }

  update(dt) {
    dt *= this.speed;
    this.simTime += dt;

    // Update signals
    for (let i = this.signals.length - 1; i >= 0; i--) {
      this.signals[i].update(dt);
      if (this.signals[i].delivered && this.signals[i].glowIntensity <= 0) {
        this.signals.splice(i, 1);
      }
    }

    // Process event queue
    while (this.eventQueue.length > 0 && this.eventQueue[0].time <= this.simTime) {
      const event = this.eventQueue.shift();
      event.callback();
    }
  }

  /**
   * Get the current glow state for a link.
   * Returns {intensity, color, label} or null.
   */
  getLinkGlow(link) {
    let maxIntensity = 0;
    let color = null;
    let label = '';
    for (const sig of this.signals) {
      if (sig.link === link) {
        const intensity = sig.glowIntensity;
        if (intensity > maxIntensity) {
          maxIntensity = intensity;
          color = sig.color;
          label = sig.label;
        }
      }
    }
    if (maxIntensity > 0) {
      return { intensity: maxIntensity, color, label };
    }
    return null;
  }

  reset() {
    this.signals = [];
    this.eventQueue = [];
    this.simTime = 0;
    this.packetLog = [];
  }
}
