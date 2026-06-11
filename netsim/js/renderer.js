// ============================================================
// renderer.js - Canvas-Zeichenlogik
// ============================================================

import { DeviceType } from './devices.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = 0;
    this.H = 0;
    this.time = 0;
    this.resize();
  }

  resize() {
    this.W = this.canvas.width = this.canvas.parentElement.clientWidth;
    this.H = this.canvas.height = this.canvas.parentElement.clientHeight;
  }

  clear() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);

    // Subtle grid
    ctx.strokeStyle = '#151525';
    ctx.lineWidth = 1;
    for (let x = 0; x < this.W; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.H);
      ctx.stroke();
    }
    for (let y = 0; y < this.H; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.W, y);
      ctx.stroke();
    }
  }

  // ---- LINKS ----

  drawEthernetLink(link, glow) {
    const ctx = this.ctx;
    const a = link.deviceA;
    const b = link.deviceB;

    // Base cable
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = '#2a2a3a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Glow overlay when signal is present
    if (glow) {
      const intensity = glow.intensity;
      ctx.save();

      // Wide outer glow
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = glow.color;
      ctx.lineWidth = 16 + intensity * 16;
      ctx.globalAlpha = intensity * 0.15;
      ctx.shadowColor = glow.color;
      ctx.shadowBlur = 40 * intensity;
      ctx.stroke();

      // Thick glow
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = glow.color;
      ctx.lineWidth = 6 + intensity * 8;
      ctx.globalAlpha = intensity * 0.5;
      ctx.shadowColor = glow.color;
      ctx.shadowBlur = 25 * intensity;
      ctx.stroke();

      // Core bright line
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 + intensity * 2;
      ctx.globalAlpha = intensity * 0.9;
      ctx.shadowColor = glow.color;
      ctx.shadowBlur = 15 * intensity;
      ctx.stroke();

      ctx.restore();

      // Label on cable
      if (glow.label) {
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        this.drawCableLabel(mx, my - 14, glow.label, glow.color, intensity);
      }
    }
  }

  drawBusSegment(bus, glow) {
    const ctx = this.ctx;
    bus.recalcLayout();

    const y = bus.y;
    const xStart = bus.xStart;
    const xEnd = bus.xEnd;

    // Main coax cable (thick)
    ctx.beginPath();
    ctx.moveTo(xStart, y);
    ctx.lineTo(xEnd, y);
    ctx.strokeStyle = '#4a3a2a';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Inner conductor
    ctx.beginPath();
    ctx.moveTo(xStart, y);
    ctx.lineTo(xEnd, y);
    ctx.strokeStyle = '#6a5a4a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Terminators at ends
    this.drawTerminator(xStart, y);
    this.drawTerminator(xEnd, y);

    // T-connectors (stubs to each device)
    for (const dev of bus.devices) {
      ctx.beginPath();
      ctx.moveTo(dev.x, dev.y + dev.r);
      ctx.lineTo(dev.x, y);
      ctx.strokeStyle = '#4a3a2a';
      ctx.lineWidth = 3;
      ctx.stroke();

      // T-piece at junction
      ctx.beginPath();
      ctx.arc(dev.x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#8a7a6a';
      ctx.fill();
      ctx.strokeStyle = '#6a5a4a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Glow when signal present
    if (glow) {
      const intensity = glow.intensity;
      ctx.save();

      // Wide outer glow on entire bus
      ctx.beginPath();
      ctx.moveTo(xStart, y);
      ctx.lineTo(xEnd, y);
      ctx.strokeStyle = glow.color;
      ctx.lineWidth = 20 + intensity * 20;
      ctx.globalAlpha = intensity * 0.15;
      ctx.shadowColor = glow.color;
      ctx.shadowBlur = 50 * intensity;
      ctx.stroke();

      // Entire bus lights up
      ctx.beginPath();
      ctx.moveTo(xStart, y);
      ctx.lineTo(xEnd, y);
      ctx.strokeStyle = glow.color;
      ctx.lineWidth = 8 + intensity * 10;
      ctx.globalAlpha = intensity * 0.5;
      ctx.shadowColor = glow.color;
      ctx.shadowBlur = 30 * intensity;
      ctx.stroke();

      // Core bright line
      ctx.beginPath();
      ctx.moveTo(xStart, y);
      ctx.lineTo(xEnd, y);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.globalAlpha = intensity * 0.9;
      ctx.shadowColor = glow.color;
      ctx.shadowBlur = 15 * intensity;
      ctx.stroke();

      // Stubs also glow brightly
      for (const dev of bus.devices) {
        ctx.beginPath();
        ctx.moveTo(dev.x, dev.y + dev.r);
        ctx.lineTo(dev.x, y);
        ctx.strokeStyle = glow.color;
        ctx.lineWidth = 6 + intensity * 6;
        ctx.globalAlpha = intensity * 0.4;
        ctx.shadowColor = glow.color;
        ctx.shadowBlur = 25 * intensity;
        ctx.stroke();

        // Bright core on stub
        ctx.beginPath();
        ctx.moveTo(dev.x, dev.y + dev.r);
        ctx.lineTo(dev.x, y);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = intensity * 0.8;
        ctx.shadowBlur = 10 * intensity;
        ctx.stroke();
      }

      ctx.restore();

      // Label
      if (glow.label) {
        const mx = (xStart + xEnd) / 2;
        this.drawCableLabel(mx, y - 18, glow.label, glow.color, intensity);
      }
    }
  }

  drawTerminator(x, y) {
    const ctx = this.ctx;
    ctx.fillStyle = '#8a7a6a';
    ctx.fillRect(x - 4, y - 8, 8, 16);
    ctx.strokeStyle = '#6a5a4a';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 4, y - 8, 8, 16);
  }

  drawCableLabel(x, y, text, color, intensity) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.min(1, intensity * 1.2);
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Background pill
    const metrics = ctx.measureText(text);
    const pw = metrics.width + 12;
    const ph = 16;
    ctx.fillStyle = '#0a0a1a';
    ctx.globalAlpha = Math.min(0.9, intensity);
    ctx.beginPath();
    ctx.roundRect(x - pw / 2, y - ph / 2, pw, ph, 4);
    ctx.fill();

    // Text
    ctx.globalAlpha = Math.min(1, intensity * 1.2);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ---- DEVICES ----

  drawDevice(device, isSelected, isHovered) {
    const ctx = this.ctx;
    const { x, y, r, color, type, name, activity } = device;
    const pulse = 1 + 0.05 * Math.sin(this.time * 2 + device.pulsePhase) + activity * 0.15;
    const rr = r * pulse;

    // Outer glow
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, rr * 1.6, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(x, y, rr * 0.5, x, y, rr * 1.6);
    grad.addColorStop(0, color + '20');
    grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.fill();

    // Activity burst
    if (activity > 0.1) {
      ctx.beginPath();
      ctx.arc(x, y, rr * (1.5 + activity * 0.5), 0, Math.PI * 2);
      const grad2 = ctx.createRadialGradient(x, y, rr, x, y, rr * (1.5 + activity * 0.5));
      grad2.addColorStop(0, color + Math.floor(activity * 40).toString(16).padStart(2, '0'));
      grad2.addColorStop(1, color + '00');
      ctx.fillStyle = grad2;
      ctx.fill();
    }

    // Device body
    ctx.beginPath();
    if (type === DeviceType.ROUTER) {
      // Octagon shape
      this.drawOctagon(x, y, rr);
    } else if (type === DeviceType.SWITCH) {
      // Rounded square
      ctx.roundRect(x - rr, y - rr * 0.8, rr * 2, rr * 1.6, 6);
    } else if (type === DeviceType.HUB) {
      // Circle
      ctx.arc(x, y, rr, 0, Math.PI * 2);
    } else {
      // Workstation/Server: rectangle with screen shape
      ctx.roundRect(x - rr, y - rr * 0.75, rr * 2, rr * 1.5, 4);
    }

    ctx.fillStyle = '#0d0d1f';
    ctx.fill();
    ctx.strokeStyle = isSelected ? '#fff' : (isHovered ? '#ccc' : color);
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.stroke();
    ctx.restore();

    // Device icon inside
    this.drawDeviceIcon(x, y, rr, type, color);

    // Name label below
    ctx.save();
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#888';
    ctx.fillText(name, x, y + rr + 6);
    ctx.restore();

    // IP label
    if (device.ip) {
      ctx.save();
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#555';
      ctx.fillText(device.ip, x, y + rr + 18);
      ctx.restore();
    }

    // Selection ring
    if (isSelected) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, rr + 8, 0, Math.PI * 2);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#ffd93d';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  drawOctagon(cx, cy, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8 - Math.PI / 8;
      const px = cx + r * Math.cos(angle);
      const py = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  drawDeviceIcon(x, y, r, type, color) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    const s = r * 0.4; // icon scale

    if (type === DeviceType.WORKSTATION) {
      // Monitor icon
      ctx.strokeRect(x - s, y - s * 0.7, s * 2, s * 1.2);
      ctx.beginPath();
      ctx.moveTo(x - s * 0.4, y + s * 0.5);
      ctx.lineTo(x - s * 0.6, y + s * 0.9);
      ctx.lineTo(x + s * 0.6, y + s * 0.9);
      ctx.lineTo(x + s * 0.4, y + s * 0.5);
      ctx.stroke();
    } else if (type === DeviceType.SERVER) {
      // Rack icon (stacked boxes)
      for (let i = 0; i < 3; i++) {
        const sy = y - s + i * s * 0.7;
        ctx.strokeRect(x - s, sy, s * 2, s * 0.6);
        // LED dot
        ctx.beginPath();
        ctx.arc(x + s * 0.7, sy + s * 0.3, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === DeviceType.HUB) {
      // Radiating lines from center
      ctx.beginPath();
      ctx.arc(x, y, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 * i) / 6;
        ctx.beginPath();
        ctx.moveTo(x + s * 0.4 * Math.cos(angle), y + s * 0.4 * Math.sin(angle));
        ctx.lineTo(x + s * 0.9 * Math.cos(angle), y + s * 0.9 * Math.sin(angle));
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x + s * 0.9 * Math.cos(angle), y + s * 0.9 * Math.sin(angle), 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (type === DeviceType.SWITCH) {
      // Cross/grid pattern
      ctx.beginPath();
      ctx.moveTo(x - s, y);
      ctx.lineTo(x + s, y);
      ctx.moveTo(x, y - s * 0.6);
      ctx.lineTo(x, y + s * 0.6);
      ctx.stroke();
      // Arrow tips
      const arrows = [
        [x + s, y, 0],
        [x - s, y, Math.PI],
        [x, y - s * 0.6, -Math.PI / 2],
        [x, y + s * 0.6, Math.PI / 2],
      ];
      for (const [ax, ay, angle] of arrows) {
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-5, -3);
        ctx.lineTo(-5, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    } else if (type === DeviceType.ROUTER) {
      // Globe with arrows
      ctx.beginPath();
      ctx.arc(x, y, s * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(x - s * 0.6, y);
      ctx.lineTo(x + s * 0.6, y);
      ctx.stroke();
      // Vertical ellipse
      ctx.beginPath();
      ctx.ellipse(x, y, s * 0.25, s * 0.6, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Arrows at cardinal directions
      const arrowDist = s * 0.9;
      for (let i = 0; i < 4; i++) {
        const angle = (Math.PI / 2) * i;
        const ax = x + arrowDist * Math.cos(angle);
        const ay = y + arrowDist * Math.sin(angle);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-4, -3);
        ctx.lineTo(-4, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.restore();
  }

  update(dt) {
    this.time += dt;
  }
}
