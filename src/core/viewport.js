import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// The 3D viewport: renderer, camera, controls, ground grid, lights,
// and raycasting helpers. Lengths are inches; ground is the XZ plane.

export class Viewport {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x272b31);
    this.scene.fog = new THREE.Fog(0x272b31, 4000, 12000);

    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 50000);
    this.camera.position.set(220, 180, 260);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 24, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.mouseButtons = {
      LEFT: null, // left button belongs to the active tool
      MIDDLE: THREE.MOUSE.ROTATE,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.update();

    this.buildEnvironment();

    // image-based lighting so metallic materials read correctly
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Line.threshold = 2;
    this.pointer = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  buildEnvironment() {
    const hemi = new THREE.HemisphereLight(0xdfe8f5, 0x3c3a35, 0.9);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2df, 1.6);
    sun.position.set(300, 500, 200);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 800;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, far: 3000 });
    this.scene.add(sun);

    // ground: 100 ft square, minor lines every foot, major every 5 ft
    const size = 1200;
    const minor = new THREE.GridHelper(size, size / 12, 0x3b414c, 0x32373f);
    minor.position.y = -0.02;
    this.scene.add(minor);
    const major = new THREE.GridHelper(size, size / 60, 0x4a5260, 0x4a5260);
    major.position.y = -0.01;
    this.scene.add(major);

    const groundGeo = new THREE.PlaneGeometry(size * 4, size * 4);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({
      color: 0x24272c, roughness: 1,
    }));
    ground.position.y = -0.06;
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.scene.add(ground);

    // axes: red X, green Y (up), blue Z — SketchUp style
    const axisLen = 240;
    const axis = (dir, color) => {
      const g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0.02, 0), dir.clone().multiplyScalar(axisLen).setY(dir.y * axisLen + 0.02),
      ]);
      this.scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color })));
    };
    axis(new THREE.Vector3(1, 0, 0), 0xd05050);
    axis(new THREE.Vector3(0, 1, 0), 0x50b060);
    axis(new THREE.Vector3(0, 0, 1), 0x5070d0);
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.renderer.setSize(rect.width, rect.height, false);
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
  }

  setPointerFromEvent(ev) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  /** Intersect model meshes. Returns closest intersection or null. */
  pick(meshes) {
    const hits = this.raycaster.intersectObjects(meshes, false);
    return hits[0] || null;
  }

  /** Intersect an arbitrary THREE.Plane; returns Vector3 or null. */
  intersectPlane(plane) {
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, p) ? p : null;
  }

  intersectGround() {
    return this.intersectPlane(this.groundPlane);
  }

  worldToScreen(p) {
    const rect = this.canvas.getBoundingClientRect();
    const v = p.clone().project(this.camera);
    return new THREE.Vector2(
      (v.x + 1) / 2 * rect.width,
      (1 - v.y) / 2 * rect.height,
    );
  }

  /** Pixel size of one world inch at a given point (for screen-relative sizing). */
  pixelsPerInch(at) {
    const a = this.worldToScreen(at);
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const b = this.worldToScreen(at.clone().addScaledVector(right, 1));
    return a.distanceTo(b);
  }

  setStandardView(name, bounds) {
    const center = bounds ? bounds.getCenter(new THREE.Vector3()) : new THREE.Vector3(0, 24, 0);
    const radius = bounds ? Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 50) : 250;
    const dist = radius * 2.4;
    const dirs = {
      iso: new THREE.Vector3(1, 0.85, 1).normalize(),
      top: new THREE.Vector3(0.001, 1, 0.001).normalize(),
      front: new THREE.Vector3(0, 0.12, 1).normalize(),
      right: new THREE.Vector3(1, 0.12, 0).normalize(),
    };
    const dir = dirs[name] || dirs.iso;
    this.camera.position.copy(center.clone().addScaledVector(dir, dist));
    this.controls.target.copy(center);
    this.controls.update();
  }

  zoomToFit(bounds) {
    if (!bounds || bounds.isEmpty()) return this.setStandardView('iso', null);
    const center = bounds.getCenter(new THREE.Vector3());
    const radius = Math.max(bounds.getSize(new THREE.Vector3()).length() / 2, 20);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camera.position.copy(center.clone().addScaledVector(dir, radius * 2.4));
    this.controls.target.copy(center);
    this.controls.update();
  }

  startLoop(onFrame) {
    const tick = () => {
      requestAnimationFrame(tick);
      this.controls.update();
      onFrame?.();
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }
}
