import * as THREE from 'three';

/* =====================================================================
   VIEW: renderer, lights, an orbiting camera, and pointer handling.
   A "world" (the bench or the circuit board) plugs in with a group to
   show, named camera views, clickable meshes and pointer hooks.
   ===================================================================== */
const PI = Math.PI;

export class View {
  constructor(el, hooks = {}) {
    this.el = el; this.hooks = hooks;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    el.insertBefore(r.domElement, el.firstChild);
    r.domElement.setAttribute('aria-label', 'Three dimensional view of the circuit');
    r.domElement.setAttribute('role', 'img');
    const sc = this.scene = new THREE.Scene();
    sc.background = new THREE.Color(0x121416);
    sc.environment = this.envMap();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.02, 800);
    sc.add(new THREE.HemisphereLight(0xe2e0da, 0x1a1c1e, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.7); key.position.set(6, 14, 9); sc.add(key);
    const rim = new THREE.DirectionalLight(0xdfe6f0, 0.55); rim.position.set(-10, 5, -12); sc.add(rim);
    this.cam = { az: 0.4, el: 0.7, r: 16, target: new THREE.Vector3(), anim: null, near: 2, far: 60 };
    this.world = null;
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2();
    this.initPointer();
    new ResizeObserver(() => this.resize()).observe(el); this.resize();
  }
  envMap() {
    const pm = new THREE.PMREMGenerator(this.renderer), es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide,
      vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying vec3 p; void main(){ float h = normalize(p).y; gl_FragColor = vec4(mix(vec3(0.06,0.065,0.07), vec3(0.4,0.4,0.39), smoothstep(-0.3,0.8,h)),1.); }' })));
    const panel = (x, y, z, w, h, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(i, i, i * 1.02), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
    panel(0, 30, 10, 40, 14, 3.0); panel(-30, 12, -12, 14, 20, 1.3); panel(28, 8, 18, 10, 16, 1.0);
    const t = pm.fromScene(es, 0.03).texture; pm.dispose(); return t;
  }
  setWorld(w, view) {
    if (this.world) this.scene.remove(this.world.group);
    this.world = w; this.scene.add(w.group);
    const v = w.views[view || w.defaultView];
    Object.assign(this.cam, { az: v.az, el: v.el, r: v.r, anim: null }); this.cam.target.copy(v.target);
    this.cam.near = w.zoom ? w.zoom[0] : 2; this.cam.far = w.zoom ? w.zoom[1] : 60;
  }
  flyTo(name) {
    const v = this.world.views[name]; if (!v) return;
    const c = this.cam, d = ((v.az - c.az + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    c.anim = { from: { az: c.az, el: c.el, r: c.r, t: c.target.clone() }, to: { az: c.az + d, el: v.el, r: v.r, t: v.target.clone() }, t: 0, dur: reduce ? 0.01 : 0.8 };
  }
  flyToPoint(x, z) {
    const c = this.cam, reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    c.anim = { from: { az: c.az, el: c.el, r: c.r, t: c.target.clone() }, to: { az: c.az, el: Math.max(c.el, 1.2), r: Math.min(c.r, 22), t: new THREE.Vector3(x, 0.8, z) }, t: 0, dur: reduce ? 0.01 : 0.7 };
  }
  place() {
    const c = this.cam, t = c.target, r = c.r * Math.max(1, Math.pow(1.35 / this.camera.aspect, 0.9));
    this.camera.position.set(t.x + r * Math.cos(c.el) * Math.sin(c.az), t.y + r * Math.sin(c.el), t.z + r * Math.cos(c.el) * Math.cos(c.az));
    this.camera.lookAt(t);
  }
  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight; if (!w || !h) return;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  frame(dt) {
    const c = this.cam;
    if (c.anim) {
      const A = c.anim; A.t += dt; const x = Math.min(1, A.t / A.dur), e = x * x * (3 - 2 * x);
      c.az = A.from.az + (A.to.az - A.from.az) * e; c.el = A.from.el + (A.to.el - A.from.el) * e; c.r = A.from.r + (A.to.r - A.from.r) * e;
      c.target.lerpVectors(A.from.t, A.to.t, e);
      if (x >= 1) c.anim = null;
    }
    this.place();
    this.renderer.render(this.scene, this.camera);
  }
  rayAt(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera); return this.ray;
  }
  pickPart(e) {
    const w = this.world; if (!w || !w.pickables.length) return null;
    const hit = this.rayAt(e).intersectObjects(w.pickables, false)[0];
    return hit ? { id: w.partAt(hit.object), point: hit.point } : null;
  }
  initPointer() {
    const el = this.renderer.domElement, pointers = new Map();
    let mode = null, last = null, pinch = 0, moved = 0;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) { const [p, q] = [...pointers.values()]; pinch = Math.hypot(p.x - q.x, p.y - q.y); mode = 'pinch'; return; }
      moved = 0; last = { x: e.clientX, y: e.clientY };
      const hit = this.pickPart(e);
      if (this.world && this.world.pointerDown && this.world.pointerDown(this.rayAt(e), hit, e)) { mode = 'world'; el.classList.add('dragging'); return; }
      mode = 'orbit'; this.cam.anim = null; this.downHit = hit;
    });
    el.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) {   // hover
        const hit = this.pickPart(e);
        if (this.world && this.world.pointerHover) this.world.pointerHover(this.rayAt(e), hit, e);
        this.hooks.hover && this.hooks.hover(hit ? hit.id : null, e);
        el.style.cursor = this.world && this.world.cursor ? this.world.cursor(hit) : hit ? 'pointer' : 'grab';
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (mode === 'pinch' && pointers.size === 2) { const [p, q] = [...pointers.values()], d = Math.hypot(p.x - q.x, p.y - q.y); this.cam.r = Math.min(this.cam.far, Math.max(this.cam.near, this.cam.r * pinch / d)); pinch = d; return; }
      if (mode === 'world') { this.world.pointerMove(this.rayAt(e), e); return; }
      if (mode === 'orbit' && last) {
        moved += Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y);
        this.cam.az -= (e.clientX - last.x) * 0.006;
        this.cam.el = Math.max(-1.5, Math.min(1.54, this.cam.el + (e.clientY - last.y) * 0.005));
        this.hooks.orbit && this.hooks.orbit();
      }
      last = { x: e.clientX, y: e.clientY };
    });
    const up = (e) => {
      pointers.delete(e.pointerId);
      if (mode === 'world') { this.world.pointerUp && this.world.pointerUp(this.rayAt(e), e); el.classList.remove('dragging'); }
      else if (mode === 'orbit' && moved < 5) this.hooks.click && this.hooks.click(this.downHit ? this.downHit.id : null, e);
      if (!pointers.size) mode = null;
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', () => { if (!pointers.size) this.hooks.hover && this.hooks.hover(null); });
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.cam.anim = null; this.cam.r = Math.min(this.cam.far, Math.max(this.cam.near, this.cam.r * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
  }
}
