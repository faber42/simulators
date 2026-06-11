// ===== CONFIGURATION =====
const CONFIG = {
    FLOORS: 10,
    NUM_ELEVATORS: 4,
    FLOOR_HEIGHT: 56,
    CANVAS_W: 960,
    CANVAS_H: 660,

    BUILDING_LEFT: 55,
    BUILDING_RIGHT: 780,
    BUILDING_TOP: 38,
    WAITING_X: 258,
    SHAFT_X0: 330,
    SHAFT_W: 46,
    SHAFT_GAP: 16,
    EXIT_X: 620,

    PASSENGER_SPEED: 1.8,
    ELEVATOR_SPEED: 2.0,
    DOOR_SPEED: 0.04,
    DOOR_PAUSE: 50,
    CAPACITY: 8,
    PASSENGER_RADIUS: 5,
    CAR_H: 46,
};

const PASSENGER_COLORS = [
    '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff8c32',
    '#c084fc', '#67e8f9', '#fb7185', '#a3e635', '#fbbf24',
];

const FLOOR_NAMES = ['EG', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

// ===== UTILITY =====
function floorY(floor) {
    return CONFIG.BUILDING_TOP + (CONFIG.FLOORS - floor) * CONFIG.FLOOR_HEIGHT;
}

function shaftX(i) {
    return CONFIG.SHAFT_X0 + i * (CONFIG.SHAFT_W + CONFIG.SHAFT_GAP);
}

function shaftCenterX(i) {
    return shaftX(i) + CONFIG.SHAFT_W / 2;
}

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randColor() {
    return PASSENGER_COLORS[Math.floor(Math.random() * PASSENGER_COLORS.length)];
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

// ===== PASSENGER =====
class Passenger {
    static nextId = 0;

    constructor(startFloor, destFloor, simTime) {
        this.id = Passenger.nextId++;
        this.startFloor = startFloor;
        this.destFloor = destFloor;
        this.direction = destFloor > startFloor ? 'UP' : 'DOWN';
        this.color = randColor();

        // States: ENTERING, WAITING, BOARDING, RIDING, EXITING, LEAVING, DONE
        this.state = 'ENTERING';
        this.x = CONFIG.BUILDING_LEFT - 10;
        this.y = floorY(startFloor) - CONFIG.PASSENGER_RADIUS;
        this.targetX = CONFIG.WAITING_X - randInt(0, 40);
        this.elevator = null;
        this.hasCalledElevator = false;

        this.spawnTime = simTime;
        this.waitStartTime = 0;
        this.boardTime = 0;
        this.doneTime = 0;
    }

    update(speed) {
        const spd = CONFIG.PASSENGER_SPEED * speed;

        switch (this.state) {
            case 'ENTERING':
                if (this.x < this.targetX) {
                    this.x = Math.min(this.x + spd, this.targetX);
                } else {
                    this.state = 'WAITING';
                }
                break;

            case 'WAITING':
                break;

            case 'BOARDING':
                if (Math.abs(this.x - this.targetX) > 1.5) {
                    this.x += Math.sign(this.targetX - this.x) * spd;
                } else {
                    this.x = this.targetX;
                    this.state = 'RIDING';
                }
                break;

            case 'RIDING':
                if (this.elevator) {
                    this.y = this.elevator.y - CONFIG.PASSENGER_RADIUS;
                }
                break;

            case 'EXITING':
                if (this.x < this.targetX) {
                    this.x = Math.min(this.x + spd, this.targetX);
                } else {
                    this.state = 'LEAVING';
                    this.targetX = CONFIG.BUILDING_RIGHT + 30;
                }
                break;

            case 'LEAVING':
                if (this.x < this.targetX) {
                    this.x = Math.min(this.x + spd, this.targetX);
                } else {
                    this.state = 'DONE';
                }
                break;
        }
    }

    startBoard(elevator) {
        this.state = 'BOARDING';
        this.elevator = elevator;
        this.targetX = shaftCenterX(elevator.shaftIndex);
    }

    startExit() {
        this.state = 'EXITING';
        this.elevator = null;
        this.targetX = CONFIG.EXIT_X + randInt(0, 30);
    }
}

// ===== ELEVATOR =====
class Elevator {
    constructor(id, shaftIndex) {
        this.id = id;
        this.shaftIndex = shaftIndex;
        this.x = shaftX(shaftIndex);
        this.y = floorY(0);
        this.currentFloor = 0;
        this.direction = 'IDLE';

        this.passengers = [];
        this.pickupStops = new Set();
        this.dropoffStops = new Set();

        this.doorState = 'CLOSED';
        this.doorOpenness = 0;
        this.doorTimer = 0;
        this.doorPhase = 'none';

        this.capacity = CONFIG.CAPACITY;
    }

    getAllStops() {
        return new Set([...this.pickupStops, ...this.dropoffStops]);
    }

    addPickup(floor) {
        this.pickupStops.add(floor);
        if (this.direction === 'IDLE' && this.doorState === 'CLOSED') {
            if (floor === this.currentFloor) {
                this.doorState = 'OPENING';
            } else {
                this.direction = floor > this.currentFloor ? 'UP' : 'DOWN';
            }
        }
    }

    addDropoff(floor) {
        this.dropoffStops.add(floor);
    }

    getNextStop() {
        const stops = [...this.getAllStops()];
        if (stops.length === 0) return null;

        if (this.direction === 'UP') {
            const above = stops.filter(f => f > this.currentFloor).sort((a, b) => a - b);
            if (above.length > 0) return above[0];
            const below = stops.filter(f => f < this.currentFloor).sort((a, b) => b - a);
            if (below.length > 0) {
                this.direction = 'DOWN';
                return below[0];
            }
            // same floor
            const same = stops.filter(f => f === this.currentFloor);
            if (same.length > 0) return same[0];
        } else if (this.direction === 'DOWN') {
            const below = stops.filter(f => f < this.currentFloor).sort((a, b) => b - a);
            if (below.length > 0) return below[0];
            const above = stops.filter(f => f > this.currentFloor).sort((a, b) => a - b);
            if (above.length > 0) {
                this.direction = 'UP';
                return above[0];
            }
            const same = stops.filter(f => f === this.currentFloor);
            if (same.length > 0) return same[0];
        } else {
            stops.sort((a, b) => Math.abs(a - this.currentFloor) - Math.abs(b - this.currentFloor));
            const target = stops[0];
            if (target > this.currentFloor) this.direction = 'UP';
            else if (target < this.currentFloor) this.direction = 'DOWN';
            return target;
        }
        return null;
    }

    shouldStopAtFloor(floor) {
        return this.pickupStops.has(floor) || this.dropoffStops.has(floor);
    }

    update(speed) {
        if (this.doorState !== 'CLOSED') {
            this.updateDoor(speed);
            return;
        }

        const stops = this.getAllStops();
        if (stops.size === 0) {
            this.direction = 'IDLE';
            return;
        }

        const target = this.getNextStop();
        if (target === null) {
            this.direction = 'IDLE';
            return;
        }

        const targetY = floorY(target);
        const moveSpeed = CONFIG.ELEVATOR_SPEED * speed;

        const prevY = this.y;

        if (Math.abs(this.y - targetY) <= moveSpeed) {
            this.y = targetY;
            this.currentFloor = target;
            if (this.shouldStopAtFloor(target)) {
                this.doorState = 'OPENING';
                this.doorPhase = 'opening';
            }
        } else if (targetY < this.y) {
            this.y -= moveSpeed;
            this.direction = 'UP';
        } else {
            this.y += moveSpeed;
            this.direction = 'DOWN';
        }

        // Check intermediate floors we might pass through
        const stopsArr = [...stops];
        for (const stopFloor of stopsArr) {
            if (stopFloor === target) continue;
            const stopY = floorY(stopFloor);
            if ((prevY >= stopY && this.y <= stopY) || (prevY <= stopY && this.y >= stopY)) {
                if (this.shouldStopAtFloor(stopFloor)) {
                    this.y = stopY;
                    this.currentFloor = stopFloor;
                    this.doorState = 'OPENING';
                    this.doorPhase = 'opening';
                    break;
                }
            }
        }

        this.updateFloorFromY();
    }

    updateFloorFromY() {
        const approxFloor = Math.round((floorY(0) - this.y) / CONFIG.FLOOR_HEIGHT);
        this.currentFloor = Math.max(0, Math.min(CONFIG.FLOORS - 1, approxFloor));
    }

    updateDoor(speed) {
        const doorSpeed = CONFIG.DOOR_SPEED * speed;

        switch (this.doorState) {
            case 'OPENING':
                this.doorOpenness = Math.min(1, this.doorOpenness + doorSpeed);
                if (this.doorOpenness >= 1) {
                    this.doorOpenness = 1;
                    this.doorState = 'OPEN';
                    this.doorPhase = 'exiting';
                    this.doorTimer = 0;
                }
                break;

            case 'OPEN':
                // phases managed by Simulation
                break;

            case 'CLOSING':
                this.doorOpenness = Math.max(0, this.doorOpenness - doorSpeed);
                if (this.doorOpenness <= 0) {
                    this.doorOpenness = 0;
                    this.doorState = 'CLOSED';
                    this.doorPhase = 'none';
                    this.pickupStops.delete(this.currentFloor);
                }
                break;
        }
    }

    startClosing() {
        this.doorState = 'CLOSING';
    }
}

// ===== ELEVATOR CONTROLLER =====
class ElevatorController {
    constructor(elevators) {
        this.elevators = elevators;
    }

    requestElevator(floor, direction) {
        // Check if any elevator already has this as a pickup
        const alreadyAssigned = this.elevators.some(e => e.pickupStops.has(floor));
        if (alreadyAssigned) return;

        const best = this.findBestElevator(floor, direction);
        if (best) {
            best.addPickup(floor);
        }
    }

    findBestElevator(floor, direction) {
        let best = null;
        let bestCost = Infinity;

        for (const elev of this.elevators) {
            const cost = this.calculateCost(elev, floor, direction);
            if (cost < bestCost) {
                bestCost = cost;
                best = elev;
            }
        }
        return best;
    }

    calculateCost(elev, floor, direction) {
        const dist = Math.abs(elev.currentFloor - floor);

        if (elev.direction === 'IDLE') {
            return dist;
        }

        const goingUp = elev.direction === 'UP';
        const callAbove = floor > elev.currentFloor;
        const callBelow = floor < elev.currentFloor;

        // Best: moving toward call, same direction
        if (goingUp && callAbove && direction === 'UP') return dist;
        if (!goingUp && callBelow && direction === 'DOWN') return dist;

        // Medium: moving toward call, different direction
        if ((goingUp && callAbove) || (!goingUp && callBelow)) {
            return dist + CONFIG.FLOORS;
        }

        // Worst: moving away from call
        return dist + 2 * CONFIG.FLOORS;
    }
}

// ===== RENDERER =====
class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.setupCanvas();
    }

    setupCanvas() {
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = CONFIG.CANVAS_W * dpr;
        this.canvas.height = CONFIG.CANVAS_H * dpr;
        this.canvas.style.width = CONFIG.CANVAS_W + 'px';
        this.canvas.style.height = CONFIG.CANVAS_H + 'px';
        this.ctx.scale(dpr, dpr);
    }

    render(sim) {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, CONFIG.CANVAS_W, CONFIG.CANVAS_H);

        this.drawBuilding();
        this.drawElevatorShafts();

        for (const elev of sim.elevators) {
            this.drawElevator(elev);
        }

        for (const p of sim.passengers) {
            if (p.state !== 'DONE' && p.state !== 'RIDING') {
                this.drawPassenger(p);
            }
        }

        for (const elev of sim.elevators) {
            this.drawPassengersInElevator(elev);
        }

        this.drawFloorLabels();
        this.drawEntranceArrow(sim);
    }

    drawBuilding() {
        const ctx = this.ctx;
        const top = CONFIG.BUILDING_TOP;
        const bot = floorY(0);
        const left = CONFIG.BUILDING_LEFT;
        const right = CONFIG.BUILDING_RIGHT;

        // Building background
        ctx.fillStyle = '#141428';
        ctx.fillRect(left, top, right - left, bot - top);

        // Left corridor (lighter)
        ctx.fillStyle = '#181830';
        ctx.fillRect(left, top, CONFIG.SHAFT_X0 - left - 10, bot - top);

        // Right corridor (lighter)
        const rightCorridorStart = shaftX(CONFIG.NUM_ELEVATORS - 1) + CONFIG.SHAFT_W + 10;
        ctx.fillStyle = '#181830';
        ctx.fillRect(rightCorridorStart, top, right - rightCorridorStart, bot - top);

        // Floor lines
        for (let i = 0; i <= CONFIG.FLOORS; i++) {
            const y = floorY(i);
            ctx.strokeStyle = '#2a2a48';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(left, y);
            ctx.lineTo(right, y);
            ctx.stroke();
        }

        // Building outline
        ctx.strokeStyle = '#3a3a5a';
        ctx.lineWidth = 2;
        ctx.strokeRect(left, top, right - left, bot - top);

        // Entrance on ground floor
        const entrY = floorY(0) - CONFIG.FLOOR_HEIGHT;
        ctx.fillStyle = '#3a3a5a';
        ctx.fillRect(left - 3, entrY + 6, 6, CONFIG.FLOOR_HEIGHT - 12);
        // Entrance label
        ctx.fillStyle = '#606080';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('EINGANG', left - 1, floorY(0) + 12);
    }

    drawElevatorShafts() {
        const ctx = this.ctx;
        for (let i = 0; i < CONFIG.NUM_ELEVATORS; i++) {
            const x = shaftX(i);
            ctx.fillStyle = '#0e0e20';
            ctx.fillRect(x, CONFIG.BUILDING_TOP, CONFIG.SHAFT_W, floorY(0) - CONFIG.BUILDING_TOP);

            // Shaft borders
            ctx.strokeStyle = '#22223a';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, CONFIG.BUILDING_TOP, CONFIG.SHAFT_W, floorY(0) - CONFIG.BUILDING_TOP);

            // Door frames on each floor
            for (let f = 0; f < CONFIG.FLOORS; f++) {
                const fy = floorY(f) - CONFIG.FLOOR_HEIGHT;
                ctx.strokeStyle = '#28284a';
                ctx.strokeRect(x + 2, fy + 4, CONFIG.SHAFT_W - 4, CONFIG.FLOOR_HEIGHT - 8);
            }
        }
    }

    drawElevator(elev) {
        const ctx = this.ctx;
        const x = elev.x;
        const y = elev.y - CONFIG.CAR_H;
        const w = CONFIG.SHAFT_W;
        const h = CONFIG.CAR_H;

        // Car body
        ctx.fillStyle = '#2a4a7a';
        ctx.fillRect(x + 1, y, w - 2, h);

        // Car interior
        ctx.fillStyle = '#1e3a60';
        ctx.fillRect(x + 3, y + 2, w - 6, h - 4);

        // Doors
        const halfW = (w - 6) / 2;
        const openW = halfW * elev.doorOpenness;

        ctx.fillStyle = '#4a6a9a';
        // Left door
        ctx.fillRect(x + 3, y + 2, halfW - openW, h - 4);
        // Right door
        ctx.fillRect(x + 3 + halfW + openW, y + 2, halfW - openW, h - 4);

        // Door gap line
        if (elev.doorOpenness < 0.95) {
            ctx.strokeStyle = '#1a2a4a';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 3 + halfW, y + 2);
            ctx.lineTo(x + 3 + halfW, y + h - 2);
            ctx.stroke();
        }

        // Direction indicator
        const arrowX = x + w / 2;
        if (elev.direction === 'UP') {
            ctx.fillStyle = '#4ae65a';
            ctx.beginPath();
            ctx.moveTo(arrowX, y - 8);
            ctx.lineTo(arrowX - 4, y - 3);
            ctx.lineTo(arrowX + 4, y - 3);
            ctx.closePath();
            ctx.fill();
        } else if (elev.direction === 'DOWN') {
            ctx.fillStyle = '#ff5a5a';
            ctx.beginPath();
            ctx.moveTo(arrowX, y + h + 8);
            ctx.lineTo(arrowX - 4, y + h + 3);
            ctx.lineTo(arrowX + 4, y + h + 3);
            ctx.closePath();
            ctx.fill();
        }

        // Floor number on top of shaft
        ctx.fillStyle = '#8090b0';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(FLOOR_NAMES[elev.currentFloor], x + w / 2, CONFIG.BUILDING_TOP - 6);

        // Elevator label
        ctx.fillStyle = '#505070';
        ctx.font = '9px monospace';
        ctx.fillText('A' + (elev.id + 1), x + w / 2, CONFIG.BUILDING_TOP - 18);
    }

    drawPassengersInElevator(elev) {
        const ctx = this.ctx;
        // Only draw passengers that are actually RIDING (not still BOARDING)
        const riders = elev.passengers.filter(p => p.state === 'RIDING');
        if (riders.length === 0) return;

        const baseX = elev.x + 6;
        // Position from bottom of car (standing on floor), grow upward
        const floorY = elev.y - 6; // near bottom of car

        for (let i = 0; i < riders.length; i++) {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const px = baseX + col * 12 + 4;
            const py = floorY - row * 11 - 4;

            ctx.beginPath();
            ctx.arc(px, py, 4, 0, Math.PI * 2);
            ctx.fillStyle = riders[i].color;
            ctx.fill();
        }
    }

    drawPassenger(p) {
        const ctx = this.ctx;
        const r = CONFIG.PASSENGER_RADIUS;

        // Body (circle)
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();

        // Small direction arrow when waiting
        if (p.state === 'WAITING') {
            const ay = p.y - r - 3;
            ctx.fillStyle = p.direction === 'UP' ? '#4ae65a' : '#ff5a5a';
            ctx.beginPath();
            if (p.direction === 'UP') {
                ctx.moveTo(p.x, ay - 4);
                ctx.lineTo(p.x - 3, ay);
                ctx.lineTo(p.x + 3, ay);
            } else {
                ctx.moveTo(p.x, ay + 3);
                ctx.lineTo(p.x - 3, ay - 1);
                ctx.lineTo(p.x + 3, ay - 1);
            }
            ctx.closePath();
            ctx.fill();

            // Destination floor label
            ctx.fillStyle = '#a0a0c0';
            ctx.font = '8px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(FLOOR_NAMES[p.destFloor], p.x, p.y + r + 9);
        }
    }

    drawFloorLabels() {
        const ctx = this.ctx;
        ctx.fillStyle = '#606080';
        ctx.font = '12px monospace';
        ctx.textAlign = 'right';
        for (let i = 0; i < CONFIG.FLOORS; i++) {
            const y = floorY(i) - CONFIG.FLOOR_HEIGHT / 2;
            ctx.fillText(FLOOR_NAMES[i], CONFIG.BUILDING_LEFT - 10, y + 4);
        }
    }

    drawEntranceArrow(sim) {
        const ctx = this.ctx;
        // Draw small walking figures near entrance on ground floor
        const entering = sim.passengers.filter(p => p.state === 'ENTERING' && p.startFloor === 0);
        if (entering.length > 0) {
            ctx.fillStyle = '#404060';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('>>>', CONFIG.BUILDING_LEFT + 20, floorY(0) - 20);
        }
    }
}

