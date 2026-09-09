const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('added cabin takes over a waiting call while preserving the opposite call and dropoff', () => {
    const { Simulation, Passenger, floorY } = loadSimulation();
    const sim = new Simulation({ style: {}, getContext: () => ({ scale() {} }) });
    while (sim.elevators.length > 1) sim.removeCabin();
    const old = sim.elevators[0];
    old.y = floorY(8);
    old.currentFloor = 8;
    old.direction = 'UP';
    old.addDropoff(9);
    old.addPickup(2, 'UP');
    old.addPickup(2, 'DOWN');
    const p = new Passenger(2, 7, 0);
    p.state = 'WAITING';
    p.hasCalledElevator = true;
    sim.passengers.push(p);
    sim.addCabin();
    assert.equal(sim.elevators[1].hasPickup(2, 'UP'), true);
    assert.equal(old.hasPickup(2, 'UP'), false);
    assert.equal(old.hasPickup(2, 'DOWN'), true);
    assert.equal(old.dropoffStops.has(9), true);
});

test('adding a cabin preserves an ongoing stop and respects disabled operation', () => {
    const { Simulation, Passenger } = loadSimulation();
    for (const enabled of [true, false]) {
        const sim = new Simulation({ style: {}, getContext: () => ({ scale() {} }) });
        while (sim.elevators.length > 1) sim.removeCabin();
        sim.setEnabled(enabled);
        const old = sim.elevators[0];
        if (enabled) {
            old.addPickup(0, 'UP');
            old.doorState = 'OPEN';
        }
        const p = new Passenger(0, 7, 0);
        p.state = 'WAITING';
        sim.passengers.push(p);
        sim.addCabin();
        assert.equal(sim.elevators[1].pickupStops.size, 0);
        assert.equal(old.hasPickup(0, 'UP'), enabled);
    }
});

test('opposite-direction pickup is skipped until after the onboard destination', () => {
    for (const reverse of [false, true]) {
        const { Simulation, Passenger, floorY } = loadSimulation();
        const sim = new Simulation({ style: {}, getContext: () => ({ scale() {} }) });
        while (sim.elevators.length > 1) sim.removeCabin();
        sim.spawnRate = 0;
        sim.autoReturn = false;
        const elev = sim.elevators[0];
        const start = reverse ? 9 : 0;
        const destination = reverse ? 1 : 8;
        const pickup = reverse ? 6 : 3;
        elev.y = floorY(start);
        elev.currentFloor = start;
        elev.direction = reverse ? 'DOWN' : 'UP';
        const rider = new Passenger(start, destination, 0);
        rider.state = 'RIDING';
        rider.elevator = elev;
        elev.passengers.push(rider);
        elev.addDropoff(destination);
        const waiting = new Passenger(pickup, start, 0);
        waiting.state = 'WAITING';
        sim.passengers.push(rider, waiting);
        const opened = [];
        for (let i = 0; i < 3000 && waiting.state !== 'DONE'; i++) {
            const before = elev.doorState;
            sim.update();
            if (before === 'CLOSED' && elev.doorState === 'OPENING') opened.push(elev.currentFloor);
        }
        assert.deepEqual(opened, [destination, pickup, start]);
        assert.equal(waiting.state, 'DONE');
    }
});

test('up and down calls on one floor remain independent after serving one direction', () => {
    const { Elevator } = loadSimulation();
    const elev = new Elevator(0, 0);
    elev.addPickup(3, 'UP');
    elev.addPickup(3, 'DOWN');
    assert.equal(elev.hasPickup(3, 'UP'), true);
    assert.equal(elev.hasPickup(3, 'DOWN'), true);
    elev.currentFloor = 3;
    elev.servedDirection = 'UP';
    elev.startClosing();
    elev.updateDoor(1);
    assert.equal(elev.hasPickup(3, 'UP'), false);
    assert.equal(elev.hasPickup(3, 'DOWN'), true);
});

