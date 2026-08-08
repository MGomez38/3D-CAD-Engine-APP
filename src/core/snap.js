import * as THREE from 'three';
import { Settings } from './settings.js';

// Inference / snapping engine.
//
// Priority: entity vertices & midpoints (screen-space proximity) →
// axis inference from a reference point → grid snap on the sketch plane.

const SNAP_PX = 9; // Settings.gridSnap controls the sketch-plane snap increment

const AXES = [
  { dir: new THREE.Vector3(1, 0, 0), kind: 'axis-x', color: 0xd05050 },
  { dir: new THREE.Vector3(0, 1, 0), kind: 'axis-y', color: 0x50b060 },
  { dir: new THREE.Vector3(0, 0, 1), kind: 'axis-z', color: 0x5070d0 },
];

export class Snapper {
  constructor(viewport, model) {
    this.viewport = viewport;
    this.model = model;
    this.marker = this.buildMarker();
    viewport.scene.add(this.marker);
    this.axisLine = this.buildAxisLine();
    viewport.scene.add(this.axisLine);
  }

  buildMarker() {
    const geo = new THREE.SphereGeometry(1, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0x3ddc84, depthTest: false });
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    m.renderOrder = 20;
    return m;
  }

  buildAxisLine() {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const mat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 4, gapSize: 3, depthTest: false });
    const line = new THREE.Line(geo, mat);
    line.visible = false;
    line.renderOrder = 19;
    return line;
  }

  hide() {
    this.marker.visible = false;
    this.axisLine.visible = false;
    this.lockedAxis = null;
    this.stickyAxis = null;
  }

  /**
   * Arrow-key axis lock: toggles a persistent lock on a world axis
   * ('axis-x' | 'axis-y' | 'axis-z'). Returns the new lock or null.
   */
  toggleStickyAxis(kind) {
    this.stickyAxis = this.stickyAxis?.kind === kind
      ? null
      : AXES.find(a => a.kind === kind);
    return this.stickyAxis;
  }

  /** Shift lock: nearest axis if headed close to one, else the exact free direction. */
  acquireShiftLock(plane, refPoint) {
    if (this.lockedAxis) return this.lockedAxis;
    const raw = this.viewport.intersectPlane(plane);
    if (!raw) return null;
    const heading = raw.clone().sub(refPoint);
    if (heading.lengthSq() < 1e-6) return null;
    heading.normalize();
    let best = null, bestDot = 0;
    for (const ax of AXES) {
      if (Math.abs(plane.normal.dot(ax.dir)) > 0.99) continue;
      const dot = Math.abs(heading.dot(ax.dir));
      if (dot > bestDot) { best = ax; bestDot = dot; }
    }
    this.lockedAxis = best && bestDot >= 0.92
      ? best
      // free-direction lock (magenta) — e.g. along a sloped edge
      : { dir: heading.clone(), kind: 'direction', color: 0xd050d0 };
    return this.lockedAxis;
  }

  /** Closest model vertex/midpoint within snap range of the cursor, or null. */
  nearestVertex(ev) {
    const vp = this.viewport;
    const rect = vp.canvas.getBoundingClientRect();
    const cursor = new THREE.Vector2(ev.clientX - rect.left, ev.clientY - rect.top);
    let best = null, bestDist = SNAP_PX;
    for (const p of this.model.snapPoints()) {
      const d = vp.worldToScreen(p).distanceTo(cursor);
      if (d < bestDist) { best = p; bestDist = d; }
    }
    return best;
  }

  /**
   * Resolve the current pointer to a snapped point on `plane` (THREE.Plane in world).
   * `refPoint` (Vector3|null) enables axis inference from that point, and holding
   * Shift locks the direction to the axis you're heading along (SketchUp-style).
   * Returns { point, kind: 'vertex'|'axis-x'|'axis-y'|'axis-z'|'grid', locked? } or null.
   */
  resolve(ev, plane, refPoint = null, { allowVertices = true } = {}) {
    const vp = this.viewport;
    vp.setPointerFromEvent(ev);

    // 0. hard locks: arrow-key sticky lock, or Shift held (SketchUp-style)
    if (!ev.shiftKey) this.lockedAxis = null;
    if (refPoint) {
      let lock = null;
      if (this.stickyAxis && Math.abs(plane.normal.dot(this.stickyAxis.dir)) < 0.99) {
        lock = this.stickyAxis;
      } else if (ev.shiftKey) {
        lock = this.acquireShiftLock(plane, refPoint);
      }
      if (lock) {
        // hovering a vertex while locked projects that vertex onto the line
        // (the classic "lock, then reference another point" workflow)
        const vertex = allowVertices ? this.nearestVertex(ev) : null;
        const ref3 = vertex || vp.intersectPlane(plane);
        if (!ref3) { this.marker.visible = false; return null; }
        const t = ref3.clone().sub(refPoint).dot(lock.dir);
        let point = refPoint.clone().addScaledVector(lock.dir, t);
        if (!vertex) point = this.gridSnapAlongAxis(refPoint, lock.dir, point);
        this.showMarker(point, lock.color);
        this.showAxisLine(refPoint, point, lock.color);
        return { point, kind: lock.kind, locked: true };
      }
    }

    // 1. vertex / midpoint snap (screen-space)
    if (allowVertices) {
      const best = this.nearestVertex(ev);
      if (best) {
        this.showMarker(best, 0x3ddc84);
        this.axisLine.visible = false;
        return { point: best.clone(), kind: 'vertex' };
      }
    }

    // 2. raw plane hit
    const raw = vp.intersectPlane(plane);
    if (!raw) { this.hide(); return null; }

    // 3. soft axis inference from the reference point
    if (refPoint) {
      const cursorScreen = vp.worldToScreen(raw);
      for (const ax of AXES) {
        if (Math.abs(plane.normal.dot(ax.dir)) > 0.99) continue; // axis ⟂ plane
        const projected = refPoint.clone().addScaledVector(
          ax.dir, raw.clone().sub(refPoint).dot(ax.dir));
        const s = vp.worldToScreen(projected);
        if (s.distanceTo(cursorScreen) < SNAP_PX) {
          const snapped = this.gridSnapAlongAxis(refPoint, ax.dir, projected);
          this.showMarker(snapped, ax.color);
          this.showAxisLine(refPoint, snapped, ax.color);
          return { point: snapped, kind: ax.kind };
        }
      }
    }

    // 4. grid snap on the plane
    const snapped = this.gridSnapOnPlane(raw, plane);
    this.showMarker(snapped, 0x9aa2ad);
    this.axisLine.visible = false;
    return { point: snapped, kind: 'grid' };
  }

  gridSnapAlongAxis(origin, dir, p) {
    const d = p.clone().sub(origin).dot(dir);
    const snapped = Math.round(d / Settings.gridSnap) * Settings.gridSnap;
    return origin.clone().addScaledVector(dir, snapped);
  }

  gridSnapOnPlane(p, plane) {
    // snap world coordinates that vary within the plane
    const out = p.clone();
    for (const axis of ['x', 'y', 'z']) {
      const dir = new THREE.Vector3(
        axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
      if (Math.abs(plane.normal.dot(dir)) < 0.99) {
        out[axis] = Math.round(out[axis] / Settings.gridSnap) * Settings.gridSnap;
      }
    }
    plane.projectPoint(out, out);
    return out;
  }

  showMarker(p, color) {
    this.marker.visible = true;
    this.marker.position.copy(p);
    this.marker.material.color.setHex(color);
    const px = this.viewport.pixelsPerInch(p);
    const s = Math.max(5 / Math.max(px, 0.001), 0.4);
    this.marker.scale.setScalar(s);
  }

  showAxisLine(a, b, color) {
    this.axisLine.visible = true;
    const pos = this.axisLine.geometry.attributes.position;
    pos.setXYZ(0, a.x, a.y, a.z);
    pos.setXYZ(1, b.x, b.y, b.z);
    pos.needsUpdate = true;
    this.axisLine.computeLineDistances();
    this.axisLine.material.color.setHex(color);
  }
}
