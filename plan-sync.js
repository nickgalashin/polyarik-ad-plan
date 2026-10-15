function attachPlanEditor(initial, monthNames, status, cards, onNotesChange, onScheduleOpen) {
  'use strict';
  const api = 'https://api.github.com/repos/nickgalashin/polyarik-ad-plan/contents/plan-data.json';
  let state = initial, token = '', actor = '', busy = false, queue = Promise.resolve();
  const drafts = new Map(), hosts = [], timers = new Map();
  const message = text => {status.textContent = text;};
  function el(tag, cls, text) {const n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n;}
  const tools = document.querySelector('.plan-tools');
  const connect = el('details', 'github-connect');
  connect.append(el('summary','','Доступ для редактирования'));
  connect.append(el('p','','Используйте личный GitHub-токен с Contents: Read and write только для nickgalashin/polyarik-ad-plan. Он отправляется только в GitHub и остаётся в памяти до закрытия страницы.'));
  const label = el('label','','Личный GitHub-токен');
  const input = el('input'); input.type='password'; input.autocomplete='off'; input.id='github-token'; label.htmlFor=input.id;
  const login = el('button','','Подключить'); login.type='button';
  const logout = el('button','','Отключить'); logout.type='button'; logout.hidden=true;
  connect.append(label,input,login,logout); tools.before(connect);
  function requireAccess(){
    if(token&&actor)return true;
    connect.closest('.plan-settings').open=true;connect.open=true;input.focus();connect.scrollIntoView({block:'center',behavior:'smooth'});
    message('Для добавления и редактирования подключите личный GitHub-токен выше. После перезагрузки доступ нужно подключить заново.');
    return false;
  }
  const refresh = el('button','','Обновить общие данные'); refresh.type='button'; tools.append(refresh);
  const history = el('details','plan-history'); history.append(el('summary','','История изменений'));
  const log = el('ol'); history.append(log); tools.after(history);
  function headers() {return {Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(token?{Authorization:'Bearer '+token}:{})};}
  async function request(url, options={}) {
    const response = await fetch(url,{...options,headers:{...headers(),...options.headers},cache:'no-store',signal:AbortSignal.timeout(20000)});
    if (!response.ok) {const error=new Error(response.status===401?'GitHub-токен недействителен':response.status===403?'GitHub отказал в доступе: проверьте права токена или лимит запросов':'GitHub: ошибка '+response.status);error.status=response.status;throw error;}
    return response.json();
  }
  function encode(value) {const bytes=new TextEncoder().encode(JSON.stringify(value,null,2)+'\n'); if(bytes.length>900000)throw new Error('JSON превышает 900 КБ. Сохраните архив истории перед дальнейшими изменениями.');let binary=''; for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary);}
  async function read() {
    const file=await request(api+'?ref=main');
    if(file.encoding!=='base64'||typeof file.sha!=='string')throw new Error('Не удалось прочитать общий JSON');
    const bytes=Uint8Array.from(atob(file.content.replace(/\s/g,'')),c=>c.charCodeAt(0));
    return {sha:file.sha,state:PlanJSON.validate(JSON.parse(new TextDecoder().decode(bytes)))};
  }
  function renderLog() {
    log.replaceChildren();
    history.querySelector('summary').textContent='История изменений · '+state.actions.length;
    const names={add:'Добавлено',edit:'Изменено',delete:'Удалено',schedule:'Изменены сроки'};
    const display=(action,value)=>{if(value===null)return '—';if(action.type!=='schedule')return value;const schedule=JSON.parse(value);return 'Подготовка: '+schedule.prepStart+' — '+schedule.prepEnd+'; запуск: '+schedule.launchStart+' — '+schedule.launchEnd;};
    state.actions.slice(-100).reverse().forEach(action=>{
      const row=el('li'); row.append(el('b','',names[action.type]+' · '+monthNames[action.month]),el('div','',action.actor+' · '+new Date(action.at).toLocaleString('ru-RU')));
      if(action.productName)row.append(el('div','',action.productName));
      const values=el('details');values.append(el('summary','','Показать изменение'),el('p','history-text','Было: '+display(action,action.before)),el('p','history-text','Стало: '+display(action,action.after)));row.append(values);log.append(row);
    });
    if(!state.actions.length)log.append(el('li','','Изменений пока нет'));
  }
  function updateUI() {
    cards.forEach((_,month)=>draw(month)); renderLog();
    if(onNotesChange)onNotesChange();
  }
  function draw(month) {
    const host=hosts[month];
    const rows=state.notes.filter(note=>note.month===month);
    // Keep a local draft visible even if a colleague deleted the underlying note.
    for(const [id,draft] of drafts) if(draft.month===month&&!rows.some(note=>note.id===id))rows.push({id,month,text:draft.text,revision:draft.baseRevision});
    const ids=new Set(rows.map(note=>note.id));
    for(const row of [...host.children])if(!ids.has(row.dataset.noteId))row.remove();
    rows.forEach((note,index)=>{
      let row=[...host.children].find(n=>n.dataset.noteId===note.id);
      if(!row){
        row=el('div','note-row');row.dataset.noteId=note.id;
        const box=el('textarea');box.rows=2;box.maxLength=5000;box.placeholder='Товар, задача или комментарий…';
        box.addEventListener('input',()=>{
          const current=state.notes.find(n=>n.id===note.id);
          const previous=drafts.get(note.id);
          const draft=previous||{month,baseRevision:current?.revision};draft.text=box.value;drafts.set(note.id,draft);
          clearTimeout(timers.get(note.id));
          if(!previous?.conflict)timers.set(note.id,setTimeout(()=>saveDraft(note.id),1500));
          message('Есть несохранённые изменения…');
        });
        box.addEventListener('blur',()=>{const draft=drafts.get(note.id);if(draft&&!draft.conflict)saveDraft(note.id);});
        const controls=el('div','note-controls');
        const remove=el('button','remove-note','×');remove.type='button';remove.title='Удалить поле';
        remove.addEventListener('click',()=>{
          if(!requireAccess())return;
          const current=state.notes.find(n=>n.id===note.id),draft=drafts.get(note.id);
          if(!current){if(window.confirm('Удалить ваш несохранённый черновик?')){drafts.delete(note.id);draw(month);}return;}
          if((draft?.text||current.text).trim()&&!window.confirm('Удалить поле из общего плана?'))return;
          clearTimeout(timers.get(note.id));
          if(draft)draft.conflict=true; // Prevent a blur timer racing with deletion.
          mutate([{id:crypto.randomUUID(),type:'delete',noteId:note.id,month,baseRevision:current.revision}]).then(()=>{drafts.delete(note.id);draw(month);}).catch(error=>{message(error.message);});
        });
        const accept=el('button','accept-common','Принять общую версию');accept.type='button';accept.hidden=true;
        accept.addEventListener('click',()=>{if(!window.confirm('Отбросить ваш несохранённый текст и принять общую версию?'))return;clearTimeout(timers.get(note.id));drafts.delete(note.id);draw(month);});
        const saved=el('button','saved-note');saved.type='button';saved.title='Изменить сроки подготовки и запуска';
        saved.addEventListener('click',()=>{const current=state.notes.find(item=>item.id===note.id);if(current&&onScheduleOpen)onScheduleOpen({key:'note:'+current.id,month,name:current.text});});
        const edit=el('button','edit-note','Изменить');edit.type='button';
        edit.addEventListener('click',()=>{if(!requireAccess())return;row.dataset.editing='true';draw(month);box.focus();});
        box.addEventListener('click',()=>{if(box.readOnly)requireAccess();});
        controls.prepend(edit);
        controls.append(remove,accept);row.append(saved,box,controls,el('div','common-version'));host.append(row);
      }
      const box=row.querySelector('textarea'),draft=drafts.get(note.id);
      const showSaved=Boolean(note.text.trim()&&!draft&&row.dataset.editing!=='true');
      row.querySelector('.saved-note').textContent=note.text;
      row.querySelector('.saved-note').hidden=!showSaved;
      box.hidden=showSaved;
      row.classList.toggle('is-saved',showSaved);
      row.querySelector('.edit-note').hidden=!showSaved;
      row.querySelector('.edit-note').setAttribute('aria-label','Изменить поле '+(index+1)+': '+monthNames[month]);
      row.querySelector('.remove-note').hidden=!token&&showSaved;
      box.disabled=false;box.readOnly=!(token&&actor);
      if(document.activeElement!==box||!draft)box.value=draft?draft.text:note.text;
      box.setAttribute('aria-label',monthNames[month]+': поле '+(index+1));
      row.querySelector('.remove-note').disabled=false;
      row.querySelector('.remove-note').setAttribute('aria-label','Удалить поле '+(index+1)+': '+monthNames[month]);
      row.querySelector('.accept-common').hidden=!draft?.conflict;
      row.classList.toggle('has-conflict',Boolean(draft?.conflict));
      row.querySelector('.common-version').textContent=draft?.conflict?'Общая версия: '+(state.notes.find(n=>n.id===note.id)?.text??'поле удалено'):'';
      row.title=draft?.conflict?'Общая версия: '+(state.notes.find(n=>n.id===note.id)?.text??'поле удалено'):'';
    });
    host.nextElementSibling.disabled=false;
  }
  cards.forEach((card,month)=>{
    const section=el('div','plan-notes');section.append(el('h4','','Общие товары и задачи'));
    const host=el('div','note-fields');hosts[month]=host;
    const add=el('button','add-note','+ Добавить поле');add.type='button';add.setAttribute('aria-label','Добавить поле: '+monthNames[month]);
    add.addEventListener('click',async()=>{
      if(!requireAccess())return;
      add.disabled=true;
      const id=crypto.randomUUID();
      try{await mutate([{id:crypto.randomUUID(),type:'add',noteId:id,month,text:''}]);draw(month);[...host.children].find(row=>row.dataset.noteId===id)?.querySelector('textarea').focus();}
      catch(error){message(error.message);}finally{add.disabled=false;}
    });
    section.append(host,add);card.append(section);
  });
  function mutate(operations) {
    const work=async()=>{
      if(!token||!actor)throw new Error('Подключите свой доступ GitHub для сохранения');
      busy=true;message('Сохраняем изменения в общий JSON…');
      try{
        for(let attempt=0;attempt<3;attempt++){
          const file=await read();
          let next;
          try{next=PlanJSON.apply(file.state,operations,actor);}catch(error){state=file.state;updateUI();throw error;}
          if(next.revision===file.state.revision){state=next;updateUI();return;}
          try{
            await request(api,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'План рекламы: '+operations.map(op=>op.type).join(', ')+' · '+actor,content:encode(next),sha:file.sha,branch:'main'})});
            state=next;updateUI();message('Общий JSON сохранён · '+actor);return;
          }catch(error){if(![409,422].includes(error.status)||attempt===2)throw error;}
        }
      }finally{busy=false;}
    };
    const result=queue.then(work);queue=result.catch(()=>{});return result;
  }
  async function saveDraft(id) {
    clearTimeout(timers.get(id));
    const draft=drafts.get(id);if(!draft||draft.saving||draft.conflict)return;
    draft.saving=true;
    const text=draft.operationText ?? draft.text,baseRevision=draft.baseRevision;
    draft.operationText=text;
    try{
      await mutate([{id:draft.operationId ||= crypto.randomUUID(),type:'edit',noteId:id,month:draft.month,text,baseRevision}]);
      const current=drafts.get(id);
      if(current===draft){
        if(current.text===text){drafts.delete(id);const row=[...hosts[draft.month].children].find(n=>n.dataset.noteId===id);if(row)delete row.dataset.editing;}
        else{current.baseRevision=state.notes.find(n=>n.id===id)?.revision;delete current.operationId;delete current.operationText;}
      }
      updateUI();
    }catch(error){if(error.conflict)draft.conflict=true;message(error.message);updateUI();}
    finally{draft.saving=false;if(drafts.get(id)===draft&&draft.operationText===undefined&&!draft.conflict)saveDraft(id);}
  }
  async function reload(silent=false) {
    if(busy)return;
    try{const file=await read();state=file.state;updateUI();if(!silent)message(drafts.size?'Общие данные обновлены; ваши черновики сохранены в полях':'Общие данные загружены из JSON');}
    catch(error){if(!silent)message(error.message);}
  }
  login.addEventListener('click',async()=>{
    const candidate=input.value.trim();if(!candidate){message('Введите личный GitHub-токен');return;}
    login.disabled=true;token=candidate;
    try{const user=await request('https://api.github.com/user');actor=user.login;await read();input.value='';input.hidden=true;label.hidden=true;login.hidden=true;logout.hidden=false;logout.textContent='Отключить '+actor;updateUI();await reload();}
    catch(error){token='';actor='';message(error.message);}finally{login.disabled=false;}
  });
  logout.addEventListener('click',()=>{if(drafts.size&&!window.confirm('Отключиться? Несохранённый текст останется в полях до закрытия страницы.'))return;token='';actor='';input.hidden=false;label.hidden=false;login.hidden=false;logout.hidden=true;updateUI();message('Доступ отключён. Общий JSON доступен для чтения.');});
  refresh.addEventListener('click',()=>reload());
  setInterval(()=>{if(token&&!document.hidden)reload(true);},30000);
  window.addEventListener('beforeunload',event=>{if(drafts.size||busy){event.preventDefault();event.returnValue='';}});
  function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));const link=el('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  document.getElementById('plan-export').addEventListener('click',()=>{
    const copy=JSON.parse(JSON.stringify(state));copy.unsavedDrafts=[...drafts].map(([id,draft])=>({id,month:draft.month,text:draft.text,baseRevision:draft.baseRevision}));download(copy,'polyarik-plan-data.json');message('JSON с данными, журналом и несохранёнными черновиками подготовлен');
  });
  const fileInput=document.getElementById('plan-file');
  document.getElementById('plan-import').textContent='Добавить заметки из JSON';
  document.getElementById('plan-import').addEventListener('click',()=>{if(!requireAccess())return;fileInput.click();});
  fileInput.addEventListener('change',async()=>{
    const file=fileInput.files[0];if(!file)return;
    try{
      if(file.size>7*1024*1024)throw new Error('Слишком большой файл');
      const value=JSON.parse(await file.text());let imported=[];
      if(value.version===2){PlanJSON.validate(value);imported=value.notes;}
      else if(value.version===1&&value.period===PlanJSON.period&&value.notes&&typeof value.notes==='object'&&!Array.isArray(value.notes)){
        for(const [month,list] of Object.entries(value.notes)){if(!/^(0|[1-9]|10|11)$/.test(month)||!Array.isArray(list)||list.length>100||list.some(text=>typeof text!=='string'||text.length>5000))throw new Error('Неверный файл');imported.push(...list.map(text=>({month:Number(month),text})));}
      }else throw new Error('Неверный формат JSON');
      if(!imported.length){message('В файле нет заметок');return;}
      if(!window.confirm('Добавить '+imported.length+' заметок в общий план? Текущие заметки останутся.'))return;
      await mutate(imported.map(note=>({id:crypto.randomUUID(),type:'add',noteId:crypto.randomUUID(),month:note.month,text:note.text})));
    }catch(error){message(error.message);}finally{fileInput.value='';}
  });
  try{const previous=JSON.parse(localStorage.getItem('polyarik-ad-plan-2026-2027-v1')||'null');if(previous&&Object.values(previous).some(list=>Array.isArray(list)&&list.length)){const backup=el('button','','Скачать прежние заметки из браузера');backup.type='button';backup.addEventListener('click',()=>download({version:1,period:PlanJSON.period,notes:previous},'polyarik-old-notes.json'));tools.append(backup);}}catch(_){}
  updateUI();message('Общий JSON загружен. Для редактирования подключите GitHub.');
  reload(true);
  const getNotes=month=>state.notes.filter(note=>note.month===month&&note.text.trim()).map(note=>note.text);
  getNotes.records=()=>state.notes.filter(note=>note.text.trim());
  getNotes.schedules=()=>state.schedules||[];
  getNotes.saveSchedule=op=>mutate([op]);
  getNotes.requireAccess=requireAccess;
  return getNotes;
}
