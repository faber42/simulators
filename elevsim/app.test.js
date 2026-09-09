const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadSimulation(seed = 1) {
    const math = Object.create(Math);
    math.random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 2 ** 32;
    };
    const context = vm.createContext({
        Math: math,
        document: { readyState: 'loading', addEventListener() {} },
        window: { devicePixelRatio: 1 },
    });
    vm.runInContext(fs.readFileSync(require.resolve('./app.js'), 'utf8'), context);
    return vm.runInContext('({ Passenger, Simulation, CONFIG })', context);
}

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
    const { Simulation } = loadSimulation();
    const sim = new Simulation({ style: {}, getContext: () => ({ scale() {} }) });
    const elev = sim.elevators[0];
    elev.currentFloor = 5;
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
    elev.doorState = 'OPEN';
    assert.equal(sim.getElevatorProgram(elev)[0].current, true);
    assert.equal(sim.getElevatorProgram(elev)[0].next, false);
});