// ===== SIMULATION =====
class Simulation {
    constructor(canvas) {
        this.renderer = new Renderer(canvas);
        this.elevators = [];
        this.passengers = [];
        this.controller = null;

        this.simTime = 0;
        this.speedMultiplier = 1;
        this.spawnRate = 3;
        this.spawnTimer = 0;
        this.paused = false;
        this.intervalId = null;

        this.stats = {
            total: 0,
            done: 0,
            totalWaitTime: 0,
            totalTripTime: 0,
        };

        this.init();
    }

    init() {
        this.elevators = [];
        for (let i = 0; i < CONFIG.NUM_ELEVATORS; i++) {
            this.elevators.push(new Elevator(i, i));
        }
        this.controller = new ElevatorController(this.elevators);
        this.passengers = [];
        Passenger.nextId = 0;
        this.simTime = 0;
        this.spawnTimer = 0;
        this.stats = { total: 0, done: 0, totalWaitTime: 0, totalTripTime: 0 };
    }

    reset() {
        this.stop();
        this.init();
        this.start();
    }

    spawnPassenger() {
        let startFloor, destFloor;

        // 60% chance ground floor, 40% other floors
        if (Math.random() < 0.6) {
            startFloor = 0;
            destFloor = randInt(1, CONFIG.FLOORS - 1);
        } else {
            startFloor = randInt(0, CONFIG.FLOORS - 1);
            do {
                destFloor = randInt(0, CONFIG.FLOORS - 1);
            } while (destFloor === startFloor);
        }

        const p = new Passenger(startFloor, destFloor, this.simTime);
        this.passengers.push(p);
        this.stats.total++;
    }