test('disabled plant ignores calls and only moves manually with closed doors', () => {
    const { Simulation, Passenger, floorY } = loadSimulation();
    const sim = new Simulation({ style: {}, getContext: () => ({ scale() {} }) });
    sim.spawnRate = 0;
    const p = new Passenger(3, 8, 0);
    p.state = 'WAITING';
    sim.passengers.push(p);
    sim.setEnabled(false);
    for (let i = 0; i < 100; i++) sim.update();
    assert.ok(sim.elevators.every(e => e.y === floorY(0) && !e.pickupStops.size));
    const elev = sim.elevators[0];
    sim.callCabin(elev, 3);
    for (let i = 0; i < 200; i++) {
        sim.update();
        assert.equal(elev.doorState, 'CLOSED');
    }
    assert.equal(elev.y, floorY(3));
    assert.equal(p.state, 'WAITING');
    sim.setEnabled(true);
    for (let i = 0; i < 2000 && p.state !== 'DONE'; i++) sim.update();
    assert.equal(p.state, 'DONE');
});

test('idle return waits thirty simulation seconds and can be disabled', () => {
    const { Simulation, floorY } = loadSimulation();
    for (const enabled of [false, true]) {
        const sim = new Simulation({ style: {}, getContext: () => ({ scale() {} }) });
        sim.spawnRate = 0;
        sim.autoReturn = enabled;
        const elev = sim.elevators[0];
        elev.y = floorY(6);
        elev.currentFloor = 6;
        for (let i = 0; i < 1799; i++) sim.update();
        assert.equal(elev.y, floorY(6));
        sim.update();
        assert.equal(elev.manualTarget, enabled ? 0 : null);
        for (let i = 0; i < 400; i++) sim.update();
        assert.equal(elev.y, floorY(enabled ? 0 : 6));
    }
});

test('recall moves all disabled cabins to ground floor without opening doors', () => {
    const { Simulation, floorY } = loadSimulation();
    const sim = new Simulation({ style: {}, getContext: () => ({ scale() {} }) });
    sim.spawnRate = 0;
    sim.setEnabled(false);
    sim.elevators.forEach((e, i) => {
        e.y = floorY(i + 2);
        e.currentFloor = i + 2;
        sim.callCabin(e, 0, 'Rückruf aller Kabinen');
    });
    for (let i = 0; i < 300; i++) sim.update();
    assert.ok(sim.elevators.every(e => e.y === floorY(0) && e.doorState === 'CLOSED'));
});

test('cabin count stays within 1–10 and resets to four', () => {
    const { Simulation, CONFIG } = loadSimulation();
    const sim = new Simulation({ style: {}, getContext: () => ({ scale() {} }) });
    assert.equal(sim.elevators.length, 4);
    for (let i = 0; i < 20; i++) sim.addCabin();
    assert.equal(sim.elevators.length, 10);
    assert.ok(sim.elevators.at(-1).x + CONFIG.SHAFT_W < CONFIG.EXIT_X);
    assert.equal(sim.controller.elevators, sim.elevators);
    for (let i = 0; i < 20; i++) sim.removeCabin();
    assert.equal(sim.elevators.length, 1);
    sim.init();
    assert.equal(sim.elevators.length, 4);
});

test('retiring cabin delivers boarding and riding passengers before disappearing', () => {
    const { Simulation, Passenger } = loadSimulation();
    const sim = new Simulation({ style: {}, getContext: () => ({ scale() {} }) });
    sim.spawnRate = 0;
    const elev = sim.elevators.at(-1);
    elev.doorState = 'OPEN';
    elev.doorPhase = 'waitBoard';
    elev.direction = 'UP';
    for (const floor of [2, 8]) {
        const p = new Passenger(0, floor, 0);
        p.startBoard(elev);
        elev.passengers.push(p);
        elev.dropoffStops.add(floor);
        sim.passengers.push(p);
    }
    const passengers = [...elev.passengers];
    elev.pickupStops.add(5);
    sim.selectedElevatorId = elev.id;
    sim.removeCabin();
    assert.equal(elev.retiring, true);
    assert.equal(elev.pickupStops.size, 0);
    assert.equal(sim.elevators.length, 4);
    assert.equal(sim.controller.calculateCost(elev, 3, 'UP'), Infinity);
    for (let i = 0; i < 3000 && sim.elevators.includes(elev); i++) sim.update();
    assert.equal(sim.elevators.includes(elev), false);
    assert.equal(sim.elevators.length, 3);
    assert.equal(sim.selectedElevatorId, null);
    assert.ok(passengers.every(p => ['EXITING', 'LEAVING', 'DONE'].includes(p.state)));
    assert.equal(sim.controller.elevators, sim.elevators);
});

