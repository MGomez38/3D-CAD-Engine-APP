import * as THREE from 'three';
import { GROUND_PLANE, planeNormal, solidMatrix } from '../core/model.js';

/** Build a sketch plane {origin,u,v} from a raycast hit on a solid face, or ground. */
export function sketchPlaneFromHit(hit) {
  if (!hit) return GROUND_PLANE();
  const normal = faceWorldNormal(hit);
  if (normal.y > 0.99) {
    // horizontal face: keep world-aligned axes at the face height
    return { origin: [0, hit.point.y, 0], u: [1, 0, 0], v: [0, 0, -1] };
  }
  // arbitrary face: u = normal × up (horizontal in the face), v completes RH basis
  let u = new THREE.Vector3(0, 1, 0).cross(normal);
  if (u.lengthSq() < 1e-6) u = new THREE.Vector3(1, 0, 0);
  u.normalize();
  const v = normal.clone().cross(u).normalize();
  const origin = hit.point.clone();
  return { origin: origin.toArray(), u: u.toArray(), v: v.toArray() };
}

export function faceWorldNormal(hit) {
  const n = hit.face.normal.clone();
  const nm = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
  return n.applyMatrix3(nm).normalize();
}

export function threePlane(plane) {
  const n = planeNormal(plane);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(...plane.origin));
}

/** Distance from `origin` along `dir` of the closest approach of the pointer ray. */
export function dragDistanceAlongAxis(viewport, ev, origin, dir) {
  viewport.setPointerFromEvent(ev);
  const ray = viewport.raycaster.ray;
  // closest point between two lines: axis (origin,dir) and ray
  const w0 = origin.clone().sub(ray.origin);
  const a = dir.dot(dir), b = dir.dot(ray.direction), c = ray.direction.dot(ray.direction);
  const d = dir.dot(w0), e = ray.direction.dot(w0);
  const denom = a * c - b * b;
  if (Math.abs(denom) < 1e-9) return 0;
  return (b * e - c * d) / denom;
}

export function translateEntity(e, delta) {
  if (e.type === 'solid') {
    e.transform = e.transform || { position: [0, 0, 0], rotationY: 0 };
    const p = e.transform.position || [0, 0, 0];
    e.transform.position = [p[0] + delta.x, p[1] + delta.y, p[2] + delta.z];
  } else if (e.type === 'profile') {
    const o = e.plane.origin;
    e.plane.origin = [o[0] + delta.x, o[1] + delta.y, o[2] + delta.z];
  } else if (e.type === 'dimension') {
    e.p1 = [e.p1[0] + delta.x, e.p1[1] + delta.y, e.p1[2] + delta.z];
    e.p2 = [e.p2[0] + delta.x, e.p2[1] + delta.y, e.p2[2] + delta.z];
  } else if (e.type === 'label') {
    e.position = [e.position[0] + delta.x, e.position[1] + delta.y, e.position[2] + delta.z];
  } else if (e.type === 'edge') {
    e.points = e.points.map(p => [p[0] + delta.x, p[1] + delta.y, p[2] + delta.z]);
  }
}

/**
 * Clone a set of entities preserving their group structure: entities that
 * shared a group get a fresh shared groupId; ungrouped clones stay ungrouped.
 */
export function cloneEntitiesRegrouped(model, ids) {
  const gidMap = new Map();
  const clones = [];
  for (const id of ids) {
    const copy = model.cloneEntity(id);
    if (!copy) continue;
    if (copy.groupId) {
      if (!gidMap.has(copy.groupId)) {
        gidMap.set(copy.groupId, `grp${Date.now().toString(36)}${Math.floor(Math.random() * 1e5)}`);
      }
      copy.groupId = gidMap.get(copy.groupId);
    }
    clones.push(copy);
  }
  return clones;
}

export function rotateEntityY(e, pivot, angle) {
  const rot = new THREE.Matrix4().makeRotationY(angle);
  const rotPoint = (arr) => {
    const p = new THREE.Vector3(...arr).sub(pivot).applyMatrix4(rot).add(pivot);
    return p.toArray();
  };
  if (e.type === 'solid') {
    e.transform = e.transform || { position: [0, 0, 0], rotationY: 0 };
    // world matrix = T(pos)·R(ry); rotating about pivot: new = R(a)·(old - pivot) + pivot
    const m = solidMatrix(e);
    const pos = new THREE.Vector3().setFromMatrixPosition(m);
    const newPos = pos.sub(pivot).applyMatrix4(rot).add(pivot);
    e.transform.position = newPos.toArray();
    e.transform.rotationY = (e.transform.rotationY || 0) + angle;
  } else if (e.type === 'profile') {
    e.plane.origin = rotPoint(e.plane.origin);
    const rotVec = (arr) => new THREE.Vector3(...arr).applyMatrix4(rot).toArray();
    e.plane.u = rotVec(e.plane.u);
    e.plane.v = rotVec(e.plane.v);
  } else if (e.type === 'dimension') {
    e.p1 = rotPoint(e.p1);
    e.p2 = rotPoint(e.p2);
  } else if (e.type === 'label') {
    e.position = rotPoint(e.position);
  } else if (e.type === 'edge') {
    e.points = e.points.map(rotPoint);
  }
}

export class Tool {
  constructor(app) { this.app = app; }
  get hint() { return ''; }
  activate() {}
  deactivate() {}
  onPointerDown(_ev) {}
  onPointerMove(_ev) {}
  onPointerUp(_ev) {}
  onKeyDown(_ev) {}
  onVCB(_text) {}
  cancel() {}
}