    update() {
        if (this.paused) return;

        const speed = this.speedMultiplier;
        this.simTime += speed;

        // Spawn passengers (rate 0 = no automatic spawning)
        if (this.spawnRate > 0) {
            this.spawnTimer += speed;
            const spawnInterval = Math.max(30, 200 - this.spawnRate * 18);
            if (this.spawnTimer >= spawnInterval) {
                this.spawnTimer = 0;
                this.spawnPassenger();
            }
        }

        // Update passengers
        for (const p of this.passengers) {
            p.update(speed);

            // Register elevator call when they start waiting
            if (p.state === 'WAITING' && !p.hasCalledElevator) {
                p.hasCalledElevator = true;
                p.waitStartTime = this.simTime;
                this.controller.requestElevator(p.startFloor, p.direction);
            }
        }

        // Update elevators
        for (const elev of this.elevators) {
            elev.update(speed);
            this.handleDoorPhases(elev, speed);
        }

        // Re-request for passengers still waiting with no elevator coming
        for (const p of this.passengers) {
            if (p.state === 'WAITING' && p.hasCalledElevator) {
                const anyServing = this.elevators.some(e =>
                    e.pickupStops.has(p.startFloor) ||
                    (e.currentFloor === p.startFloor && e.doorState !== 'CLOSED')
                );
                if (!anyServing) {
                    this.controller.requestElevator(p.startFloor, p.direction);
                }
            }
        }

        // Track completed passengers
        for (const p of this.passengers) {
            if (p.state === 'LEAVING' && p.x >= p.targetX - 2 && !p._counted) {
                p._counted = true;
                this.stats.done++;
                p.doneTime = this.simTime;
                const totalTime = (p.doneTime - p.spawnTime) / 60;
                this.stats.totalTripTime += totalTime;
            }
        }

        // Clean up done passengers
        this.passengers = this.passengers.filter(p => p.state !== 'DONE');
    }

