const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

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
