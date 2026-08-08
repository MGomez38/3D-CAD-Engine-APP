import * as THREE from 'three';
import { planeToWorld } from './model.js';

/** Temporary rubber-band geometry shown while a tool is mid-gesture. */
export class Preview {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'preview';
    scene.add(this.group);
    this.mat = new THREE.LineBasicMaterial({ color: 0x4c8dff, depthTest: false });
  }

  clear() {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      c.geometry?.dispose?.();
    }
  }

  showPolyline(points) {
    this.clear();
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geo, this.mat);
    line.renderOrder = 15;
    this.group.add(line);
  }

  showCircle(plane, center, radius, segs = 48) {
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push(planeToWorld(plane,
        center.x + Math.cos(a) * radius,
        center.y + Math.sin(a) * radius));
    }
    this.showPolyline(pts);
  }
}
