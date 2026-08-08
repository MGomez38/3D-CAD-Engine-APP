import * as THREE from 'three';

// Inference / snapping engine.
//
// Priority: entity vertices & midpoints (screen-space proximity) →
// axis inference from a reference point → grid snap on the sketch plane.

const SNAP_PX = 9;
export const GRID_SNAP_IN = 1; // snap increment on the sketch plane, inches

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
  }

  /**
   * Resolve the current pointer to a snapped point on `plane` (THREE.Plane in world).
   * `refPoint` (Vector3|null) enables axis inference from that point.
   * Returns { point: Vector3, kind: 'vertex'|'axis-x'|'axis-y'|'axis-z'|'grid'|null } or null.
   */
  resolve(ev, plane, refPoint = null, { allowVertices = true } = {}) {
    const vp = this.viewport;
    vp.setPointerFromEvent(ev);

    // 1. vertex / midpoint snap (screen-space)
    if (allowVertices) {
      const cursor = new THREE.Vector2(
        ev.clientX - vp.canvas.getBoundingClientRect().left,
        ev.clientY - vp.canvas.getBoundingClientRect().top,
      );
      let best = null, bestDist = SNAP_PX;
      for (const p of this.model.snapPoints()) {
        const s = vp.worldToScreen(p);
        const d = s.distanceTo(cursor);
        if (d < bestDist) { best = p; bestDist = d; }
      }
      if (best) {
        this.showMarker(best, 0x3ddc84);
        this.axisLine.visible = false;
        return { point: best.clone(), kind: 'vertex' };
      }
    }

    // 2. raw plane hit
    const raw = vp.intersectPlane(plane);
    if (!raw) { this.hide(); return null; }

    // 3. axis inference from reference point
    if (refPoint) {
      const axes = [
        { dir: new THREE.Vector3(1, 0, 0), kind: 'axis-x', color: 0xd05050 },
        { dir: new THREE.Vector3(0, 1, 0), kind: 'axis-y', color: 0x50b060 },
        { dir: new THREE.Vector3(0, 0, 1), kind: 'axis-z', color: 0x5070d0 },
      ];
      const cursorScreen = vp.worldToScreen(raw);
      for (const ax of axes) {
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
    const snapped = Math.round(d / GRID_SNAP_IN) * GRID_SNAP_IN;
    return origin.clone().addScaledVector(dir, snapped);
  }

  gridSnapOnPlane(p, plane) {
    // snap world coordinates that vary within the plane
    const out = p.clone();
    for (const axis of ['x', 'y', 'z']) {
      const dir = new THREE.Vector3(
        axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
      if (Math.abs(plane.normal.dot(dir)) < 0.99) {
        out[axis] = Math.round(out[axis] / GRID_SNAP_IN) * GRID_SNAP_IN;
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
