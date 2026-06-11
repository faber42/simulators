// ============================================================
// protocols.js - TCP, TLS, HTTP Protokoll-Simulationen
// ============================================================

import { Frame } from './frames.js';

/**
 * Find the link path between two devices using BFS.
 * Returns the first link to send on + the direct link from sender.
 */
function findFirstLink(src, dst, allLinks) {
  // BFS through devices
  const visited = new Set([src.id]);
  const queue = [{ device: src, firstLink: null }];

  while (queue.length > 0) {
    const { device, firstLink } = queue.shift();

    for (const link of device.ports) {
      let neighbors = [];
      if (link.type === 'coax') {
        neighbors = link.devices.filter(d => d !== device);
      } else {
        const other = link.getOtherDevice(device);
        if (other) neighbors = [other];
      }

      for (const neighbor of neighbors) {
        if (visited.has(neighbor.id)) continue;
        visited.add(neighbor.id);

        const usedFirstLink = firstLink || link;

        if (neighbor === dst) {
          return usedFirstLink;
        }

        queue.push({ device: neighbor, firstLink: usedFirstLink });
      }
    }
  }
  return null;
}

/**
 * Find the direct link from a device to its gateway/next device
 */
function findLinkToDevice(src, target) {
  for (const link of src.ports) {
    if (link.type === 'coax') {
      if (link.devices.includes(target)) return link;
    } else {
      if (link.getOtherDevice(src) === target) return link;
    }
  }
  return null;
}

/**
 * Find the next-hop device for reaching dstIP from src.
 * For endpoints: send to gateway (router).
 * For routers: check routing table.
 */
function resolveNextHop(src, dstIP, allDevices) {
  if (src.isEndpoint()) {
    // Find the gateway router on our link
    for (const link of src.ports) {
      if (link.type === 'coax') {
        for (const d of link.devices) {
          if (d.type === 'router') return { device: d, link };
        }
        // No router? Try switch/hub
        for (const d of link.devices) {
          if (!d.isEndpoint()) return { device: d, link };
        }
      } else {
        const other = link.getOtherDevice(src);
        if (other) return { device: other, link };
      }
    }
  }
  return null;
}

/**
 * Run a full "web page fetch" sequence:
 * TCP Handshake → TLS Handshake → HTTP GET → HTTP Response → TCP FIN
 *
 * Each step sends a frame through the network and waits for delivery
 * before sending the next.
 */
export function runWebPageFetch(client, server, engine, allDevices) {
  const steps = [
    // TCP 3-way handshake
    { src: client, dst: server, protocol: 'TCP', flags: 'SYN', size: 64, delay: 0 },
    { src: server, dst: client, protocol: 'TCP', flags: 'SYN-ACK', size: 64, delay: 0.8 },
    { src: client, dst: server, protocol: 'TCP', flags: 'ACK', size: 64, delay: 0.8 },

    // TLS handshake
    { src: client, dst: server, protocol: 'TLS', flags: 'ClientHello', size: 200, delay: 0.6 },
    { src: server, dst: client, protocol: 'TLS', flags: 'ServerHello+Cert', size: 800, delay: 0.8 },
    { src: client, dst: server, protocol: 'TLS', flags: 'Finished', size: 100, delay: 0.8 },

    // HTTP request/response
    { src: client, dst: server, protocol: 'HTTP', flags: 'REQUEST', payload: 'GET /index.html', size: 200, delay: 0.6 },
    { src: server, dst: client, protocol: 'HTTP', flags: 'RESPONSE', payload: 'HTTP 200 OK + HTML', size: 1400, delay: 0.8 },
    { src: server, dst: client, protocol: 'HTTP', flags: 'RESPONSE', payload: 'HTTP 200 (CSS)', size: 800, delay: 0.5 },
    { src: server, dst: client, protocol: 'HTTP', flags: 'RESPONSE', payload: 'HTTP 200 (JS)', size: 1200, delay: 0.5 },

    // TCP connection teardown
    { src: client, dst: server, protocol: 'TCP', flags: 'FIN', size: 64, delay: 0.8 },
    { src: server, dst: client, protocol: 'TCP', flags: 'ACK', size: 64, delay: 0.8 },
  ];

  let totalDelay = 0.3; // initial delay

  for (const step of steps) {
    totalDelay += step.delay;
    const capturedDelay = totalDelay;

    engine.scheduleEvent(capturedDelay, () => {
      const frame = new Frame({
        srcMAC: step.src.mac,
        dstMAC: step.dst.mac,
        srcIP: step.src.ip,
        dstIP: step.dst.ip,
        protocol: step.protocol,
        flags: step.flags,
        payload: step.payload || '',
        size: step.size,
      });

      // Find the first link from source
      const firstLink = findFirstLink(step.src, step.dst, []);
      if (firstLink) {
        engine.sendFrame(step.src, firstLink, frame);
        step.src.activity = 1;
      }
    });
  }

  return totalDelay + 1; // total duration of simulation
}

/**
 * Run a simple ping (ICMP echo request + reply)
 */
export function runPing(src, dst, engine) {
  const frame1 = new Frame({
    srcMAC: src.mac,
    dstMAC: dst.mac,
    srcIP: src.ip,
    dstIP: dst.ip,
    protocol: 'ICMP',
    flags: 'Echo Request',
    size: 64,
  });

  const firstLink = findFirstLink(src, dst, []);
  if (firstLink) {
    engine.sendFrame(src, firstLink, frame1);
    src.activity = 1;
  }

  engine.scheduleEvent(1.0, () => {
    const frame2 = new Frame({
      srcMAC: dst.mac,
      dstMAC: src.mac,
      srcIP: dst.ip,
      dstIP: src.ip,
      protocol: 'ICMP',
      flags: 'Echo Reply',
      size: 64,
    });

    const replyLink = findFirstLink(dst, src, []);
    if (replyLink) {
      engine.sendFrame(dst, replyLink, frame2);
      dst.activity = 1;
    }
  });
}
