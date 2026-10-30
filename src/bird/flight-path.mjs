import { clamp } from '../shared/math.mjs';

// Shared tuning for the dove's wandering flight. Speeds are px/ms, turns are
// rad/ms and flaps are wing poses per ms (the source rhythm is one per 100ms).
// A mode without wingbeats glides with its wings held at the top of the stroke.
export const FLIGHT = {
  step: 20,
  modes: {
    cruise: { speed: .15, flap: 1 / 100, turn: .0026 },
    climb: { speed: .12, flap: 1 / 70, turn: .0024 },
    glide: { speed: .15, flap: 0, turn: .0017 },
    swoop: { speed: .2, flap: 0, turn: .0021 },
    circle: { speed: .13, flap: 1 / 95, turn: .0045 },
    exit: { speed: .17, flap: 1 / 90, turn: .0026 },
  },
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

const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

// Steers the dove's centre toward changing targets around the open cloth,
// with a limited turn rate so every change of course is a curve. Positions
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
    this.heading = 0;
    this.direction = 1;
    this.speed = FLIGHT.modes.cruise.speed * this.pace;
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
  get state() {
    const { birdWidth, birdHeight } = this.stage;
    return { x: this.x - birdWidth / 2, y: this.y - birdHeight / 2, direction: this.direction, pitch: this.pitch, wing: this.wing };
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
      // An orbit seen edge-on: onward, up and over, back, and down again,
      // centred in the open area the bird is in. It joins the ellipse from
      // where it is, turning the way it already faces.
      const area = this.area(), span = this.high - this.low;
      const rx = Math.min(width * (.08 + .07 * random()), Math.max(40, (area.right - area.left) / 2));
      const ry = Math.min(rx * (.35 + .2 * random()), span / 2);
      const cx = clamp(this.x + ahead * rx * .4, area.left + rx, Math.max(area.left + rx, area.right - rx));
      const cy = clamp(this.y + (random() - .5) * span * .4, this.low + ry, Math.max(this.low + ry, this.high - ry));
      const angle = Math.atan2((this.y - cy) / Math.max(1, ry), (this.x - cx) / rx);
      this.circle = { cx, cy, rx, ry, angle, spin: -ahead * (Math.sign(Math.sin(angle)) || -1) };
      this.left = (1 + .6 * random()) * Math.PI * (rx + ry) / (FLIGHT.modes.circle.speed * this.pace);
    } else {
      this.target = this.pick(mode);
      this.left = { cruise: 4500 + 3500 * random(), climb: 2600 + 1600 * random(), glide: 1400 + 1400 * random(), swoop: 3200 }[mode];
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
  // The open area the bird is in, or the nearest one.
  area() {
    const distance = area => Math.hypot(this.x - clamp(this.x, area.left, area.right), this.y - clamp(this.y, area.top, area.bottom));
    return this.areas.reduce((best, area) => distance(area) < distance(best) ? area : best);
  }
  // Most legs keep to the open area the bird is in, moving on within it;
  // some cross behind the paper to another.
  pick(mode) {
    const random = this.random, here = this.area(), others = this.areas.filter(area => area !== here);
    const crossing = others.length > 0 && random() < { cruise: .45, glide: .5, swoop: .35, climb: .15 }[mode];
    const area = crossing ? others[Math.floor(random() * others.length)] : here;
    const fold = (value, low, high) => clamp(value > high ? 2 * high - value : value < low ? 2 * low - value : value, low, high);
    const x = crossing ? area.left + (area.right - area.left) * random()
      : fold(this.x + this.direction * (area.right - area.left) * (.3 + .5 * random()), area.left, area.right);
    const span = area.bottom - area.top;
    const y = {
      cruise: () => area.top + span * random(),
      climb: () => area.top + span * .25 * random(),
      glide: () => this.y + (this.high - this.low) * (.12 + .2 * random()),
      swoop: () => area.bottom - span * .15 * random(),
    }[mode]();
    return { x, y: clamp(y, area.top, area.bottom) };
  }
  next() {
    if (this.mode === 'swoop') return this.begin('climb');
    const height = (this.y - this.low) / Math.max(1, this.high - this.low);
    const weights = {
      cruise: 3,
      climb: height > .45 ? 2.5 : .4,
      glide: height < .6 ? 2 : .3,
      swoop: height < .4 ? 1.6 : 0,
      circle: 1,
      exit: this.onScreen > FLIGHT.exitAfter ? 1.1 : 0,
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
    this.heading = (side < 0 ? 0 : Math.PI) + (this.random() - .5) * .5;
    this.direction = -side;
    this.speed = FLIGHT.modes.cruise.speed * this.pace;
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
    const dx = this.target.x - this.x, dy = this.target.y - this.y;
    // A little wander keeps even a straight leg from looking ruled.
    const wander = .22 * Math.sin(this.time / 1300 + this.phases[0]) + .12 * Math.sin(this.time / 470 + this.phases[1]);
    let turn = wrap(Math.atan2(dy, dx) + wander - this.heading);
    // Turning back, it pulls up and over, unless it is already near the top.
    if (Math.abs(turn) > 2.4) {
      const up = this.y - this.low > (this.high - this.low) * .3 ? 1 : -1;
      turn = Math.abs(turn) * Math.sign(wrap(-Math.PI / 2 - this.heading)) * up;
    }
    this.heading = wrap(this.heading + clamp(turn, -mode.turn * dt, mode.turn * dt));
    let sin = Math.sin(this.heading);
    const cos = Math.cos(this.heading);
    // Without wingbeats it trades height for speed; flapping evens that out.
    const speed = mode.speed * this.pace * (1 + (mode.flap ? .12 : .5) * sin);
    this.speed += (speed - this.speed) * (1 - Math.exp(-dt / 450));
    this.x += cos * this.speed * dt;
    this.y += sin * this.speed * dt;
    if (this.y < this.low || this.y > this.high) {
      this.y = clamp(this.y, this.low, this.high);
      this.heading = cos >= 0 ? 0 : Math.PI;
      sin = 0;
    }
    if (this.mode === 'exit' && this.offscreen) {
      this.away = FLIGHT.away[0] + (FLIGHT.away[1] - FLIGHT.away[0]) * this.random();
      return;
    }
    // Facing flips only once it is clearly heading the other way.
    if (cos > .2) this.direction = 1;
    else if (cos < -.2) this.direction = -1;
    const climb = Math.atan2(-sin, Math.abs(cos));
    this.pitch += (clamp(-climb * .45, -FLIGHT.maxPitch, FLIGHT.maxPitch) - this.pitch) * (1 - Math.exp(-dt / 220));
    this.left -= dt;
    if (this.left <= 0 || (!this.circle && this.mode !== 'exit' && Math.hypot(dx, dy) < 30)) this.next();
  }
}
