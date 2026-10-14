/* Pure JSON operations, shared by the page and concurrency tests. */
(function(root){
  'use strict';
  const period = '2026-10/2027-09';
  function validDate(value){
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const date=new Date(value+'T00:00:00Z');return !Number.isNaN(date.valueOf())&&date.toISOString().slice(0,10)===value;
  }
  function validSchedule(value){
    return value&&['prepStart','prepEnd','launchStart','launchEnd'].every(key=>validDate(value[key]))&&
      value.prepStart<=value.prepEnd&&value.prepEnd<value.launchStart&&value.launchStart<=value.launchEnd;
  }
  function defaultSchedule(month){
    const year=month>=9?2026:2027;
    const prefix=year+'-'+String(month+1).padStart(2,'0')+'-';
    return {prepStart:prefix+'01',prepEnd:prefix+'14',launchStart:prefix+'15',launchEnd:prefix+new Date(Date.UTC(year,month+1,0)).getUTCDate()};
  }
  function shiftSchedule(value,days){
    if(!validSchedule(value)||!Number.isInteger(days)||Math.abs(days)>366)throw new Error('Укажите сдвиг от −366 до 366 дней');
    return Object.fromEntries(['prepStart','prepEnd','launchStart','launchEnd'].map(key=>{const date=new Date(value[key]+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+days);return [key,date.toISOString().slice(0,10)];}));
  }
  function validKey(key,month){return typeof key==='string'&&(key.startsWith('note:')&&key.length>5||new RegExp('^top:'+month+':[0-6]$').test(key));}
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
      if (!action || typeof action.id !== 'string' || !['add','edit','delete','schedule'].includes(action.type) || typeof action.actor !== 'string' ||
          typeof action.at !== 'string' || typeof action.noteId !== 'string' || !Number.isInteger(action.month) || action.month < 0 || action.month > 11 ||
          ![action.before,action.after].every(value => value === null || typeof value === 'string')) throw new Error('Неверный журнал действий');
    });
    if(state.schedules!==undefined&&!Array.isArray(state.schedules))throw new Error('Неверный формат сроков');
    const scheduleIds=new Set();
    (state.schedules||[]).forEach(schedule=>{
      if(!Number.isInteger(schedule.month)||schedule.month<0||schedule.month>11||!validKey(schedule.key,schedule.month)||
        scheduleIds.has(schedule.key)||!validSchedule(schedule)||!Number.isInteger(schedule.revision)||schedule.revision<1||
        schedule.key.startsWith('note:')&&!state.notes.some(note=>'note:'+note.id===schedule.key&&note.month===schedule.month))throw new Error('Неверные сроки товара');
      scheduleIds.add(schedule.key);
    });
    return state;
  }
  function apply(state, operations, actor) {
    validate(state);
    if (typeof actor !== 'string' || !actor || !Array.isArray(operations)) throw new Error('Не указан автор изменения');
    const next = JSON.parse(JSON.stringify(state));
    for (const op of operations) {
      if (next.actions.some(action => action.id === op.id)) continue;
      if(op.type==='schedule'){
        if(typeof op.id!=='string'||!Number.isInteger(op.month)||op.month<0||op.month>11||!validKey(op.key,op.month)||!validSchedule(op.schedule))throw new Error('Проверьте даты: подготовка должна закончиться до начала запуска');
        if(op.key.startsWith('note:')&&!next.notes.some(note=>'note:'+note.id===op.key&&note.month===op.month))throw new Error('Ручная запись уже удалена');
        next.schedules ||= [];
        const index=next.schedules.findIndex(schedule=>schedule.key===op.key),current=next.schedules[index];
        if((current?.revision||0)!==op.baseRevision){const error=new Error('Сроки этого товара уже изменены другим сотрудником. Загрузите актуальные сроки и повторите правку.');error.conflict=true;throw error;}
        const dates=value=>Object.fromEntries(['prepStart','prepEnd','launchStart','launchEnd'].map(key=>[key,value[key]]));
        const before=dates(current||defaultSchedule(op.month)),after=dates(op.schedule);
        if(JSON.stringify(before)===JSON.stringify(after))continue;
        const at=new Date().toISOString(),revision=++next.revision;
        const schedule={key:op.key,month:op.month,...after,revision,updatedBy:actor,updatedAt:at};
        if(index<0)next.schedules.push(schedule);else next.schedules[index]=schedule;
        next.updatedAt=at;
        next.actions.push({id:op.id,type:'schedule',noteId:op.key,month:op.month,productName:op.name||op.key,actor,at,revision,before:JSON.stringify(before),after:JSON.stringify(after)});
        continue;
      }
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
      if (op.type === 'delete') {next.notes.splice(index, 1);if(next.schedules)next.schedules=next.schedules.filter(schedule=>schedule.key!=='note:'+op.noteId);}
      else {
        const note = {id:op.noteId, month:op.month, text:op.text, revision, updatedBy:actor, updatedAt:at};
        if (op.type === 'add') next.notes.push(note); else next.notes[index] = note;
      }
      next.updatedAt = at;
      next.actions.push({id:op.id, type:op.type, noteId:op.noteId, month:op.month, actor, at, revision, before, after:op.type === 'delete' ? null : op.text});
    }
    return next;
  }
  root.PlanJSON = {validate, apply, period, validSchedule, defaultSchedule, shiftSchedule};
})(globalThis);
