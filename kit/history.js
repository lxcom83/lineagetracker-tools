/* Undo and redo by snapshots. The tool passes a function that returns its state as a string, and one that puts a
   string back. Quick runs of the same change (dragging, typing in one box) are merged into one step. */
export function history({ snap, restore, limit = 150, onChange }) {
  let past = [], future = [], last = snap(), lastKey = '', lastAt = 0;
  const changed = () => onChange && onChange({ canUndo: past.length > 0, canRedo: future.length > 0 });
  return {
    /* call after every change. key: what changed (e.g. 'move:a1'); the same key within 900 ms joins the last step */
    commit(key = '') {
      const now = snap(); if (now === last) return;
      const t = Date.now();
      if (!(key && key === lastKey && t - lastAt < 900 && past.length)) { past.push(last); if (past.length > limit) past.shift(); }
      last = now; lastKey = key; lastAt = t; future = []; changed();
    },
    undo() { if (!past.length) return false; future.push(last); last = past.pop(); lastKey = ''; restore(last); changed(); return true; },
    redo() { if (!future.length) return false; past.push(last); last = future.pop(); lastKey = ''; restore(last); changed(); return true; },
    reset() { past = []; future = []; last = snap(); lastKey = ''; changed(); },
    get canUndo() { return past.length > 0; }, get canRedo() { return future.length > 0; },
  };
}
