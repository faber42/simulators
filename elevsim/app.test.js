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
    for (let speed = 1; speed <= 10; speed++) {
        for (const distance of [-95, -2, 0, 2, 95]) {
            const p = new Passenger(0, 9, 0);
            p.startBoard({ shaftIndex: 0 });
            p.x = p.targetX + distance;
            for (let step = 0; step < 100 && p.state === 'BOARDING'; step++) {
                p.update(speed);
            }
            assert.equal(p.state, 'RIDING', `speed=${speed}, distance=${distance}`);
            assert.equal(p.x, p.targetX);
        }
    }
});

test('long simulation runs never leave a passenger stuck boarding', () => {
    for (let speed = 1; speed <= 10; speed++) {
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