    handleDoorPhases(elev, speed) {
        if (elev.doorState !== 'OPEN') return;

        switch (elev.doorPhase) {
            case 'exiting': {
                // Find passengers that should exit here
                const exiters = elev.passengers.filter(
                    p => p.destFloor === elev.currentFloor && p.state === 'RIDING'
                );

                if (exiters.length > 0) {
                    for (const p of exiters) {
                        p.startExit();
                        p.x = shaftCenterX(elev.shaftIndex);
                        p.y = elev.y - CONFIG.PASSENGER_RADIUS;
                        p.boardTime = this.simTime;
                    }
                    elev.passengers = elev.passengers.filter(
                        p => p.destFloor !== elev.currentFloor
                    );
                    elev.dropoffStops.delete(elev.currentFloor);
                    elev.doorTimer = 15;
                    elev.doorPhase = 'waitExit';
                } else {
                    elev.doorPhase = 'boarding';
                }
                break;
            }

            case 'waitExit':
                elev.doorTimer -= speed;
                if (elev.doorTimer <= 0) {
                    elev.doorPhase = 'boarding';
                }
                break;

            case 'boarding': {
                // Determine elevator's effective direction for boarding
                let elevDir = elev.direction;

                // Check if elevator needs to reverse (no more stops in current direction)
                const allStops = [...elev.getAllStops()];
                const hasStopsAbove = allStops.some(f => f > elev.currentFloor);
                const hasStopsBelow = allStops.some(f => f < elev.currentFloor);

                if (elevDir === 'UP' && !hasStopsAbove) {
                    elevDir = hasStopsBelow ? 'DOWN' : 'IDLE';
                } else if (elevDir === 'DOWN' && !hasStopsBelow) {
                    elevDir = hasStopsAbove ? 'UP' : 'IDLE';
                } else if (elevDir === 'IDLE' && elev.dropoffStops.size > 0) {
                    const maxDrop = Math.max(...elev.dropoffStops);
                    elevDir = maxDrop > elev.currentFloor ? 'UP' : 'DOWN';
                }

                // Update actual elevator direction
                if (elevDir !== 'IDLE' && elev.direction !== elevDir) {
                    elev.direction = elevDir;
                }

                const eligible = this.passengers.filter(p =>
                    p.state === 'WAITING' &&
                    p.startFloor === elev.currentFloor &&
                    elev.passengers.length < elev.capacity &&
                    (elevDir === 'IDLE' ||
                        (elevDir === 'UP' && p.direction === 'UP') ||
                        (elevDir === 'DOWN' && p.direction === 'DOWN'))
                );

                let boarded = 0;
                for (const p of eligible) {
                    if (elev.passengers.length >= elev.capacity) break;
                    p.startBoard(elev);
                    p.boardTime = this.simTime;
                    const waitTime = (this.simTime - p.waitStartTime) / 60;
                    this.stats.totalWaitTime += waitTime;
                    elev.passengers.push(p);
                    elev.addDropoff(p.destFloor);
                    boarded++;

                    // Set elevator direction if idle
                    if (elev.direction === 'IDLE') {
                        elev.direction = p.direction;
                    }
                }

                elev.doorPhase = 'waitBoard';
                elev.doorTimer = boarded > 0 ? 20 : 0;
                break;
            }

            case 'waitBoard': {
                // Wait for boarders to finish walking in
                const stillBoarding = this.passengers.some(
                    p => p.state === 'BOARDING' && p.elevator === elev
                );
                if (stillBoarding) return;

                elev.doorTimer -= speed;
                if (elev.doorTimer <= 0) {
                    elev.doorPhase = 'pausing';
                    elev.doorTimer = CONFIG.DOOR_PAUSE;
                }
                break;
            }

            case 'pausing':
                elev.doorTimer -= speed;
                if (elev.doorTimer <= 0) {
                    elev.startClosing();
                }
                break;
        }
    }

