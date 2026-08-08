// Built-in example project: a 4' × 2' welding workbench.
// Demonstrates steel members, materials, part names, hollow tube sections,
// dimensions, and a populated cut list — a complete model to explore.

const HSS2 = {
  kind: 'poly',
  points: [[-1, -1], [1, -1], [1, 1], [-1, 1]],
  holes: [[[-0.75, -0.75], [-0.75, 0.75], [0.75, 0.75], [0.75, -0.75]]],
};

const ANGLE2 = {
  kind: 'poly',
  points: [[-1, -1], [1, -1], [1, -0.75], [-0.75, -0.75], [-0.75, 1], [-1, 1]],
};

const groundAt = (x, y, z) => ({ origin: [x, y, z], u: [1, 0, 0], v: [0, 0, -1] });

export function exampleProject() {
  const entities = [];
  let n = 1;
  const add = (e) => entities.push({ id: `e${n++}`, layerId: 'L0', ...e });

  // legs — HSS 2x2x1/4, 30" tall, at the four corners
  for (const [x, z] of [[3, -3], [45, -3], [3, -21], [45, -21]]) {
    add({
      type: 'solid', ...HSS2, plane: groundAt(x, 0, z), depth: 30,
      spec: 'HSS 2x2x1/4', material: 'steel', name: 'Leg', transform: null,
    });
  }

  // long rails — angle iron under the top, front and back
  for (const z of [-3, -21]) {
    add({
      type: 'solid', ...ANGLE2,
      plane: { origin: [4, 28, z], u: [0, 0, -1], v: [0, 1, 0] }, // extrudes +X
      depth: 40, spec: 'L 2x2x1/4', material: 'steel', name: 'Rail long', transform: null,
    });
  }

  // side rails — extrude along +Z from the far edge
  for (const x of [3, 45]) {
    add({
      type: 'solid', ...ANGLE2,
      plane: { origin: [x, 28, -20], u: [1, 0, 0], v: [0, 1, 0] }, // extrudes +Z
      depth: 16, spec: 'L 2x2x1/4', material: 'steel', name: 'Rail short', transform: null,
    });
  }

  // plywood top, 48 × 24 × 1
  add({
    type: 'solid', kind: 'poly',
    points: [[0, 0], [48, 0], [48, 24], [0, 24]],
    plane: groundAt(0, 30, 0), depth: 1,
    spec: 'PL 48x24', material: 'plywood', name: 'Top', transform: null,
  });

  // overall dimensions
  add({ type: 'dimension', p1: [0, 31, 0], p2: [48, 31, 0], offset: 10, label: `4' 0"` });
  add({ type: 'dimension', p1: [48, 0, 0], p2: [48, 31, 0], offset: 10, label: `2' 7"` });

  return {
    app: 'cadshop', version: 1,
    layers: [{ id: 'L0', name: 'Bench', color: '#8fb8d8', visible: true }],
    activeLayerId: 'L0',
    projectInfo: {
      project: 'Welding Workbench (Example)',
      customer: 'Sample Customer',
      author: 'CADShop',
      number: 'S-100',
    },
    entities,
  };
}
