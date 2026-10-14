/* Pure JSON operations, shared by the page and concurrency tests. */
(function(root){
  'use strict';
  const period = '2026-10/2027-09';
  function validate(state) {
    if (!state || state.version !== 2 || state.period !== period || !Number.isInteger(state.revision) || state.revision < 0 ||
        !state.rankings || !['full','year'].every(key => Array.isArray(state.rankings[key]) && state.rankings[key].length === 12 && state.rankings[key].every(row =>
          typeof row.m === 'string' && typeof row.s === 'string' && Array.isArray(row.items) && row.items.length === 7 && row.items.every(item =>
            Array.isArray(item) && typeof item[0] === 'string' && ['s','d','w'].includes(item[1]) && Number.isFinite(item[2])))) ||
        !Array.isArray(state.notes) || !Array.isArray(state.actions)) throw new Error('Неверный формат общего JSON');
    const ids = new Set();
    state.notes.forEach(note => {
      if (!note || typeof note.id !== 'string' || ids.has(note.id) || !Number.isInteger(note.month) || note.month < 0 || note.month > 11 ||
          typeof note.text !== 'string' || note.text.length > 5000 || !Number.isInteger(note.revision) || note.revision < 1) throw new Error('Неверный формат заметки');
      ids.add(note.id);
    });
    state.actions.forEach(action => {
      if (!action || typeof action.id !== 'string' || !['add','edit','delete'].includes(action.type) || typeof action.actor !== 'string' ||
          typeof action.at !== 'string' || typeof action.noteId !== 'string' || !Number.isInteger(action.month) || action.month < 0 || action.month > 11 ||
          ![action.before,action.after].every(value => value === null || typeof value === 'string')) throw new Error('Неверный журнал действий');
    });
    return state;
  }
  function apply(state, operations, actor) {
    validate(state);
    if (typeof actor !== 'string' || !actor || !Array.isArray(operations)) throw new Error('Не указан автор изменения');
    const next = JSON.parse(JSON.stringify(state));
    for (const op of operations) {
      if (next.actions.some(action => action.id === op.id)) continue;
      if (typeof op.id !== 'string' || typeof op.noteId !== 'string' || !Number.isInteger(op.month) || op.month < 0 || op.month > 11 ||
          !['add','edit','delete'].includes(op.type) || (op.type !== 'delete' && (typeof op.text !== 'string' || op.text.length > 5000))) throw new Error('Неверное изменение');
      const index = next.notes.findIndex(note => note.id === op.noteId);
      const current = next.notes[index];
      if (op.type === 'add') {
        if (current || next.actions.some(action => action.noteId === op.noteId) || next.notes.filter(note => note.month === op.month).length >= 100) throw new Error('Не удалось добавить поле');
      } else if (!current || current.month !== op.month || current.revision !== op.baseRevision) {
        const error = new Error('Это поле уже изменил другой сотрудник. Ваш текст оставлен в поле; сравните его с общей версией.');
        error.conflict = true; error.noteId = op.noteId; throw error;
      }
      const at = new Date().toISOString();
      const before = current ? current.text : null;
      if (op.type === 'edit' && before === op.text) continue;
      const revision = ++next.revision;
      if (op.type === 'delete') next.notes.splice(index, 1);
      else {
        const note = {id:op.noteId, month:op.month, text:op.text, revision, updatedBy:actor, updatedAt:at};
        if (op.type === 'add') next.notes.push(note); else next.notes[index] = note;
      }
      next.updatedAt = at;
      next.actions.push({id:op.id, type:op.type, noteId:op.noteId, month:op.month, actor, at, revision, before, after:op.type === 'delete' ? null : op.text});
    }
    return next;
  }
  root.PlanJSON = {validate, apply, period};
})(globalThis);