test('adding while a cabin is retiring restores it without exceeding ten shafts', () => {
    const { Simulation } = loadSimulation();
    const sim = new Simulation({ style: {}, getContext: () => ({ scale() {} }) });
    for (let i = 0; i < 6; i++) sim.addCabin();
    const elev = sim.elevators.at(-1);
    elev.doorState = 'OPEN';
    sim.removeCabin();
    assert.equal(elev.retiring, true);
    sim.addCabin();
    assert.equal(elev.retiring, false);
    assert.equal(sim.elevators.length, 10);
});

test('eight exiting passengers walk in sequence at every slider speed', () => {
    const { Simulation, Passenger, CONFIG } = loadSimulation();
    for (let tenth = 1; tenth <= 100; tenth++) {
        const speed = tenth / 10;
        const sim = new Simulation({ style: {}, getContext: () => ({ scale() {} }) });
        const elev = sim.elevators[0];
        elev.doorState = 'OPEN';
        elev.doorPhase = 'exiting';
        elev.dropoffStops.add(0);
        for (let i = 0; i < 8; i++) {
            const p = new Passenger(8, 0, 0);
            p.state = 'RIDING';
            p.elevator = elev;
            elev.passengers.push(p);
            sim.passengers.push(p);
        }
        for (let step = 0; step < 5000; step++) {
            for (const p of sim.passengers) p.update(speed);
            if (elev.doorPhase !== 'boarding') sim.handleDoorPhases(elev, speed);
            const walkers = sim.passengers.filter(p =>
                (p.state === 'EXITING' || p.state === 'LEAVING') &&
                p.x < CONFIG.BUILDING_RIGHT);
            for (let i = 1; i < walkers.length; i++) {
                assert.ok(walkers[i - 1].x - walkers[i].x >= CONFIG.EXIT_SPACING - 1e-8,
                    `overlap at speed ${speed}`);
            }
            if (elev.passengers.length) assert.notEqual(elev.doorPhase, 'boarding');
            if (sim.passengers.every(p => p.state === 'DONE')) break;
        }
        assert.ok(sim.passengers.every(p => p.state === 'DONE'), `unfinished at speed ${speed}`);
        assert.equal(elev.dropoffStops.size, 0);
        assert.equal(elev.doorPhase, 'boarding');
    }
});

test('waiting passengers do not reopen a departing cabin, full or partly occupied', () => {
    for (const load of [3, 8]) {
        const { Simulation, Passenger, floorY } = loadSimulation();
        const sim = new Simulation({ style: {}, getContext: () => ({ scale() {} }) });
        sim.spawnRate = 0;
        const elev = sim.elevators[0];
        elev.direction = 'UP';
        elev.pickupStops.add(0);
        elev.dropoffStops.add(8);
        for (let i = 0; i < load; i++) {
            const p = new Passenger(0, 8, 0);
            p.state = 'RIDING';
            p.elevator = elev;
            elev.passengers.push(p);
            sim.passengers.push(p);
        }
        const waiting = new Passenger(0, 5, 0);
        waiting.state = 'WAITING';
        waiting.hasCalledElevator = true;
        sim.passengers.push(waiting);
        elev.startClosing();
        for (let i = 0; i < 100; i++) {
            sim.update();
            assert.notEqual(elev.doorState, 'OPENING');
        }
        assert.ok(elev.y < floorY(0));
        assert.equal(elev.pickupStops.has(0), false);
        assert.ok(waiting.elevator !== elev);
        // Full cabins cannot win calls on other floors either.
        if (load === 8) assert.equal(sim.controller.calculateCost(elev, 2, 'UP'), Infinity);
    }
});

