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
  get offscreen() {
    const { width, birdWidth } = this.stage;
    return this.x < -birdWidth / 2 || this.x > width + birdWidth / 2;
  }
  resize(stage) {
    const previous = this.stage;
    this.stage = stage;
    this.x *= stage.width / Math.max(1, previous.width);
    this.y = clamp(this.y * stage.height / Math.max(1, previous.height), this.low, this.high);
    if (!this.away) this.begin(this.mode);
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
    if (mode === 'exit') {
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
  next() {
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
  // Comes back from either edge at a new height, heading inward.
  enter() {
    const { width, birdWidth } = this.stage;
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
    if (this.away > 0) {
      this.flapWings(dt, FLIGHT.modes.cruise.flap);
      this.away -= dt;
      if (this.away <= 0) this.enter();
      return;
    }
    const mode = FLIGHT.modes[this.mode];
    this.flapWings(dt, mode.flap);
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
    const wander = .08 * Math.sin(this.time / 1300 + this.phases[0]) + .05 * Math.sin(this.time / 470 + this.phases[1]);
    const reach = Math.tan(mode.slope);
    const slope = clamp(dy / Math.max(Math.abs(dx), 1) + wander, -reach, reach);
    // Without wingbeats it trades height for speed; flapping evens that out.
    // It hurries across behind the paper and takes its time on open cloth.
    const speed = mode.speed * pace * (1 + (mode.flap ? .12 : .5) * slope / Math.hypot(1, slope)) * (this.hidden ? 1.45 : .9);
    const vx = side * speed / Math.hypot(1, slope), yaw = FLIGHT.yaw * pace * dt;
    this.vx += clamp((vx - this.vx) * (1 - Math.exp(-dt / 260)), -yaw, yaw);
    // Height changes only ever ride on horizontal travel.
    const cap = Math.tan(FLIGHT.maxSlope) * Math.abs(this.vx);
    this.vy = clamp(this.vy + (slope * Math.abs(this.vx) - this.vy) * (1 - Math.exp(-dt / 300)), -cap, cap);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y < this.low || this.y > this.high) {
      this.y = clamp(this.y, this.low, this.high);
      this.vy = 0;
    }
    if (this.mode === 'exit' && this.offscreen) {
      this.away = FLIGHT.away[0] + (FLIGHT.away[1] - FLIGHT.away[0]) * this.random();
      return;
    }
    // Facing flips only once it is clearly moving the other way.
    if (Math.abs(this.vx) > .02 * pace) this.direction = Math.sign(this.vx);
    const climb = Math.atan2(-this.vy, Math.max(Math.abs(this.vx), .03 * pace));
    this.pitch += (clamp(-climb * .5, -FLIGHT.maxPitch, FLIGHT.maxPitch) - this.pitch) * (1 - Math.exp(-dt / 220));
    this.left -= dt;
    if (this.left <= 0 || (!this.circle && this.mode !== 'exit' && Math.hypot(dx, dy) < 30)) this.next();
  }
}
