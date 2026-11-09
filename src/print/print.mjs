import {
  BufferAttribute, BufferGeometry, DirectionalLight, Group, HemisphereLight, LineBasicMaterial, LineSegments, Matrix4, Mesh,
  MeshBasicMaterial, MeshMatcapMaterial, MeshStandardMaterial,
  CanvasTexture, NeutralToneMapping, PerspectiveCamera, PMREMGenerator, Raycaster, Scene, SRGBColorSpace, Vector2,
  Vector3, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { paperTarget, advancePaper } from '../paper/paper-motion.mjs';
import { paperFlipPoseAt, paperFlipDirection, PAPER_FLIP } from '../paper/paper-flip.mjs';

// The card as it prints: the 3MF the page offers for download
// (tools/build-card-3d.py), drawn from the file itself, every triangle as
// written: the card page's paper, 1.4 mm thick, with the wax seal locked
// into the middle of its back (push, and a turn). A mouse anywhere brings
// the lamp and over the card it tilts, as on the card page. A drag turns it
// any way and it stays as left; a tap brings it back face on, or, face on
// already, turns it over. Explode turns the seal back and lifts it out, the
// card turned to show it; again, and it all goes back the way it came.
// Taken apart, a tap on the seal, or "wax detail" beneath it, shows it
// alone: the card fades, the seal comes to the middle, larger, and turns and
// taps as the card did; "back to card", a tap beside it, or Escape, goes back.

const motion = matchMedia('(prefers-reduced-motion: reduce)');
const canvas = document.querySelector('.model');
const status = document.querySelector('.loading');
const explodeButton = document.querySelector('.explode');
const meshButton = document.querySelector('.mesh-view');
const cue = document.querySelector('.seal-cue');
const viewCue = document.querySelector('.view-cue');

// CSS millimetres, and the card page's perspective (card.css .paper).
const PX_PER_MM = 96 / 25.4;
const PERSPECTIVE = 1400;
const rad = degrees => degrees * Math.PI / 180;

// —— The scene ——
const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = NeutralToneMapping;
const scene = new Scene();
scene.environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;
scene.environmentIntensity = .3;
scene.add(new HemisphereLight(0xffffff, 0xd8d4cc, .5));
const lamp = new DirectionalLight(0xffffff, 3.2);
scene.add(lamp, lamp.target);
const camera = new PerspectiveCamera(30, 1, 1, 1000);

// PLA: white for the card, red for the seal, both matte.
// Pushed back a hair, so the sharp edges' lines lie on them cleanly.
const behind = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
const MATERIALS = {
  card: new MeshStandardMaterial({ color: 0xe8e6e0, roughness: .7, metalness: 0, ...behind }),
  seal: new MeshStandardMaterial({ color: 0x9e1b24, roughness: .42, metalness: 0, ...behind }),
};
// The sharp edges, as a drawing's lines: the pattern's walls, the outline,
// the P, the tabs (print-file.worker.mjs finds them in the file).
const EDGE_OPACITY = { card: .55, seal: .5 };
const EDGES = {
  card: new LineBasicMaterial({ color: 0x5f5d55, transparent: true, opacity: EDGE_OPACITY.card, depthWrite: false, toneMapped: false }),
  seal: new LineBasicMaterial({ color: 0x4f0a10, transparent: true, opacity: EDGE_OPACITY.seal, depthWrite: false, toneMapped: false }),
};

// The mesh view: no lamp and no shadow. Each part is shaded only by how far
// it turns from the eye, alike on every side (a slope is a touch darker
// whichever way it faces), with every triangle's edges drawn over it as the
// file has them, clearer the closer in; `step` is the file's spacing there (mm).
const evenLight = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  const fade = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  fade.addColorStop(0, '#ffffff');
  fade.addColorStop(.55, '#f1f1f1');
  fade.addColorStop(1, '#9d9d9d');
  g.fillStyle = fade;
  g.fillRect(0, 0, 256, 256);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
})();
const fill = color => new MeshMatcapMaterial({ color, matcap: evenLight, toneMapped: false,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const edges = color => new MeshBasicMaterial({ color, toneMapped: false, wireframe: true, transparent: true, depthWrite: false });
const MESH_VIEW = {
  card: { fill: fill(0xf2f1ec), edges: edges(0x55534b), step: .1 },
  seal: { fill: fill(0xf0cfd1), edges: edges(0x8a1820), step: .06 },
};
// Edges a pixel apart would only grey the surface: they come in as they part.
function fadeEdges() {
  for (const [kind, { edges: material, step }] of Object.entries(MESH_VIEW)) {
    const px = step * pxPerMm() * shownZoom();
    material.opacity = Math.max(.05, Math.min(.6, (px - .8) / 5)) * (kind === 'card' ? 1 - focusing() : 1);
  }
}
const solids = [];   // [{ mesh, kind }], as loaded
let wires = null;    // their edges, made the first time they're shown

// Hover and press on the outside, the turn inside it, the parts in the turn
// (as the card page's .paper and .paper-turn).
const posed = new Group();
const turned = new Group();
const parts = new Group();
const sealAxis = new Group();
posed.add(turned);
turned.add(parts);
scene.add(posed);

let fit = null;   // card-3d.json: sizes, the seal's place and its last turn

// —— Pose ——
const pointer = { x: 0, y: 0, hovered: false, lit: false, pressed: false };
const target = () => paperTarget({ ...pointer, reduced: motion.matches });
let pose = target();
// The turn: round the upright axis, a tilt, and a flip's lift (px, as the card page's).
const view = { angle: 0, tilt: 0, y: 0, z: 0, rock: 0 };
// The seal: 0 locked on, 1 turned back and lifted out.
let apart = 0;

// Explode: the card turns to show its back at an angle while the seal turns
// back (as the bayonet opens), then the seal lifts clear.
const EXPLODE = Object.freeze({ duration: 1700, yaw: 38, tilt: 16, lift: 16,
  view: [0, .62], unlock: [.1, .45], rise: [.4, 1] });
// The seal alone: 0 with the card, 1 on its own (`focused` is where it's going).
let focus = 0, focused = false, focusedFrom = null;
const FOCUS = Object.freeze({ duration: 760, fill: .52, maxZoom: 8 });
const focusing = () => smooth(focus);
const restOffset = () => (apart && !focused ? -EXPLODE.yaw : 0);
const restTilt = () => (apart && !focused ? EXPLODE.tilt : 0);
const share = (t, [from, to]) => Math.max(0, Math.min(1, (t - from) / (to - from)));
const smooth = t => t * t * (3 - 2 * t);
const easeOut = t => 1 - (1 - t) ** 3;

function placeSeal() {
  if (!fit) return;
  const unlock = smooth(share(apart, EXPLODE.unlock));
  const rise = easeOut(share(apart, EXPLODE.rise));
  // Anticlockwise seen from the back, back to the notches, then out; shown
  // alone, it comes round again to stand its P upright.
  sealAxis.rotation.z = -rad(fit.unlock_deg) * unlock * (1 - focusing());
  sealAxis.position.z = -rise * EXPLODE.lift;
}

// —— Size on screen ——
const SCALE_KEY = 'card.pambudi.xyz/scale';
const SOURCE_SCALE = 1.326;
const readScale = () => {
  try {
    const value = parseFloat(localStorage.getItem(SCALE_KEY));
    return value >= .5 && value <= 2.5 ? value : SOURCE_SCALE;
  } catch { return SOURCE_SCALE; }
};
let scale = readScale();
let viewSize = [innerWidth, innerHeight];
let zoom = 1, pan = [0, 0];       // shown
let zoomTo = 1, panTo = [0, 0];   // aimed for
let rect = null;                  // the card on screen, at rest
const pxPerMm = () => PX_PER_MM * scale;
const CARD_MM = [67.75, 85];

// Alone, the seal fills about half the window's shorter side.
const sealZoom = () => Math.max(1.5, Math.min(FOCUS.maxZoom, Math.min(...viewSize) * FOCUS.fill / ((fit?.seal_mm ?? 19) * pxPerMm())));
const shownZoom = () => zoom * (1 + (sealZoom() - 1) * focusing());
function frameCamera() {
  const [w, h] = viewSize;
  const f = focusing(), z = shownZoom(), px = pan[0] * (1 - f), py = pan[1] * (1 - f);
  camera.aspect = w / h;
  // The card's middle at PERSPECTIVE px from the eye, as the card page's
  // perspective: at zoom 1 it shows at its printed size.
  camera.fov = 2 * Math.atan(h / 2 / PERSPECTIVE) * 180 / Math.PI;
  camera.position.set(0, 0, PERSPECTIVE / pxPerMm());
  camera.near = camera.position.z / 10;
  camera.far = camera.position.z * 3;
  camera.zoom = z;
  camera.setViewOffset(w, h, -px, -py, w, h);
  camera.updateProjectionMatrix();
  // What a press turns and a tap answers: the card, or the seal alone.
  const seal = (fit?.seal_mm ?? 19) * pxPerMm() * z;
  const cw = CARD_MM[0] * pxPerMm() * z + (seal - CARD_MM[0] * pxPerMm() * z) * f;
  const ch = CARD_MM[1] * pxPerMm() * z + (seal - CARD_MM[1] * pxPerMm() * z) * f;
  rect = new DOMRect(w / 2 + px - cw / 2, h / 2 + py - ch / 2, cw, ch);
}
function resize() {
  viewSize = [innerWidth, innerHeight];
  renderer.setSize(viewSize[0], viewSize[1], false);
  css.setSize(viewSize[0], viewSize[1]);
  panTo = clampPan(panTo, zoomTo);
  frameCamera();
  request();
}

// —— Drawing ——
let sealMiddle = 0;   // the seal's middle through its thickness, from its axis (mm)
let cardShown = 1;
function fadeCard(alpha) {
  if (alpha === cardShown) return;
  const card = solids.find(solid => solid.kind === 'card');
  for (const material of [MATERIALS.card, MESH_VIEW.card.fill]) {
    const see = alpha < 1;
    if (material.transparent !== see) { material.transparent = see; material.needsUpdate = true; }
    material.opacity = alpha;
    material.depthWrite = !see;
  }
  card.mesh.visible = alpha > .001;
  const meshView = meshButton.getAttribute('aria-pressed') === 'true';
  EDGES.card.opacity = EDGE_OPACITY.card * alpha;
  card.sharp.visible = card.mesh.visible && !meshView;
  if (wires) wires[solids.indexOf(card)].visible = card.mesh.visible && meshView;
  cardShown = alpha;
}
function write() {
  frameCamera();
  posed.rotation.set(rad(-pose.rx), rad(pose.ry), 0);
  posed.scale.setScalar(pose.scale);
  const mm = 1 / pxPerMm();
  turned.position.set(0, -view.y * mm, view.z * mm);
  turned.rotation.set(rad(-(view.tilt + view.rock)), rad(view.angle), 0, 'XYZ');
  placeSeal();
  if (fit) {
    // The turn's centre moves from the card's middle to the seal's.
    const f = focusing();
    parts.position.z = -(fit.stock_mm / 2 + (sealAxis.position.z + sealMiddle - fit.stock_mm / 2) * f);
    fadeCard(1 - f);
  }
  if (wires?.[0].visible) fadeEdges();
  // The lamp: from the upper left at rest, towards a mouse on the page.
  const l = pose.light;
  lamp.position.set(-.75 * (1 - l) + pose.lx * 1.3 * l, .9 * (1 - l) - pose.ly * 1.3 * l, .7 - .1 * l).multiplyScalar(100);
  renderer.render(scene, camera);
  placeCue();
  holdDims();
  css.render(scene, camera);
}

// —— Cues ——
// Under the seal: "wax detail" taken apart (while its side of the card faces
// the eye), "back to card" when it's shown alone. Under the card, turned by
// hand off its view: "default view". None while anything is on its way.
let cueSettled = false;   // set once explode or focus has come to rest
const sealCentre = new Vector3(), backNormal = new Vector3();
function showCue(element, text, x, y) {
  if (!text) {
    if (element.dataset.shown !== undefined) delete element.dataset.shown;
    return;
  }
  if (element.textContent !== text) element.textContent = text;
  element.hidden = false;
  if (element.dataset.shown === undefined) {
    requestAnimationFrame(() => { element.dataset.shown = ''; });
    // Focus that waited on the card while the cue was away comes back to it.
    if (element.dataset.refocus !== undefined && document.activeElement === canvas) element.focus({ preventScroll: true });
    delete element.dataset.refocus;
  }
  element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translateX(-50%)`;
}
function placeCue() {
  const seal = solids.find(solid => solid.kind === 'seal')?.mesh;
  let text = null, x = 0, y = 0;
  if (seal && cueSettled && apart === 1) {
    backNormal.set(0, 0, -1).transformDirection(turned.matrixWorld);
    if (focused) text = 'back to card';
    else if (backNormal.z > .05) text = 'wax detail';
  }
  if (text) {
    seal.geometry.boundingBox.getCenter(sealCentre).applyMatrix4(seal.matrixWorld).project(camera);
    x = (sealCentre.x + 1) / 2 * viewSize[0];
    // Below the seal's edge; alone, below its dimensions' caption too.
    y = (1 - sealCentre.y) / 2 * viewSize[1] + (fit.seal_mm / 2) * pxPerMm() * shownZoom() + (focused ? 88 : 14);
  }
  showCue(cue, text, x, y);
  const turnedAway = seal && !focused && !busy() && !spin && (apart === 0 || cueSettled) && !atRest();
  showCue(viewCue, turnedAway ? 'default view' : null, rect.left + rect.width / 2, Math.min(rect.bottom + 84, viewSize[1] - 96));
}
for (const element of [cue, viewCue]) {
  element.addEventListener('transitionend', () => {
    if (element.dataset.shown !== undefined) return;
    // A keyboard on the cue waits on the card while it's away.
    if (document.activeElement === element) {
      canvas.focus({ preventScroll: true });
      element.dataset.refocus = '';
    }
    element.hidden = true;
  });
}
viewCue.addEventListener('click', () => faceOn());

// —— Dimensions ——
// As on the card page, drawn on the faces themselves, so they tilt, turn and
// go round with the card: the width above, the height at the right, the side
// below with the thickness. The seal shown alone has its own. HTML in the
// model's space (three's CSS3DRenderer, the same camera), so the type stays
// type; laid out at their size on screen (re-laid as the zoom moves), so the
// figures and rules stay crisp and keep their size.
// Sizes are the print file's (card-3d.json).
const css = new CSS3DRenderer();
css.domElement.className = 'dims-layer';
css.domElement.setAttribute('aria-hidden', 'true');
canvas.after(css.domElement);
const dimSets = [];   // [{ object, element, size: [w, h], kind: 'card' | 'seal' }]
const mmText = value => `${Number(value.toFixed(2))} mm`;
function addDims(parent, kind, [x, y, z], turnedRound, [w, h], side, thick) {
  const element = document.createElement('div');
  element.className = 'dims3d';
  element.innerHTML = '<div class="d3-width"><span class="d3-label"></span></div>'
    + '<div class="d3-height"><span class="d3-label"></span></div>'
    + '<p class="d3-side"><span></span><span class="d3-thick"></span></p>';
  const [width, height] = element.querySelectorAll('.d3-label');
  width.textContent = mmText(w);
  height.textContent = mmText(h);
  element.querySelector('.d3-side span').textContent = side;
  element.querySelector('.d3-thick').textContent = thick;
  const object = new CSS3DObject(element);
  element.style.pointerEvents = 'none';
  object.position.set(x, y, z);
  // A back face reads from behind, unmirrored, as the card page's.
  if (turnedRound) object.rotation.y = Math.PI;
  parent.add(object);
  dimSets.push({ object, element, size: [w, h], kind });
}
// Laid out in CSS px at the size they show (px per mm times the zoom), then
// scaled back into millimetres: the camera brings them to that size again.
let laidAt = null;
function sizeDims() {
  const px = pxPerMm() * shownZoom();
  if (px === laidAt) return;
  laidAt = px;
  for (const { object, element, size: [w, h] } of dimSets) {
    element.style.width = `${(w * px).toFixed(2)}px`;
    element.style.height = `${(h * px).toFixed(2)}px`;
    object.scale.setScalar(1 / px);
  }
}
// Each set shows only while its face is turned to the eye (worked out here:
// the browser's backface-visibility didn't hold for every set).
const facing = new Vector3(), toEye = new Vector3();
function holdDims() {
  sizeDims();
  const shown = { card: cardShown, seal: focusing() };
  for (const set of dimSets) {
    const opacity = shown[set.kind];
    set.object.updateMatrixWorld();
    facing.set(0, 0, 1).transformDirection(set.object.matrixWorld);
    toEye.setFromMatrixPosition(set.object.matrixWorld).negate().add(camera.position);
    set.object.visible = opacity > .001 && facing.dot(toEye) > 0;
    if (set.opacity !== opacity) { set.opacity = opacity; set.element.style.opacity = opacity.toFixed(3); }
  }
}
cue.addEventListener('click', () => (focused ? unfocus() : focusSeal()));

// One frame at a time, only while something moves.
let frame = null, last = null, tween = null, spin = null;
const request = () => { frame ??= requestAnimationFrame(tick); };
function tick(now) {
  frame = null;
  const elapsed = last === null ? 16 : Math.min(64, now - last);
  last = now;
  let moving = false;
  if (tween) {
    if (tween.step(now)) moving = true;
    else { const done = tween.done; tween = null; done?.(); moving = true; }
  }
  const next = target();
  pose = advancePaper(pose, next, elapsed);
  if (Object.keys(next).some(key => pose[key] !== next[key])) moving = true;
  if (zoomStep(elapsed)) moving = true;
  if (fit) write();
  if (moving) request();
  else last = null;
}

// A tween: `update` gets the share of `duration` gone, then `done` runs.
function play(duration, update, done) {
  const start = performance.now();
  tween = {
    step: now => {
      const t = duration ? Math.min(1, (now - start) / duration) : 1;
      update(t);
      return t < 1;
    },
    done,
  };
  request();
}
// cubic-bezier(.22, 1, .36, 1), the site's ease-out (tokens.css --ease-out).
function bezier(x1, y1, x2, y2) {
  const at = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return x => {
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 24; i++) { if (at(x1, x2, t) < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return at(y1, y2, t);
  };
}
const EASE_OUT = bezier(.22, 1, .36, 1);
const busy = () => Boolean(tween || spin?.moving);
// Face on: the front or back square to the eye (taken apart, their turned views).
const nearestRest = () => Math.round((view.angle - restOffset()) / 180) * 180 + restOffset();
const atRest = () => Math.abs(view.angle - nearestRest()) < .01 && Math.abs(view.tilt - restTilt()) < .01;
const label = () => {
  const back = Math.cos(rad(view.angle)) < 0;
  const thing = focused ? 'seal' : 'card';
  canvas.setAttribute('aria-label', !atRest() ? `Bring the ${thing} back face on`
    : focused ? (back ? 'Turn the seal to its peg' : 'Turn the seal to its face')
    : back ? 'Turn the card to its front' : 'Turn the card to its back');
};

// —— Turning over ——
function turnOver(direction) {
  if (!fit || busy()) return;
  pointer.hovered = pointer.pressed = false;
  const from = view.angle, to = view.angle + 180 * direction;
  const done = () => { view.angle = to; view.y = view.z = view.rock = 0; label(); };
  if (motion.matches) { done(); request(); return; }
  play(PAPER_FLIP.duration, t => {
    const p = paperFlipPoseAt(t, from, to);
    view.angle = p.angle; view.y = p.y; view.z = p.z; view.rock = p.rx;
  }, done);
}

// —— Turning by hand ——
// A press that travels turns the card: across, round its upright axis; up
// and down, over its width. Let go, it carries on a little with the swipe's
// speed and stays as it is. A tap brings it back face on; face on, a tap
// turns it over.
const SPIN_START = 6;
const SPIN = Object.freeze({ degreesPerPx: .45, tiltPerPx: .45, tiltMax: 85, carryMs: 220, glideMs: 520, backMs: 640 });
let spun = false;
const onCard = (x, y) => rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
const ray = new Raycaster(), at = new Vector2(), toSeal = new Matrix4();
function onSeal(x, y) {
  const seal = solids.find(solid => solid.kind === 'seal')?.mesh;
  if (!seal) return false;
  at.set(x / viewSize[0] * 2 - 1, -(y / viewSize[1]) * 2 + 1);
  ray.setFromCamera(at, camera);
  return ray.ray.applyMatrix4(toSeal.copy(seal.matrixWorld).invert()).intersectsBox(seal.geometry.boundingBox);
}

canvas.addEventListener('pointerdown', event => {
  if (!fit || event.button !== 0 || tween || touches.size || !onCard(event.clientX, event.clientY)) return;
  spun = false;
  canvas.setPointerCapture(event.pointerId);
  spin = { id: event.pointerId, x: event.clientX, y: event.clientY, from: view.angle, tiltFrom: view.tilt, moving: false, samples: [] };
  pointer.pressed = true;
  request();
});
const clampTilt = tilt => Math.max(-SPIN.tiltMax, Math.min(SPIN.tiltMax, tilt));
canvas.addEventListener('pointermove', event => {
  if (!spin || event.pointerId !== spin.id) return;
  const dx = event.clientX - spin.x, dy = event.clientY - spin.y;
  if (!spin.moving) {
    if (Math.hypot(dx, dy) < SPIN_START) return;
    spin.moving = true;
    canvas.classList.add('spinning');
    pointer.hovered = pointer.pressed = false;
  }
  view.angle = spin.from + dx * SPIN.degreesPerPx;
  view.tilt = clampTilt(spin.tiltFrom - dy * SPIN.tiltPerPx);
  const now = event.timeStamp;
  spin.samples.push([now, view.angle, view.tilt]);
  while (spin.samples.length > 2 && now - spin.samples[0][0] > 90) spin.samples.shift();
  request();
});
function letGo(event) {
  if (!spin || event.pointerId !== spin.id) return;
  const { moving, samples } = spin;
  spin = null;
  pointer.pressed = false;
  if (!moving) { request(); return; }
  spun = true;
  canvas.classList.remove('spinning');
  // Carried on by the swipe's speed, slowing to a stop where it is.
  const [[t0, a0, b0]] = samples, [t1, a1, b1] = samples.at(-1);
  const k = t1 > t0 ? SPIN.carryMs / (t1 - t0) : 0;
  glideTo(view.angle + (a1 - a0) * k, clampTilt(view.tilt + (b1 - b0) * k), motion.matches ? 0 : SPIN.glideMs);
}
function glideTo(angle, tilt, duration) {
  const from = view.angle, tiltFrom = view.tilt;
  play(duration, t => {
    const e = EASE_OUT(t);
    view.angle = from + (angle - from) * e;
    view.tilt = tiltFrom + (tilt - tiltFrom) * e;
  }, () => { view.angle = angle; view.tilt = tilt; label(); });
}
// Back face on, to the nearer face (taken apart, its turned view).
function faceOn() {
  if (!fit || busy()) return;
  pointer.hovered = pointer.pressed = false;
  glideTo(nearestRest(), restTilt(), motion.matches ? 0 : SPIN.backMs);
}
canvas.addEventListener('pointerup', letGo);
canvas.addEventListener('pointercancel', letGo);
canvas.addEventListener('click', event => {
  if (spun) { spun = false; return; }
  const { clientX: x, clientY: y } = event;
  if (focused) {
    if (!onCard(x, y)) { unfocus(); return; }
  } else if (apart === 1 && !busy() && onSeal(x, y)) {
    focusSeal();
    return;
  }
  if (!onCard(x, y)) return;
  if (atRest()) turnOver(paperFlipDirection(x, rect));
  else faceOn();
});
addEventListener('keydown', event => {
  if (event.key === 'Escape' && focused && !dialog.open) { event.preventDefault(); unfocus(); }
});
canvas.addEventListener('keydown', event => {
  const direction = { Enter: 1, ' ': 1, ArrowRight: 1, ArrowLeft: -1 }[event.key];
  if (!direction) return;
  event.preventDefault();
  if (atRest()) turnOver(direction);
  else faceOn();
});

// The lamp follows a mouse anywhere on the page; the card tilts only under it.
addEventListener('pointermove', event => {
  if (!rect) return;
  const { clientX: x, clientY: y } = event;
  const mouse = event.pointerType === 'mouse';
  pointer.x = (x - rect.left - rect.width / 2) / (rect.width / 2);
  pointer.y = (y - rect.top - rect.height / 2) / (rect.height / 2);
  pointer.lit = mouse;
  pointer.hovered = mouse && !busy() && !spin && onCard(x, y);
  canvas.classList.toggle('over-card', Boolean(fit) && onCard(x, y));
  canvas.classList.toggle('over-seal', Boolean(fit) && apart === 1 && !focused && onSeal(x, y));
  canvas.classList.toggle('focused', focused);
  request();
}, { passive: true });
document.documentElement.addEventListener('mouseleave', () => {
  pointer.lit = pointer.hovered = false;
  request();
});

// —— Explode ——
// Out: from wherever the card is, it turns to show its back at an angle
// while the seal turns back, then the seal lifts clear. In: the same,
// backwards, to where it was (or, turned meanwhile, the nearer face).
let explodedFrom = null;
explodeButton.addEventListener('click', () => {
  if (!fit || busy()) return;
  if (focused) unfocus(explodeOrAssemble);
  else explodeOrAssemble();
});
function explodeOrAssemble() {
  const out = apart === 0;
  pointer.hovered = pointer.pressed = false;
  const here = { angle: view.angle, tilt: view.tilt };
  let there;
  if (out) {
    // To the back's turned view, by the shorter way round.
    const back = 180 - EXPLODE.yaw;
    there = { angle: here.angle + ((((back - here.angle) % 360) + 540) % 360 - 180), tilt: EXPLODE.tilt };
    explodedFrom = { ...here, to: there.angle };
  } else {
    // The turned view it was taken apart to (a whole turn round counts the same).
    const round = explodedFrom ? view.angle - explodedFrom.to : 0;
    const untouched = explodedFrom && Math.abs(round - 360 * Math.round(round / 360)) < 1e-6 && view.tilt === EXPLODE.tilt;
    there = untouched ? { angle: explodedFrom.angle + round, tilt: explodedFrom.tilt } : { angle: Math.round(view.angle / 180) * 180, tilt: 0 };
  }
  explodeButton.setAttribute('aria-pressed', String(out));
  explodeButton.textContent = out ? 'assemble' : 'explode';
  cueSettled = false;
  const done = () => {
    apart = out ? 1 : 0;
    view.angle = there.angle; view.tilt = there.tilt;
    cueSettled = out;
    label();
  };
  if (motion.matches) { done(); request(); return; }
  // Played forwards out, backwards in: each frame of the way in is a frame
  // of the way out (from where it is now).
  const [together, taken] = out ? [here, there] : [there, here];
  play(EXPLODE.duration, t => {
    const s = out ? t : 1 - t;
    const v = smooth(share(s, EXPLODE.view));
    view.angle = together.angle + (taken.angle - together.angle) * v;
    view.tilt = together.tilt + (taken.tilt - together.tilt) * v;
    apart = s;
  }, done);
}

// —— The seal alone ——
// In: the card fades as the seal comes to the middle, larger, its P coming
// upright. Out: the same, backwards, to the view it left.
function focusSeal() {
  if (!fit || busy() || apart !== 1 || focused) return;
  pointer.hovered = pointer.pressed = false;
  focused = true;
  focusedFrom = { angle: view.angle, tilt: view.tilt };
  canvas.classList.add('focused');
  cueSettled = false;
  label();
  if (motion.matches) { focus = 1; cueSettled = true; request(); return; }
  const from = focus;
  play(FOCUS.duration * (1 - from), t => { focus = from + (1 - from) * t; }, () => { focus = 1; cueSettled = true; label(); });
}
function unfocus(then) {
  if (!focused || busy()) return;
  pointer.hovered = pointer.pressed = false;
  focused = false;
  canvas.classList.remove('focused');
  cueSettled = false;
  // Back to the view it left, the shorter way round, however it was turned.
  const to = { angle: focusedFrom.angle + 360 * Math.round((view.angle - focusedFrom.angle) / 360), tilt: focusedFrom.tilt };
  const from = { angle: view.angle, tilt: view.tilt }, start = focus;
  const done = () => { focus = 0; view.angle = to.angle; view.tilt = to.tilt; cueSettled = !then; label(); then?.(); };
  if (motion.matches) { done(); request(); return; }
  play(FOCUS.duration, t => {
    // Backwards along the way in, the view coming round with it.
    focus = start * (1 - t);
    const e = smooth(t);
    view.angle = from.angle + (to.angle - from.angle) * e;
    view.tilt = from.tilt + (to.tilt - from.tilt) * e;
  }, done);
}

// —— Mesh view ——
meshButton.addEventListener('click', () => {
  if (!fit) return;
  const on = meshButton.getAttribute('aria-pressed') !== 'true';
  meshButton.setAttribute('aria-pressed', String(on));
  if (on && !wires) {
    wires = solids.map(({ mesh, kind }) => {
      const wire = new Mesh(mesh.geometry, MESH_VIEW[kind].edges);
      wire.matrixAutoUpdate = false;
      wire.matrix.copy(mesh.matrix);
      mesh.parent.add(wire);
      return wire;
    });
  }
  for (const { mesh, kind, sharp } of solids) {
    mesh.material = on ? MESH_VIEW[kind].fill : MATERIALS[kind];
    sharp.visible = !on && (kind !== 'card' || cardShown > .001);
  }
  for (const wire of wires ?? []) wire.visible = on;
  request();
});

// —— Calibration ——
const dialog = document.querySelector('.calibrate');
const slider = dialog.querySelector('input[type="range"]');
const preview = value => {
  slider.value = value;
  dialog.style.setProperty('--scale', String(value));
};
document.querySelector('.calibrate-open').addEventListener('click', () => {
  preview(scale);
  dialog.showModal();
});
slider.addEventListener('input', () => preview(Number(slider.value)));
for (const button of dialog.querySelectorAll('[data-step]')) button.addEventListener('click', () => {
  const next = Number(slider.value) + Number(button.dataset.step) * .002;
  preview(Math.min(2.5, Math.max(.5, next)).toFixed(3));
});
dialog.querySelector('[data-reset]').addEventListener('click', () => preview(SOURCE_SCALE));
dialog.querySelector('[data-done]').addEventListener('click', () => {
  scale = Number(slider.value);
  try { localStorage.setItem(SCALE_KEY, String(scale)); } catch { /* kept for this visit only */ }
  panTo = clampPan(panTo, zoomTo);
  frameCamera();
  applyZoom();
  request();
  dialog.close();
});

// —— Downloads (as the card page's menu) ——
const download = document.querySelector('.download');
const downloadOpen = download.querySelector('.download-open');
const downloadLinks = [...download.querySelectorAll('a')];
function showDownloads(open, { focus = false } = {}) {
  download.toggleAttribute('data-open', open);
  downloadOpen.setAttribute('aria-expanded', String(open));
  if (open && focus) downloadLinks[0].focus();
}
downloadOpen.addEventListener('click', event => {
  const open = !download.hasAttribute('data-open');
  showDownloads(open, { focus: open && event.detail === 0 });
});
download.addEventListener('keydown', event => {
  const i = downloadLinks.indexOf(document.activeElement);
  if (event.key === 'Escape' && download.hasAttribute('data-open')) {
    showDownloads(false);
    downloadOpen.focus();
  } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && download.hasAttribute('data-open')) {
    const next = i < 0 ? 0 : (i + (event.key === 'ArrowDown' ? 1 : -1) + downloadLinks.length) % downloadLinks.length;
    downloadLinks[next].focus();
  } else return;
  event.preventDefault();
  event.stopPropagation();
});
for (const link of downloadLinks) link.addEventListener('click', () => showDownloads(false));
addEventListener('pointerdown', event => {
  if (download.hasAttribute('data-open') && !download.contains(event.target)) showDownloads(false);
});
download.addEventListener('focusout', event => {
  if (!download.contains(event.relatedTarget)) showDownloads(false);
});

// —— Zoom (as the card page's) ——
// The model redraws sharp at any size, so nothing is laid out afresh.
// Further in than the card page (to 1200%), to see the file's own triangles.
const ZOOM = Object.freeze({ min: 1, max: 12, levels: [1, 1.5, 2, 3, 4, 6, 8, 12], settleMs: 90, slack: 48 });
const zoomLevel = document.querySelector('[data-zoom-level]');
const zoomOut = document.querySelector('[data-zoom="-1"]');
const zoomIn = document.querySelector('[data-zoom="1"]');
let shownLevel = null, following = false, gliding = false;
const clampZoom = value => Math.min(ZOOM.max, Math.max(ZOOM.min, value));
function clampPan([x, y], z) {
  const base = [CARD_MM[0] * pxPerMm(), CARD_MM[1] * pxPerMm()];
  const room = (size, window) => Math.max(size * (z - 1) / 2, size * z > window ? (size * z - window) / 2 + ZOOM.slack : 0);
  const rx = room(base[0], viewSize[0]), ry = room(base[1], viewSize[1]);
  return [Math.min(rx, Math.max(-rx, x)), Math.min(ry, Math.max(-ry, y))];
}
const pannable = () => clampPan([1e6, 1e6], zoomTo).some(Boolean);
function aim(next, at) {
  next = clampZoom(next);
  const [ax, ay] = at ? [at[0] - viewSize[0] / 2, at[1] - viewSize[1] / 2] : [0, 0];
  const k = next / zoomTo;
  panTo = clampPan([ax - (ax - panTo[0]) * k, ay - (ay - panTo[1]) * k], next);
  zoomTo = next;
}
function applyZoom() {
  const level = Math.round(zoom * 100);
  if (level !== shownLevel) { shownLevel = level; zoomLevel.textContent = `${level}%`; }
  zoomOut.disabled = zoomTo <= ZOOM.min;
  zoomIn.disabled = zoomTo >= ZOOM.max;
  document.documentElement.classList.toggle('pannable', pannable());
}
function zoomStep(elapsed) {
  if (!gliding) return false;
  const f = following || motion.matches ? 1 : 1 - Math.exp(-elapsed / ZOOM.settleMs);
  following = false;
  zoom += (zoomTo - zoom) * f;
  pan = pan.map((value, i) => value + (panTo[i] - value) * f);
  if (Math.abs(zoomTo - zoom) < .001 && Math.hypot(panTo[0] - pan[0], panTo[1] - pan[1]) < .25) {
    zoom = zoomTo;
    pan = [...panTo];
    gliding = false;
  }
  frameCamera();
  applyZoom();
  return gliding;
}
const glide = () => { gliding = true; request(); };
const follow = () => { following = true; glide(); };
function step(direction) {
  const next = direction > 0 ? ZOOM.levels.find(level => level > zoomTo + .01) : ZOOM.levels.findLast(level => level < zoomTo - .01);
  aim(next ?? (direction > 0 ? ZOOM.max : ZOOM.min));
  glide();
}
function resetZoom() { zoomTo = 1; panTo = [0, 0]; glide(); }
zoomOut.addEventListener('click', () => step(-1));
zoomIn.addEventListener('click', () => step(1));
document.querySelector('[data-zoom-reset]').addEventListener('click', resetZoom);
addEventListener('keydown', event => {
  if (dialog.open || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key;
  if (key === '+' || key === '=') step(1);
  else if (key === '-' || key === '_') step(-1);
  else if (key === '0') resetZoom();
  else return;
  event.preventDefault();
});
addEventListener('wheel', event => {
  if (dialog.open) return;
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewSize[1] : 1;
  if (event.ctrlKey || event.metaKey) {
    const delta = Math.max(-25, Math.min(25, event.deltaY * unit));
    aim(zoomTo * Math.exp(-delta * .01), [event.clientX, event.clientY]);
  } else {
    const [dx, dy] = event.shiftKey && !event.deltaX ? [event.deltaY, 0] : [event.deltaX, event.deltaY];
    panTo = clampPan([panTo[0] - dx * unit, panTo[1] - dy * unit], zoomTo);
  }
  follow();
}, { passive: false });
let gestureFrom = null;
addEventListener('gesturestart', event => { event.preventDefault(); if (!touches.size) gestureFrom = zoomTo; });
addEventListener('gesturechange', event => {
  event.preventDefault();
  if (gestureFrom === null || touches.size) return;
  aim(gestureFrom * event.scale, [event.clientX, event.clientY]);
  follow();
});
addEventListener('gestureend', event => { event.preventDefault(); gestureFrom = null; });

// Touch: two fingers pinch and carry the card; one finger, or a mouse, off
// the card drags the page round it.
const touches = new Map();
let pinch = null, drag = null;
const pinchFrom = () => {
  const [a, b] = [...touches.values()];
  return { mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dist: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])) };
};
const space = document.querySelector('.space');
space.addEventListener('pointerdown', event => {
  if (dialog.open) return;
  if (event.pointerType === 'touch') {
    touches.set(event.pointerId, [event.clientX, event.clientY]);
    if (touches.size === 2) {
      if (spin) {
        // Two fingers: the turn stops where it is.
        spin = null;
        pointer.pressed = false;
        spun = true;
        canvas.classList.remove('spinning');
        label();
      }
      drag = null;
      document.documentElement.classList.remove('panning');
      pinch = { ...pinchFrom(), zoom: zoomTo, pan: [...panTo] };
      return;
    }
  }
  if (event.button !== 0 || touches.size > 1 || !pannable() || onCard(event.clientX, event.clientY) || event.target.closest('.controls')) return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: [...panTo] };
  space.setPointerCapture(event.pointerId);
  document.documentElement.classList.add('panning');
});
addEventListener('pointermove', event => {
  if (touches.has(event.pointerId)) touches.set(event.pointerId, [event.clientX, event.clientY]);
  if (pinch && touches.size >= 2) {
    const { mid, dist } = pinchFrom();
    const next = clampZoom(pinch.zoom * dist / pinch.dist), k = next / pinch.zoom;
    const from = [pinch.mid[0] - viewSize[0] / 2, pinch.mid[1] - viewSize[1] / 2];
    const to = [mid[0] - viewSize[0] / 2, mid[1] - viewSize[1] / 2];
    zoomTo = next;
    panTo = clampPan([to[0] - (from[0] - pinch.pan[0]) * k, to[1] - (from[1] - pinch.pan[1]) * k], next);
    follow();
  } else if (drag && event.pointerId === drag.id) {
    panTo = clampPan([drag.pan[0] + event.clientX - drag.x, drag.pan[1] + event.clientY - drag.y], zoomTo);
    follow();
  }
}, { passive: true });
function lift(event) {
  touches.delete(event.pointerId);
  if (touches.size < 2) pinch = null;
  if (drag && event.pointerId === drag.id) {
    drag = null;
    document.documentElement.classList.remove('panning');
  }
}
addEventListener('pointerup', lift);
addEventListener('pointercancel', lift);
addEventListener('resize', resize);

// —— Loading ——
// The print file is read in a worker (print-file.worker.mjs); until its
// model is drawn, a line says how far along it is, and nothing stands in
// for it.
const megabytes = bytes => `${(bytes / 1e6).toFixed(1)} MB`;
function readPrintFile(url) {
  const worker = new Worker(new URL('./print-file.worker.mjs', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.error) { worker.terminate(); reject(new Error(data.error)); return; }
      if (data.objects) { worker.terminate(); resolve(data.objects); return; }
      status.textContent = data.reading
        ? `reading the print file, ${megabytes(data.total)}`
        : `loading the print file, ${data.total ? `${megabytes(data.loaded)} of ${megabytes(data.total)}` : megabytes(data.loaded)}`;
    };
    worker.onerror = event => { worker.terminate(); reject(new Error(event.message)); };
    worker.postMessage({ url });
  });
}
function part({ positions, normals, indices, lines }, kind, matrix) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  const mesh = new Mesh(geometry, MATERIALS[kind]);
  const outline = new BufferGeometry();
  outline.setAttribute('position', new BufferAttribute(lines, 3));
  const sharp = new LineSegments(outline, EDGES[kind]);
  const group = new Group();
  group.matrixAutoUpdate = false;
  group.matrix.copy(matrix);
  group.add(mesh, sharp);
  solids.push({ mesh, kind, sharp });
  return group;
}
async function load() {
  const json = await fetch('/assets/print/card-3d.json').then(response => response.json());
  const objects = await readPrintFile(json.file);
  const named = name => {
    const object = objects.find(o => o.name === name);
    if (!object) throw new Error(`no "${name}" in the print file`);
    return object;
  };
  const placed = name => new Matrix4().set(...json.objects[name].flat());
  const [cx, cy] = json.centre_mm;
  // The card's middle at the origin, halfway through its thickness.
  parts.position.set(-cx, -cy, -json.stock_mm / 2);
  parts.add(part(named('card body'), 'card', placed('card body')));
  // The seal turns about the pocket's axis.
  sealAxis.position.set(cx, cy, 0);
  sealAxis.add(part(named('seal'), 'seal', new Matrix4().makeTranslation(-cx, -cy, 0).multiply(placed('seal'))));
  parts.add(sealAxis);
  const seal = solids.find(solid => solid.kind === 'seal').mesh;
  seal.geometry.computeBoundingBox();
  // In the seal's axis's space: through the group that places it from the file.
  const box = seal.geometry.boundingBox.clone().applyMatrix4(seal.parent.matrix);
  sealMiddle = (box.min.z + box.max.z) / 2;
  const thick = `${mmText(json.stock_mm)} thick, ${mmText(json.stock_mm + json.relief_mm)} at the relief`;
  addDims(parts, 'card', [cx, cy, json.stock_mm + .02], false, json.card_mm, 'front side', thick);
  addDims(parts, 'card', [cx, cy, -.02], true, json.card_mm, 'back side', thick);
  // The seal's, about its own box, turning with it (its face towards the card's back).
  const [sw, sh, st] = json.seal_size_mm, sx = (box.min.x + box.max.x) / 2, sy = (box.min.y + box.max.y) / 2;
  const tall = `${mmText(st)} tall with its peg`;
  addDims(sealAxis, 'seal', [sx, sy, box.min.z - .02], true, [sw, sh], 'wax seal, front side', tall);
  addDims(sealAxis, 'seal', [sx, sy, box.max.z + .02], false, [sw, sh], 'wax seal, back side', tall);
  sizeDims();
  fit = json;
  write();
  requestAnimationFrame(() => {
    canvas.toggleAttribute('data-ready', true);
    status.hidden = true;
    explodeButton.disabled = meshButton.disabled = false;
  });
}

resize();
applyZoom();
load().catch(error => { status.textContent = 'the print file could not be shown here; it is in download'; console.info(error.message); });