test('waiting queues keep visible passengers apart and refill vacated places', () => {
    const { Simulation, Passenger, CONFIG } = loadSimulation();
    const sim = new Simulation({ style: {}, getContext: () => ({ scale() {} }) });
    for (const floor of [0, 4]) {
        for (let i = 0; i < 30; i++) {
            const p = new Passenger(floor, 8, 0);
            p.state = 'WAITING';
            sim.passengers.push(p);
        }
    }
    sim.layoutWaitingQueues();
    for (const floor of [0, 4]) {
        const visible = sim.getWaitingQueue(floor).slice(0, sim.waitingSlots());
        for (let i = 1; i < visible.length; i++) {
            assert.equal(visible[i - 1].x - visible[i].x, CONFIG.WAITING_SPACING);
            assert.equal(visible[i - 1].y, visible[i].y);
            assert.ok(visible[i].x > CONFIG.BUILDING_LEFT + CONFIG.PASSENGER_RADIUS);
        }
    }
    const first = sim.getWaitingQueue(0)[0];
    first.startBoard(sim.elevators[0]);
    sim.layoutWaitingQueues();
    assert.equal(sim.getWaitingQueue(0)[0].x, CONFIG.WAITING_X);
    assert.equal(first.state, 'BOARDING');
    assert.equal(sim.getWaitingQueue(0).length, 29);
});

function loadSimulation(seed = 1, overrides = {}) {
    const math = Object.create(Math);
    math.random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 2 ** 32;
    };
    const context = vm.createContext({
        Math: math,
        document: { readyState: 'loading', addEventListener() {} },
        window: { devicePixelRatio: 1 },
        ...overrides,
    });
    vm.runInContext(fs.readFileSync(require.resolve('./app.js'), 'utf8'), context);
    return vm.runInContext('({ Passenger, Elevator, Simulation, CONFIG, floorY, bindRepeatButton })', context);
}

test('floor controls spawn on the requested floor with a different destination', () => {
    const { Simulation, CONFIG } = loadSimulation();
    const sim = new Simulation({ style: {}, getContext: () => ({ scale() {} }) });
    for (let floor = 0; floor < CONFIG.FLOORS; floor++) {
        for (let i = 0; i < 20; i++) {
            sim.spawnPassenger(floor);
            const p = sim.passengers.at(-1);
            assert.equal(p.startFloor, floor);
            assert.notEqual(p.destFloor, floor);
            assert.ok(p.destFloor >= 0 && p.destFloor < CONFIG.FLOORS);
        }
    }
    assert.equal(sim.stats.total, 200);
});

test('holding plus repeats and release or cancellation stops it without a duplicate click', () => {
    const events = {};
    const windowEvents = {};
    const timers = new Map();
    let timerId = 0;
    const { bindRepeatButton } = loadSimulation(1, {
        window: { addEventListener: (name, fn) => { windowEvents[name] = fn; } },
        setTimeout: fn => { timers.set(++timerId, fn); return timerId; },
        clearTimeout: id => timers.delete(id),
    });
    let count = 0;
    bindRepeatButton({
        addEventListener: (name, fn) => { events[name] = fn; },
        setPointerCapture() {},
    }, () => count++);
    events.pointerdown({ button: 0, pointerId: 1 });
    assert.equal(count, 1);
    const tick = () => {
        const [id, fn] = timers.entries().next().value;
        timers.delete(id);
        fn();
    };
    tick();
    tick();
    assert.equal(count, 3);
    events.pointerup();
    events.click({ detail: 1 });
    assert.equal(count, 3);
    assert.equal(timers.size, 0);
    for (const cancel of [events.pointercancel, events.lostpointercapture, windowEvents.blur]) {
        events.pointerdown({ button: 0, pointerId: 1 });
        cancel();
        assert.equal(timers.size, 0);
    }
    events.click({ detail: 0 });
    assert.equal(count, 7);
});

