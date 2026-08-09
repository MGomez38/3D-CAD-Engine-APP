// User component library: save any selection as a reusable part, stored in
// this browser (localStorage), placeable into any project with a click.

const KEY = 'cadshop-components';

export function listComponents() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch { return []; }
}

/**
 * @param name     display name
 * @param entities serialized entity objects (deep copies, ids ignored)
 * @param anchor   [x,y,z] world min-corner used as the placement handle
 * @param size     [w,h,d] world bounding size (for placement preview)
 */
export function saveComponent(name, entities, anchor, size) {
  const list = listComponents();
  list.push({
    id: `cmp${Date.now().toString(36)}`,
    name, anchor, size, entities,
  });
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false; // storage full
  }
}

export function deleteComponent(id) {
  localStorage.setItem(KEY, JSON.stringify(listComponents().filter(c => c.id !== id)));
}
