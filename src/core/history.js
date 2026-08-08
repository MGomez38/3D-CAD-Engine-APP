// Snapshot-based undo/redo. Model states are small JSON documents,
// so full snapshots are simpler and more robust than command replay.

export class History {
  constructor(model, limit = 60) {
    this.model = model;
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Call BEFORE a mutation to record the current state. */
  checkpoint() {
    this.undoStack.push(JSON.stringify(this.model.serialize()));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(JSON.stringify(this.model.serialize()));
    this.model.load(JSON.parse(this.undoStack.pop()));
    return true;
  }

  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(JSON.stringify(this.model.serialize()));
    this.model.load(JSON.parse(this.redoStack.pop()));
    return true;
  }

  /** Abandon an in-progress gesture: restore the last checkpoint without touching redo. */
  revertToCheckpoint() {
    if (!this.undoStack.length) return false;
    this.model.load(JSON.parse(this.undoStack.pop()));
    return true;
  }
}
