const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'plan-model.js'),'utf8'),context);
const {apply,validate}=context.PlanJSON;
const initial=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'plan-data.json'),'utf8'));
const add={id:'op-add',type:'add',noteId:'note-1',month:9,text:'Подготовить креативы'};
test('CRUD writes author, before/after text and timestamps without changing rankings',()=>{
  const start=initial(),one=apply(start,[add],'anna');
  assert.equal(start.notes.length,0);assert.equal(one.notes[0].revision,1);assert.equal(JSON.stringify(one.rankings),JSON.stringify(start.rankings));
  const two=apply(one,[{id:'op-edit',type:'edit',noteId:'note-1',month:9,text:'Запустить рекламу',baseRevision:1}],'boris');
  assert.equal(two.actions[1].actor,'boris');assert.equal(two.actions[1].before,add.text);assert.equal(two.actions[1].after,'Запустить рекламу');assert.ok(!Number.isNaN(Date.parse(two.actions[1].at)));
  const three=apply(two,[{id:'op-delete',type:'delete',noteId:'note-1',month:9,baseRevision:2}],'anna');
  assert.equal(three.notes.length,0);assert.equal(three.actions[2].before,'Запустить рекламу');assert.equal(three.actions[2].after,null);
  validate(JSON.parse(JSON.stringify(three)));
});
test('stale edits/deletes do not overwrite another employee',()=>{
  const one=apply(initial(),[add],'anna');
  const two=apply(one,[{id:'edit-a',type:'edit',noteId:'note-1',month:9,text:'Текст Анны',baseRevision:1}],'anna');
  for(const type of ['edit','delete'])assert.throws(()=>apply(two,[{id:'edit-b-'+type,type,noteId:'note-1',month:9,text:'Текст Бориса',baseRevision:1}],'boris'),e=>e.conflict);
  assert.equal(two.notes[0].text,'Текст Анны');
});
test('merges independent employees and retries without duplicate audit events',()=>{
  const one=apply(initial(),[add],'anna');
  const two=apply(one,[{...add,id:'op-two',noteId:'note-2',month:1}],'boris');
  const retry=apply(two,[add],'anna');assert.equal(retry.notes.length,2);assert.equal(retry.actions.length,2);assert.equal(retry.revision,2);
});
test('deleted IDs cannot be recreated and malformed input is rejected atomically',()=>{
  const one=apply(initial(),[add],'anna');
  const two=apply(one,[{id:'delete',type:'delete',noteId:'note-1',month:9,baseRevision:1}],'anna');
  assert.throws(()=>apply(two,[{...add,id:'new-add'}],'boris'));
  assert.throws(()=>apply(initial(),[add,{...add,id:'invalid',noteId:'bad',month:12}],'anna'));
  assert.equal(initial().notes.length,0);
});
