import { UNPICK_STITCH } from './stitch-unpick.mjs';

export const MOTIF_LIFETIME = 30_000;

// Expiry removes a placement from history and rebases later edits, so an
// older timer cannot erase a newer motif or bring expired thread back on undo.
export class MotifLifetimes {
  constructor(model, animations) {
    Object.assign(this, { model, animations });
    this.records = new Map();
    this.journal = new Map();
    this.sequence = 0;
    this.soonest = Infinity;
    this.synced = null;
  }
  // Syncing again with nothing changed leaves the journal as it is, so it is
  // done only once the history or the records have moved since the last time.
  historyMoved() {
    const { synced, model: { undoStack, redoStack } } = this;
    return !synced || synced.records !== this.records.size || !sameItems(synced.undo, undoStack) || !sameItems(synced.redo, redoStack);
  }
  syncHistory() {
    this.synced = { undo: [...this.model.undoStack], redo: [...this.model.redoStack], records: this.records.size };
    const applied = new Set(this.model.undoStack), redo = new Set(this.model.redoStack);
    for (const transaction of [...this.model.undoStack, ...[...this.model.redoStack].reverse()]) {
      if (!this.journal.has(transaction)) this.journal.set(transaction, { order: this.sequence++, applied: applied.has(transaction) });
    }
    for (const [transaction, entry] of this.journal) {
      if (applied.has(transaction) || redo.has(transaction)) entry.applied = applied.has(transaction);
    }
    const earliest = Math.min(...[...this.records.keys()].map(transaction => this.journal.get(transaction)?.order ?? Infinity));
    for (const [transaction, entry] of this.journal) {
      if (entry.order < earliest && !applied.has(transaction) && !redo.has(transaction) && !this.records.has(transaction)) this.journal.delete(transaction);
    }
  }
  add(transaction, cells, started) {
    this.syncHistory();
    const delays = new Map(cells.map(cell => [`${cell.col},${cell.row}`, cell.delay]));
    this.records.set(transaction, { deadline: started + MOTIF_LIFETIME, delays, lastDelay: Math.max(0, ...delays.values()) });
    this.soonest = this.nextExpiry;
  }
  get nextExpiry() { return Math.min(...[...this.records.values()].map(record => record.deadline)); }
  // Runs every frame. The journal is kept exactly as syncing every frame
  // would keep it, and nothing can expire before the soonest deadline.
  update(now, reduced = false) {
    if (this.historyMoved()) this.syncHistory();
    if (!this.records.size || this.soonest > now) return false;
    let expired = false;
    for (const [transaction, record] of [...this.records].sort((a, b) => a[1].deadline - b[1].deadline)) {
      if (record.deadline > now) continue;
      const owner = this.journal.get(transaction);
      const nextChanges = new Map(), covered = new Set();
      for (const [later, entry] of [...this.journal].sort((a, b) => a[1].order - b[1].order)) {
        if (entry.order <= owner.order || (!entry.applied && !this.model.redoStack.includes(later))) continue;
        for (const change of later.changes) {
          if (!nextChanges.has(change.key)) nextChanges.set(change.key, change);
          if (entry.applied) covered.add(change.key);
        }
      }
      for (const change of transaction.changes) {
        const next = nextChanges.get(change.key);
        if (next) next.before = change.before;
        if (!owner.applied || covered.has(change.key)) continue;
        if (this.model.pending?.has(change.key)) {
          this.model.pending.set(change.key, change.before);
          continue;
        }
        const color = this.model.stitches.get(change.key);
        if (change.before === undefined) this.model.stitches.delete(change.key);
        else this.model.stitches.set(change.key, change.before);
        if (color !== undefined && color !== change.before && !reduced) {
          this.animations.set(change.key, {
            kind: 'unpick', color, from: 1, revealUnderneath: true,
            started: record.deadline + (record.lastDelay - (record.delays.get(change.key) ?? 0)) * .65,
            duration: UNPICK_STITCH,
          });
        }
      }
      this.model.undoStack = this.model.undoStack.filter(value => value !== transaction);
      this.model.redoStack = this.model.redoStack.filter(value => value !== transaction);
      this.records.delete(transaction);
      this.journal.delete(transaction);
      expired = true;
    }
    this.soonest = this.nextExpiry;
    return expired;
  }
}

function sameItems(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
