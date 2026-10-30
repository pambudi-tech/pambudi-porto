import { clamp } from '../shared/math.mjs';

// Shared tuning for the dove's wandering flight. Speeds are px/ms, slopes are
// the steepest climb or dive in radians, and flaps are wing poses per ms (the
// source rhythm is one per 100ms). A mode without wingbeats glides with its
// wings held at the top of the stroke.
export const FLIGHT = {
  step: 20,
  modes: {
    cruise: { speed: .15, flap: 1 / 100, slope: .35 },
    climb: { speed: .12, flap: 1 / 70, slope: .5 },
    glide: { speed: .15, flap: 0, slope: .3 },
    swoop: { speed: .2, flap: 0, slope: .6 },
    circle: { speed: .13, flap: 1 / 95, slope: .45 },
    exit: { speed: .17, flap: 1 / 90, slope: .3 },
    // Coming in to rest, leaving the perch again, and answering the pointer.
    land: { speed: .15, flap: 1 / 90, slope: .55 },
    takeoff: { speed: .15, flap: 1 / 45, slope: .6 },
    follow: { speed: .2, flap: 1 / 60, slope: .55 },
  },
  // It never rises or falls without travelling across too: no path is
  // steeper than this, and turning back is a level turn.
  maxSlope: .6,
  // How quickly it can change horizontal speed, in px/ms², when turning back.
  yaw: .0004,
  maxPitch: .3,
  // Time on screen before it may leave, and time out of frame before it returns.
  exitAfter: 14000,
  away: [1200, 3600],
  // A visitor idle this long sends the dove to its nearest perch; the flare
  // begins this far out (px, scaled by pace). Taking off, it crouches this
  // long with its wings raised before it springs.
  restAfter: 3000,
  flare: 120,
  crouch: 160,
  // This soon after the pointer moves, the dove sets off for it, looking
  // again for where it has got to this often until it arrives.
  followDelay: 250,
  followEvery: 250,
};