    getStats() {
        const waiting = this.passengers.filter(p => p.state === 'WAITING').length;
        const riding = this.passengers.filter(p => p.state === 'RIDING' || p.state === 'BOARDING').length;
        const entering = this.passengers.filter(p => p.state === 'ENTERING').length;
        const exiting = this.passengers.filter(p => p.state === 'EXITING' || p.state === 'LEAVING').length;

        const avgWait = this.stats.done > 0
            ? (this.stats.totalWaitTime / this.stats.done).toFixed(1) : '0.0';
        const avgTotal = this.stats.done > 0
            ? (this.stats.totalTripTime / this.stats.done).toFixed(1) : '0.0';

        return {
            total: this.stats.total,
            waiting,
            riding,
            done: this.stats.done,
            avgWait: avgWait + 's',
            avgTotal: avgTotal + 's',
        };
    }

    start() {
        this.lastTime = performance.now();
        this.accumulator = 0;
        const STEP = 16; // ms per simulation step

        const tick = () => {
            const now = performance.now();
            let elapsed = now - this.lastTime;
            this.lastTime = now;

            // Cap to prevent spiral of death
            if (elapsed > 2000) elapsed = 2000;

            this.accumulator += elapsed;

            while (this.accumulator >= STEP) {
                this.update();
                this.accumulator -= STEP;
            }

            this.renderer.render(this);
            this.updateUI();
        };

        // setInterval ensures simulation runs even in background tabs
        this.simInterval = setInterval(tick, 16);
    }