test('boarding reaches the cabin from either side at every slider speed', () => {
    const { Passenger } = loadSimulation();
    for (let tenth = 1; tenth <= 100; tenth++) {
        const speed = tenth / 10;
        for (const distance of [-95, -2, 0, 2, 95]) {
            const p = new Passenger(0, 9, 0);
            p.startBoard({ shaftIndex: 0 });
            p.x = p.targetX + distance;
            for (let step = 0; step < 1000 && p.state === 'BOARDING'; step++) {
                p.update(speed);
            }
            assert.equal(p.state, 'RIDING', `speed=${speed}, distance=${distance}`);
            assert.equal(p.x, p.targetX);
        }
    }
});

test('long simulation runs never leave a passenger stuck boarding', () => {
    for (const speed of [0.1, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        const { Simulation } = loadSimulation(12345);
        const sim = new Simulation({ style: {}, getContext: () => ({ scale() {} }) });
        sim.speedMultiplier = speed;
        const boardingSince = new Map();
        // Five minutes of updates at the application's 16 ms interval.
        for (let step = 0; step < 18750; step++) {
            sim.update();
            for (const p of sim.passengers) {
                if (p.state !== 'BOARDING') {
                    boardingSince.delete(p.id);
                    continue;
                }
                if (!boardingSince.has(p.id)) boardingSince.set(p.id, sim.simTime);
                assert.ok(sim.simTime - boardingSince.get(p.id) < 250,
                    `stuck boarding: speed=${speed}, passenger=${p.id}`);
            }
        }
        assert.ok(sim.stats.done > 0, `no completed trips at speed=${speed}`);
    }
});

test('program explains combined stops without changing the live direction', () => {
    const { Simulation, floorY } = loadSimulation();
    const sim = new Simulation({ style: {}, getContext: () => ({ scale() {} }) });
    const elev = sim.elevators[0];
    elev.currentFloor = 5;
    elev.y = floorY(5);
    elev.direction = 'UP';
    elev.pickupStops.add(2);
    elev.dropoffStops.add(2);
    elev.passengers.push({ destFloor: 2 });
    sim.passengers.push({ state: 'WAITING', startFloor: 2 });
    const [stop] = sim.getElevatorProgram(elev);
    assert.equal(stop.floor, 2);
    assert.equal(stop.next, true);
    assert.equal(stop.pickup, true);
    assert.equal(stop.dropoff, true);
    assert.equal(stop.riders, 1);
    assert.equal(stop.waiting, 1);
    assert.equal(elev.direction, 'UP');
    assert.equal(elev.pickupStops.size, 1);
    assert.equal(elev.dropoffStops.size, 1);
    elev.currentFloor = 2;
    elev.y = floorY(2);
    elev.doorState = 'OPEN';
    assert.equal(sim.getElevatorProgram(elev)[0].current, true);
    assert.equal(sim.getElevatorProgram(elev)[0].next, false);
});

test('cabins reach both endpoints instead of reversing at rounded floor boundaries', () => {
    const { Elevator, floorY } = loadSimulation();
    for (let tenth = 1; tenth <= 100; tenth++) {
        const speed = tenth / 10;
        for (const direction of ['UP', 'DOWN']) {
            const elev = new Elevator(0, 0);
            elev.y = floorY(4);
            elev.currentFloor = 4;
            elev.direction = direction;
            elev.pickupStops.add(0);
            elev.dropoffStops.add(8);
            const expected = direction === 'UP' ? [8, 0] : [0, 8];
            for (const floor of expected) {
                for (let step = 0; step < 5000 && elev.doorState === 'CLOSED'; step++) {
                    elev.update(speed);
                }
                assert.equal(elev.doorState, 'OPENING', `speed=${speed}, direction=${direction}`);
                assert.equal(elev.y, floorY(floor));
                assert.equal(elev.currentFloor, floor);
                elev.pickupStops.delete(floor);
                elev.dropoffStops.delete(floor);
                elev.doorState = 'CLOSED';
            }
        }
    }
});