export function seededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Steers the dove's centre toward changing targets around the open cloth.
// Speeds change smoothly, so every change of course is a curve. Positions
// are continuous; the bird snaps them to the stitch lattice when it draws.
// A fixed step and seeded randomness make the same seed fly the same path.
export class FlightPath {
  constructor(stage, { seed = 1, poses = 12 } = {}) {
    this.random = seededRandom(seed);
    this.poses = poses;
    this.phases = [this.random() * Math.PI * 2, this.random() * Math.PI * 2];
    this.stage = stage;
    this.time = 0;
    this.spare = 0;
    // Begin on screen, level and heading right, so the first-load reveal is seen.
    this.x = Math.max(stage.width * .16, stage.birdWidth / 2);
    this.y = this.low + (this.high - this.low) * .4;
    this.direction = 1;
    this.vx = FLIGHT.modes.cruise.speed * this.pace;
    this.vy = 0;
    this.pitch = 0;
    this.wing = 0;
    this.flap = FLIGHT.modes.cruise.flap;
    this.holding = false;
    this.away = 0;
    this.onScreen = 0;
    this.crouch = 0;
    this.idle = false;
    this.perches = [];
    this.perch = null;
    this.lure = null;
    this.lured = null;
    this.begin('cruise');
  }
  // The highest and lowest the centre goes: the box stays inside the sky band,
  // or centred where the band is shorter.
  get low() {
    const { top = 0, bottom = this.stage.height, birdHeight } = this.stage;
    return Math.min(top + birdHeight / 2, (top + bottom) / 2);
  }
  get high() {
    const { top = 0, bottom = this.stage.height, birdHeight } = this.stage;
    return Math.max(bottom - birdHeight / 2, (top + bottom) / 2);
  }
  // Narrow screens fly slower, so a crossing still takes a few seconds.
  get pace() {
    return clamp(this.stage.width / 1280, .55, 1.1);
  }
  get speed() {
    return Math.hypot(this.vx, this.vy);
  }
  get state() {
    const { birdWidth, birdHeight } = this.stage;
    return { x: this.x - birdWidth / 2, y: this.y - birdHeight / 2, direction: this.direction, pitch: this.pitch, wing: this.wing };
  }
  get hidden() {
    const { avoid, birdWidth } = this.stage, inset = birdWidth * .2;
    return Boolean(avoid) && this.x > avoid.left + inset && this.x < avoid.left + avoid.width - inset
      && this.y > avoid.top + inset && this.y < avoid.top + avoid.height - inset;
  }
  get resting() {
    return this.mode === 'rest';
  }
  // `perches` are where it may rest, each { x, y, direction }: the centre it
  // rests at and the way it faces there. It rests on the nearest.
  setPerches(perches) {
    const using = this.mode === 'rest' || this.mode === 'land' ? this.perch : null;
    this.perches = perches;
    this.perch = using && perches.find(perch => perch.direction === using.direction) || null;
    if (this.perch && this.mode === 'rest') Object.assign(this, { x: this.perch.x, y: this.perch.y });
    if (this.perch || (this.mode !== 'rest' && this.mode !== 'land')) return;
    if (this.mode === 'rest') this.begin('takeoff');
    else this.begin('cruise');
  }
  // An idle visitor sends the bird to its nearest perch, or to the one on
  // its side when it is out of frame; activity lifts it off the perch, or
  // turns it away from landing.
  setIdle(idle) {
    if (idle === this.idle) return;
    this.idle = idle;
    if (idle) {
      if (this.perches.length && !this.away && this.mode !== 'rest' && this.mode !== 'land') this.land();
      return;
    }
    if (this.mode === 'rest') this.begin('takeoff');
    else if (this.mode === 'land') this.begin('cruise');
  }
  land() {
    this.perch = this.perches.reduce((best, perch) =>
      Math.hypot(perch.x - this.x, perch.y - this.y) < Math.hypot(best.x - this.x, best.y - this.y) ? perch : best);
    this.begin('land');
  }
  // The pointer moved to x, y. A moment later the bird sets off for it.
  setLure(x, y) {
    this.lure = { x, y };
    if (this.mode !== 'follow') this.lured ??= this.time;
  }
  get offscreen() {
    const { width, birdWidth } = this.stage;
    return this.x < -birdWidth / 2 || this.x > width + birdWidth / 2;
  }
  resize(stage) {
    const previous = this.stage;
    this.stage = stage;
    this.x *= stage.width / Math.max(1, previous.width);
    this.y *= stage.height / Math.max(1, previous.height);
    if (this.mode !== 'rest' && this.mode !== 'land') this.y = clamp(this.y, this.low, this.high);
    if (!this.away && this.mode !== 'rest') this.begin(this.mode);
  }
  advance(delta) {
    this.spare += delta;
    while (this.spare >= FLIGHT.step) {
      this.step(FLIGHT.step);
      this.spare -= FLIGHT.step;
    }
  }
  begin(mode) {
    this.mode = mode;
    this.circle = null;
    const { width, birdWidth } = this.stage;
    const ahead = this.direction, random = this.random;
    if (mode === 'rest') {
      this.vx = this.vy = 0;
      this.left = Infinity;
    } else if (mode === 'land') {
      this.aim(this.perch);
      this.left = Infinity;
    } else if (mode === 'follow') {
      this.aim(this.lureTarget());
      this.retarget = FLIGHT.followEvery;
      this.left = 8000;
    } else if (mode === 'takeoff') {
      // It springs off the perch: wings raised and body tilted back for a
      // moment, then already at speed, climbing as steeply as it ever does
      // with quick wingbeats, the way it faces. From the very edge it leaves.
      const launch = FLIGHT.modes.takeoff.speed * this.pace, slope = Math.tan(FLIGHT.modes.takeoff.slope);
      this.wing = Math.ceil(this.wing / this.poses) * this.poses;
      this.flap = FLIGHT.modes.takeoff.flap;
      this.holding = true;
      this.crouch = FLIGHT.crouch;
      this.pitch = -FLIGHT.maxPitch * .7;
      this.vx = ahead * launch / Math.hypot(1, slope);
      this.vy = -Math.abs(this.vx) * slope;
      const pad = Math.min(birdWidth / 2, width / 2);
      const x = clamp(this.x + ahead * width * .3, pad, width - pad);
      if (Math.abs(x - this.x) < width * .1) {
        this.begin('exit');
        this.target = { x: ahead > 0 ? width + birdWidth : -birdWidth, y: Math.max(this.low, this.y - birdWidth * .3) };
        return;
      }
      this.target = { x, y: Math.max(this.low, this.y - Math.abs(x - this.x) * Math.tan(FLIGHT.modes.takeoff.slope) * .8) };
      this.left = 3000;
    } else if (mode === 'exit') {
      // Usually it leaves by the nearer edge, rather than crossing behind the paper.
      const nearer = this.x < width / 2 ? -1 : 1;
      const side = random() < .8 ? nearer : -nearer;
      this.target = { x: side > 0 ? width + birdWidth : -birdWidth, y: this.low + (this.high - this.low) * random() };
      this.left = Infinity;
    } else if (mode === 'circle') {
      // A wide lap round the paper, seen edge-on: across, turning at one end
      // and back at another height. It joins the ellipse from where it is,
      // turning the way it already faces.
      const span = this.high - this.low;
      const rx = Math.max(birdWidth * .6, Math.min(width / 2 - birdWidth / 2, width * (.3 + .1 * random())));
      const ry = Math.min(rx * (.15 + .1 * random()), span / 2);
      const cx = width / 2;
      const cy = clamp(this.y + (random() - .5) * span * .3, this.low + ry, Math.max(this.low + ry, this.high - ry));
      const angle = Math.atan2((this.y - cy) / Math.max(1, ry), (this.x - cx) / rx);
      this.circle = { cx, cy, rx, ry, angle, spin: -ahead * (Math.sign(Math.sin(angle)) || -1) };
      this.left = (.8 + .5 * random()) * Math.PI * (rx + ry) / (FLIGHT.modes.circle.speed * this.pace);
    } else {
      this.target = this.pick(mode);
      this.left = { cruise: 6000 + 4000 * random(), climb: 3000 + 2000 * random(), glide: 1800 + 1400 * random(), swoop: 3600 }[mode];
    }
  }
  // Open cloth around the paper, as ranges for the bird's centre: the bands
  // beside it and the strips above and below, wherever the bird fits.
  get areas() {
    const { width, birdWidth, avoid } = this.stage;
    const pad = Math.min(birdWidth / 2, width / 2), inset = birdWidth * .2;
    const sky = { left: pad, right: width - pad, top: this.low, bottom: this.high };
    if (!avoid) return [sky];
    const areas = [
      { ...sky, right: Math.min(sky.right, avoid.left + inset) },
      { ...sky, left: Math.max(sky.left, avoid.left + avoid.width - inset) },
      { ...sky, bottom: Math.min(sky.bottom, avoid.top + inset) },
      { ...sky, top: Math.max(sky.top, avoid.top + avoid.height - inset) },
    ].filter(area => area.right >= area.left && area.bottom >= area.top);
    return areas.length ? areas : [sky];
  }
  // Legs carry on the way the bird faces, usually across the paper to the
  // open cloth on the far side, sometimes a shorter hop. It turns back only
  // when there is no room left before the edge, so it never dithers on one side.
  pick(mode) {
    const { width, birdWidth } = this.stage, random = this.random;
    const room = this.direction > 0 ? width - this.x : this.x;
    const side = room < width * .3 ? -this.direction : this.direction;
    const ahead = this.areas
      .filter(area => side > 0 ? area.right > this.x + width * .15 : area.left < this.x - width * .15)
      .sort((a, b) => side * (b.left + b.right - a.left - a.right));
    const area = ahead.length && random() < .65 ? ahead[0] : null;
    const pad = Math.min(birdWidth / 2, width / 2);
    const x = area ? area.left + (area.right - area.left) * random()
      : clamp(this.x + side * width * (.2 + .25 * random()), pad, width - pad);
    const top = area?.top ?? this.low, bottom = area?.bottom ?? this.high, span = bottom - top;
    const y = {
      cruise: () => top + span * random(),
      climb: () => top + span * .25 * random(),
      glide: () => this.y + (this.high - this.low) * (.12 + .2 * random()),
      swoop: () => bottom - span * .15 * random(),
    }[mode]();
    // Never further up or down than the mode can reach on its way across.
    const reach = Math.abs(x - this.x) * Math.tan(FLIGHT.modes[mode].slope) * .9;
    return { x, y: clamp(clamp(y, this.y - reach, this.y + reach), top, bottom) };
  }
  // The pointer's position as a target inside the sky.
  lureTarget() {
    const { width, birdWidth } = this.stage, pad = Math.min(birdWidth / 2, width / 2);
    return { x: clamp(this.lure.x, pad, width - pad), y: clamp(this.lure.y, this.low, this.high) };
  }
  // Heads for `goal`. Where it lies too steeply above or below to reach
  // within the slope limit, the bird first turns at a waypoint: past the goal
  // if there is room, so it sweeps toward it at once and comes round, else
  // out on its own side. The waypoint is fixed per goal, so it never dithers.
  aim(goal) {
    this.goal = goal;
    this.waypoint = this.approachVia(goal);
    this.approach = this.waypoint ? 'out' : 'in';
  }
  approachVia(goal) {
    const slope = Math.tan(FLIGHT.modes[this.mode].slope * .9);
    const dx = goal.x - this.x, dy = goal.y - this.y, run = Math.abs(dy) / slope;
    if (Math.abs(dx) >= run) return null;
    const { width, birdWidth } = this.stage, pad = Math.min(birdWidth / 2, width / 2);
    const toward = Math.sign(dx) || this.direction;
    let x = goal.x + toward * (run - Math.abs(dx)) / 2;
    if (x < pad || x > width - pad) x = goal.x - toward * run;
    x = clamp(x, pad, width - pad);
    return { x, y: this.y + Math.sign(dy) * Math.min(Math.abs(dy), Math.abs(x - this.x) * slope) };
  }
  next() {
    if (this.idle && this.perches.length) return this.land();
    if (this.mode === 'swoop') return this.begin('climb');
    const height = (this.y - this.low) / Math.max(1, this.high - this.low);
    const room = this.direction > 0 ? this.stage.width - this.x : this.x;
    const weights = {
      cruise: 3,
      climb: height > .45 ? 2.5 : .4,
      glide: height < .6 ? 2 : .3,
      swoop: height < .5 ? 2.2 : 0,
      circle: .8,
      // Leaving is likeliest when it is already heading out at an edge.
      exit: this.onScreen > FLIGHT.exitAfter ? (room < this.stage.width * .25 ? 2.5 : .5) : 0,
    };
    // Glides and circles read best as occasional moments, never back to back.
    if (this.mode === 'glide' || this.mode === 'circle') weights[this.mode] = 0;
    let pick = this.random() * Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    for (const [mode, weight] of Object.entries(weights)) {
      pick -= weight;
      if (pick < 0) return this.begin(mode);
    }
    this.begin('cruise');
  }
  // Comes back from either edge at a new height, heading inward: toward the
  // pointer if it is following one. To rest, it comes in from the side it
  // will face away from, high enough to glide down to the perch without ever
  // dropping more steeply than a landing allows.
  enter() {
    const { width, birdWidth } = this.stage;
    if (this.lured !== null && this.lure) {
      const side = this.lure.x < width / 2 ? -1 : 1;
      this.lured = null;
      this.x = side < 0 ? -birdWidth / 2 : width + birdWidth / 2;
      this.y = clamp(this.lure.y, this.low, this.high);
      this.direction = -side;
      this.vx = -side * FLIGHT.modes.follow.speed * this.pace;
      this.vy = 0;
      this.pitch = 0;
      this.away = 0;
      this.onScreen = 0;
      return this.begin('follow');
    }
    if (this.idle && this.perches.length) {
      this.perch = this.perches.find(perch => Math.sign(perch.x - width / 2) === this.exitSide) ?? this.perches[0];
      const { x, y, direction } = this.perch;
      this.x = direction < 0 ? width + birdWidth / 2 : -birdWidth / 2;
      const reach = Math.abs(x - this.x) * Math.tan(FLIGHT.modes.land.slope) * .8;
      this.y = Math.max(Math.min(this.low, y), y - reach * (.4 + .6 * this.random()));
      this.direction = direction;
      this.vx = direction * FLIGHT.modes.land.speed * this.pace;
      this.vy = 0;
      this.pitch = 0;
      this.away = 0;
      this.onScreen = 0;
      return this.begin('land');
    }
    const side = this.random() < .5 ? -1 : 1;
    this.x = side < 0 ? -birdWidth / 2 : width + birdWidth / 2;
    this.y = this.low + (this.high - this.low) * (.1 + .8 * this.random());
    this.direction = -side;
    this.vx = -side * FLIGHT.modes.cruise.speed * this.pace;
    this.vy = 0;
    this.pitch = 0;
    this.away = 0;
    this.onScreen = 0;
    this.begin('cruise');
  }
  flapWings(dt, flap) {
    if (flap) {
      this.holding = false;
      this.flap += (flap - this.flap) * (1 - Math.exp(-dt / 300));
      this.wing += this.flap * dt;
      return;
    }
    if (this.holding) return;
    // A glide finishes the current stroke and holds the wings at its top.
    const next = this.wing + this.flap * dt, top = Math.ceil(this.wing / this.poses) * this.poses;
    this.holding = next >= top;
    this.wing = this.holding ? top : next;
  }
  step(dt) {
    this.time += dt;
    if (this.mode === 'rest') return;
    const answering = this.lured !== null && this.time - this.lured >= FLIGHT.followDelay && this.mode !== 'land';
    if (this.away > 0) {
      this.flapWings(dt, FLIGHT.modes.cruise.flap);
      this.away -= dt;
      if (this.away <= 0 || answering) this.enter();
      return;
    }
    if (this.mode === 'takeoff' && this.crouch > 0) {
      this.crouch -= dt;
      return;
    }
    if (answering) {
      this.lured = null;
      this.begin('follow');
    }
    if (this.mode === 'follow' && (this.retarget -= dt) <= 0) {
      const goal = this.lureTarget();
      if (Math.hypot(goal.x - this.goal.x, goal.y - this.goal.y) > 30) this.aim(goal);
      this.retarget = FLIGHT.followEvery;
    }
    const mode = FLIGHT.modes[this.mode], landing = this.mode === 'land';
    if (landing || this.mode === 'follow') {
      if (this.approach === 'out' && Math.abs(this.waypoint.x - this.x) < 20) this.approach = 'in';
      this.target = this.approach === 'out' ? this.waypoint : this.goal;
    }
    const distance = Math.hypot(this.target.x - this.x, this.target.y - this.y);
    // Coming in to land it flares, wings held high, and settles.
    const flaring = landing && this.approach === 'in' && distance < FLIGHT.flare * this.pace;
    this.flapWings(dt, flaring ? 0 : mode.flap);
    this.onScreen += dt;
    if (this.circle) {
      const circle = this.circle;
      circle.angle += circle.spin * mode.speed * this.pace / ((circle.rx + circle.ry) / 2) * dt;
      const lead = circle.angle + circle.spin * .5;
      this.target = { x: circle.cx + circle.rx * Math.cos(lead), y: circle.cy + circle.ry * Math.sin(lead) };
    }
    const dx = this.target.x - this.x, dy = this.target.y - this.y, pace = this.pace;
    // Head for the target's side. Turning back is a level turn: the bird
    // slows, turns and sets off again, rather than looping up and over.
    const side = Math.abs(dx) > 2 ? Math.sign(dx) : Math.sign(this.vx) || this.direction;
    // The slope toward the target, with a little wander so no leg looks ruled,
    // and never steeper than the mode allows.
    const wander = (.08 * Math.sin(this.time / 1300 + this.phases[0]) + .05 * Math.sin(this.time / 470 + this.phases[1]))
      * (landing ? clamp(distance / 300) : 1);
    const reach = Math.tan(mode.slope);
    const slope = clamp(dy / Math.max(Math.abs(dx), 1) + wander, -reach, reach);
    // Without wingbeats it trades height for speed; flapping evens that out.
    // It hurries across behind the paper and takes its time on open cloth.
    const pacing = landing && this.approach === 'in' ? clamp(distance / (160 * pace), .06, 1) : landing ? 1 : this.hidden ? 1.45 : .9;
    const speed = mode.speed * pace * (1 + (mode.flap ? .12 : .5) * slope / Math.hypot(1, slope)) * pacing;
    const vx = side * speed / Math.hypot(1, slope), yaw = FLIGHT.yaw * pace * dt;
    this.vx += clamp((vx - this.vx) * (1 - Math.exp(-dt / 260)), -yaw, yaw);
    // Height changes only ever ride on horizontal travel.
    const cap = Math.tan(FLIGHT.maxSlope) * Math.abs(this.vx);
    this.vy = clamp(this.vy + (slope * Math.abs(this.vx) - this.vy) * (1 - Math.exp(-dt / 300)), -cap, cap);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (!landing && (this.y < this.low || this.y > this.high)) {
      this.y = clamp(this.y, this.low, this.high);
      this.vy = 0;
    }
    if (landing && this.approach === 'in' && Math.hypot(this.target.x - this.x, this.target.y - this.y) < 3) {
      this.direction = this.perch.direction;
      this.pitch = 0;
      return this.begin('rest');
    }
    if (this.mode === 'exit' && this.offscreen) {
      this.exitSide = this.x < this.stage.width / 2 ? -1 : 1;
      this.away = FLIGHT.away[0] + (FLIGHT.away[1] - FLIGHT.away[0]) * this.random();
      return;
    }
    // Facing flips only once it is clearly moving the other way.
    if (Math.abs(this.vx) > .02 * pace) this.direction = Math.sign(this.vx);
    const climb = Math.atan2(-this.vy, Math.max(Math.abs(this.vx), .03 * pace));
    this.pitch += (clamp(-climb * .5, -FLIGHT.maxPitch, FLIGHT.maxPitch) - this.pitch) * (1 - Math.exp(-dt / 220));
    this.left -= dt;
    // Following, only reaching the pointer counts, not the run out before it.
    const arrived = this.mode === 'follow'
      ? this.approach === 'in' && Math.hypot(this.goal.x - this.x, this.goal.y - this.y) < 40
      : Math.hypot(dx, dy) < 30;
    if (this.left <= 0 || (!this.circle && !landing && this.mode !== 'exit' && arrived)) this.next();
  }
}