    stop() {
        if (this.simInterval) {
            clearInterval(this.simInterval);
            this.simInterval = null;
        }
    }

    updateUI() {
        const s = this.getStats();
        document.getElementById('statTotal').textContent = s.total;
        document.getElementById('statWaiting').textContent = s.waiting;
        document.getElementById('statRiding').textContent = s.riding;
        document.getElementById('statDone').textContent = s.done;
        document.getElementById('statAvgWait').textContent = s.avgWait;
        document.getElementById('statAvgTotal').textContent = s.avgTotal;

        // Elevator status
        const statusDiv = document.getElementById('elevStatus');
        statusDiv.innerHTML = this.elevators.map(e => {
            const dirClass = e.direction === 'UP' ? 'dir-up' :
                e.direction === 'DOWN' ? 'dir-down' : 'dir-idle';
            const dirSymbol = e.direction === 'UP' ? '\u25B2' :
                e.direction === 'DOWN' ? '\u25BC' : '\u25CF';
            const doorStr = e.doorState !== 'CLOSED' ? ' \uD83D\uDEAA' : '';
            return `<div class="elev-info">
                <span class="elev-label">A${e.id + 1}</span>
                <span class="elev-dir ${dirClass}">${dirSymbol}</span>
                ${FLOOR_NAMES[e.currentFloor]} | ${e.passengers.length}/${e.capacity}${doorStr}
            </div>`;
        }).join('');
    }
}

