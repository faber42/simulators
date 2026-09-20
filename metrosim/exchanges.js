import * as T from '../pinsim/three.module.min.js';
import { point, trackX, trackAngle } from './route.mjs';
import { random } from './materials.js';
import { exchangePose, exchangeCorridors, MAX_EXCHANGE_PASSENGERS } from './exchange.mjs';
import { EXCHANGE_DOORS } from './traffic.mjs';

export class PassengerExchange {
  constructor(scene, crowd, shadowMaterial) {
    this.scene = scene; this.crowd = crowd; this.shadowMaterial = shadowMaterial;
    this.groups = new Map(); this.obstacles = []; this.boarding = 0; this.alighting = 0;
    this.shadowGeometry = new T.PlaneGeometry(.85, .65);
    // Prepare both exchange groups during loading. Entering the next station
    // only repositions existing skeletons, including both two-person queues.
    this.pool = [this.createGroup(21), this.createGroup(94)];
  }
  createGroup(seed) {
    const group = new T.Group(), people = [];
    for (let slot = 0; slot < EXCHANGE_DOORS.length; slot++) for (const outgoing of [true, false]) for (let ordinal = 0; ordinal < MAX_EXCHANGE_PASSENGERS; ordinal++) {
      const p = this.crowd.create(random(seed * 97 + slot * 139 + ordinal * 773 + (outgoing ? 8102 : 3361)), { phone: false });
      p.person.scale.setScalar(p.height); group.add(p.person);
      const shadow = new T.Mesh(this.shadowGeometry, this.shadowMaterial); shadow.rotation.x = -Math.PI / 2; group.add(shadow);
      people.push({ ...p, slot, outgoing, ordinal, shadow });
    }
    group.visible = false; this.scene.add(group); return { group, people, station: null };
  }
  create(key, st) {
    const entry = this.pool.pop(); entry.station = st; entry.group.visible = true;
    entry.corridor = exchangeCorridors(st).map(p => ({ ...p, height: 1.12, phase: 0, pace: 1 }));
    this.groups.set(key, entry); return entry;
  }
  update(train, services) {
    const alive = new Set(services.map(service => service.key)); this.obstacles = []; this.boarding = this.alighting = 0;
    for (const [key, entry] of this.groups) if (!alive.has(key)) {
      entry.group.visible = false; this.pool.push(entry); this.groups.delete(key);
    }
    const reserved = new Set();
    for (const { key, station: st, age, previousService = false } of services) {
      const entry = this.groups.get(key) || this.create(key, st);
      if (!reserved.has(st.index)) this.obstacles.push(...entry.corridor);
      reserved.add(st.index);
      for (const p of entry.people) {
        const pose = exchangePose(st, p.slot, p.outgoing, age, previousService, p.ordinal);
        p.person.visible = pose.visible; p.shadow.visible = pose.visible && pose.y < .96;
        if (!pose.visible) continue;
        const world = point(pose.s, pose.x, pose.y);
        p.person.position.set(world[0] - trackX(train.s), pose.y, world[2] + train.s);
        p.person.rotation.y = pose.yaw - trackAngle(pose.s);
        p.shadow.position.set(p.person.position.x, .95, p.person.position.z);
        const walking = pose.amount, phase = pose.stridePhase;
        p.body.position.y = p.hipHeight + Math.abs(Math.sin(phase)) * .014 * walking;
        p.body.rotation.z = Math.sin(train.time * .9 + p.slot + p.ordinal) * .009 * (1 - walking);
        p.head.rotation.y = pose.walking ? .025 * Math.sin(phase) : Math.sin(train.time * .35 + p.slot + p.ordinal) * .14;
        p.head.rotation.x = pose.walking ? .04 : 0;
        for (let i = 0; i < 2; i++) {
          const stride = Math.sin(phase + i * Math.PI);
          p.legs[i].pivot.rotation.x = stride * .34 * walking;
          p.legs[i].shin.rotation.x = Math.max(0, -stride) * .58 * walking;
          p.arms[i].pivot.rotation.x = -stride * .21 * walking;
          p.arms[i].forearm.rotation.x = -.13;
        }
        if (pose.walking) { if (p.outgoing) this.alighting++; else this.boarding++; }
        if (Math.abs(pose.x) > 1.7) this.obstacles.push({ s: pose.s, x: pose.x, height: p.height, phase: 0, pace: 1 });
      }
    }
  }
  stats() { return { boardingTrain: this.boarding, alightingTrain: this.alighting }; }
}