// ===== INITIALIZATION =====
function initApp() {
    const canvas = document.getElementById('canvas');
    const sim = new Simulation(canvas);

    // Controls
    const speedSlider = document.getElementById('speedSlider');
    const spawnSlider = document.getElementById('spawnSlider');
    const pauseBtn = document.getElementById('pauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    const spawnBtn = document.getElementById('spawnBtn');

    speedSlider.addEventListener('input', () => {
        const val = parseInt(speedSlider.value);
        sim.speedMultiplier = val;
        document.getElementById('speedVal').textContent = val + 'x';
    });

    spawnSlider.addEventListener('input', () => {
        const val = parseInt(spawnSlider.value);
        sim.spawnRate = val;
        document.getElementById('spawnVal').textContent = val === 0 ? 'Aus' : val;
    });

    pauseBtn.addEventListener('click', () => {
        sim.paused = !sim.paused;
        pauseBtn.textContent = sim.paused ? 'Weiter' : 'Pause';
        pauseBtn.classList.toggle('active', sim.paused);
    });

    resetBtn.addEventListener('click', () => {
        sim.reset();
        pauseBtn.textContent = 'Pause';
        pauseBtn.classList.remove('active');
    });

    spawnBtn.addEventListener('click', () => {
        sim.spawnPassenger();
    });

    // Set initial speed
    sim.speedMultiplier = parseInt(speedSlider.value);
    document.getElementById('speedVal').textContent = speedSlider.value + 'x';
    sim.spawnRate = parseInt(spawnSlider.value);

    window.sim = sim;
    sim.start();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
