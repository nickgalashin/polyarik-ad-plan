/* Individual schedules and shared notes load from plan-data.json. */
function initAdPlan(data, render, initial) {
  'use strict';
  const monthNames=data.year.map(row=>row.m),calendarViews=[];
  const fields=['prepStart','prepEnd','launchStart','launchEnd'];
  let editor,activeDay=null,activeProduct=null,baseRevision=0;
  data.plan=data.year.map((label,index)=>({...data.year[(index+1)%12],m:label.m,s:label.s,sourceMonth:data.year[(index+1)%12].m}));
  render('plan');
  function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
  function button(text,handler,cls=''){const n=el('button',cls,text);n.type='button';n.addEventListener('click',handler);return n;}
  const top=data.plan.flatMap((row,month)=>row.items.map((item,rank)=>({key:'top:'+month+':'+rank,month,name:item[0]})));
  const cards=document.querySelectorAll('#months-plan .month');
  cards.forEach((card,month)=>{
    card.querySelector('header').after(el('p','plan-source','Спрос: '+data.plan[month].sourceMonth.toLowerCase()));
    card.querySelectorAll('.qty').forEach(q=>q.title='Исторические заказы: '+data.plan[month].sourceMonth.toLowerCase());
    card.querySelectorAll('.items .name').forEach((name,rank)=>{const product=top.find(p=>p.key==='top:'+month+':'+rank);const b=button(name.textContent,()=>openSchedule(product),'name schedule-name');b.title='Изменить сроки подготовки и запуска';name.replaceWith(b);});
  });
  const dayDialog=el('dialog','plan-dialog'),dayTitle=el('h3'),dayContent=el('div');
  dayTitle.id='plan-day-title';dayDialog.setAttribute('aria-labelledby',dayTitle.id);
  dayDialog.append(button('Закрыть',()=>dayDialog.close(),'dialog-close'),dayTitle,dayContent);document.body.append(dayDialog);
  const modal=el('dialog','plan-dialog schedule-dialog'),title=el('h3','','Сроки запуска'),subtitle=el('p','schedule-subtitle'),form=el('form');
  title.id='schedule-title';modal.setAttribute('aria-labelledby',title.id);
  modal.append(button('×',()=>modal.close(),'dialog-close'),title,subtitle,form);modal.firstChild.setAttribute('aria-label','Закрыть сроки');document.body.append(modal);
  const inputs={};
  [['Подготовка','prepStart','prepEnd'],['Запуск','launchStart','launchEnd']].forEach(([label,start,end])=>{
    const group=el('fieldset','schedule-phase');group.append(el('legend','',label));
    [[start,'Начало'],[end,'Окончание']].forEach(([key,text])=>{const labelNode=el('label','',text),input=el('input');input.type='date';input.required=true;input.name=key;labelNode.append(input);group.append(labelNode);inputs[key]=input;});form.append(group);
  });
  const shift=el('details','schedule-shift'),shiftInput=el('input');shiftInput.type='number';shiftInput.value='0';shiftInput.min='-366';shiftInput.max='366';shiftInput.step='1';shiftInput.setAttribute('aria-label','Сдвиг всего графика в днях');
  shift.append(el('summary','','Сдвинуть весь график'),el('p','plan-source','Положительное число — позже, отрицательное — раньше.'),shiftInput,button('Применить сдвиг',()=>{try{setDates(PlanJSON.shiftSchedule(getDates(),Number(shiftInput.value)));feedback.textContent='Сдвиг применён. Нажмите «Сохранить», чтобы обновить календарь.';}catch(error){feedback.textContent=error.message;}}));form.append(shift);
  const feedback=el('p','schedule-feedback');feedback.setAttribute('role','status');
  const reloadButton=button('Загрузить актуальные сроки',()=>loadDates());reloadButton.hidden=true;
  const save=el('button','schedule-save','Сохранить');save.type='submit';
  const actions=el('div','schedule-actions');actions.append(button('По умолчанию',()=>{setDates(PlanJSON.defaultSchedule(activeProduct.month));feedback.textContent='Стандартные сроки восстановлены. Нажмите «Сохранить».';}),button('Отмена',()=>modal.close()),save);
  form.append(feedback,reloadButton,actions);
  function getDates(){return Object.fromEntries(fields.map(key=>[key,inputs[key].value]));}
  function setDates(dates){fields.forEach(key=>inputs[key].value=dates[key]);}
  function loadDates(){const current=editor.schedules().find(s=>s.key===activeProduct.key);baseRevision=current?.revision||0;setDates(current||PlanJSON.defaultSchedule(activeProduct.month));feedback.textContent='';reloadButton.hidden=true;}
  function openSchedule(product){activeProduct=product;subtitle.textContent=product.name+' · '+monthNames[product.month]+' '+(product.month>=9?2026:2027);loadDates();shift.open=false;shiftInput.value='0';dayDialog.close();modal.showModal();}
  form.addEventListener('submit',async event=>{
    event.preventDefault();const schedule=getDates();
    if(!PlanJSON.validSchedule(schedule)){feedback.textContent='Проверьте даты: начало не позже окончания, подготовка заканчивается до начала запуска.';return;}
    if(!editor.requireAccess()){modal.close();return;}
    save.disabled=true;feedback.textContent='Сохраняем сроки…';
    try{await editor.saveSchedule({id:crypto.randomUUID(),type:'schedule',key:activeProduct.key,month:activeProduct.month,name:activeProduct.name,schedule,baseRevision});modal.close();}
    catch(error){feedback.textContent=error.message;reloadButton.hidden=!error.conflict;}finally{save.disabled=false;}
  });
  form.addEventListener('input',()=>{reloadButton.hidden=true;const dates=getDates();feedback.textContent=PlanJSON.validSchedule(dates)&&(dates.prepStart<'2026-10-01'||dates.launchEnd>'2027-09-30')?'Часть графика выходит за пределы календаря 01.10.2026–30.09.2027.':'';});
  function campaigns(){return [...top,...editor.records().map(n=>({key:'note:'+n.id,month:n.month,name:n.text,manual:true}))].map(p=>({...p,dates:editor.schedules().find(s=>s.key===p.key)||PlanJSON.defaultSchedule(p.month)}));}
  function phase(p,date){const s=p.dates;return date>=s.prepStart&&date<=s.prepEnd?'prep':date>=s.launchStart&&date<=s.launchEnd?'launch':null;}
  function productList(items,withDates=false){const list=el('ol');items.forEach(p=>{const li=el('li',p.manual?'manual-note':'');li.append(button(p.name,()=>openSchedule(p),'schedule-name'));if(withDates)li.append(el('small','campaign-dates',monthNames[p.month]+': подготовка '+p.dates.prepStart+' — '+p.dates.prepEnd+'; запуск '+p.dates.launchStart+' — '+p.dates.launchEnd));list.append(li);});return list;}
  function renderDay(date){dayTitle.textContent=new Date(date+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});dayContent.replaceChildren();const all=campaigns();let count=0;[['prep','Подготовка'],['launch','Запуск']].forEach(([key,label])=>{const items=all.filter(p=>phase(p,date)===key);if(items.length){count+=items.length;dayContent.append(el('h4','',label+' · '+items.length),productList(items,true));}});if(!count)dayContent.append(el('p','','На этот день подготовка и запуск не запланированы.'));}
  function refreshCalendar(){if(!editor||!calendarViews.length)return;const all=campaigns();calendarViews.forEach(({start,end,products,days})=>{
    const items=all.filter(p=>p.dates.prepStart<=end&&p.dates.prepEnd>=start||p.dates.launchStart<=end&&p.dates.launchEnd>=start);
    products.querySelector('summary').textContent='Товары и задачи месяца · '+items.length;products.querySelector('ol').replaceWith(productList(items,true));
    days.forEach(b=>{const date=b.dataset.date,prep=all.filter(p=>phase(p,date)==='prep').length,launch=all.filter(p=>phase(p,date)==='launch').length;b.className='plan-day '+(prep&&launch?'mixed':prep?'prep':launch?'launch':'empty');b.setAttribute('aria-label',date+': подготовка — '+prep+', запуск — '+launch);b.querySelector('.day-phase').textContent=prep&&launch?'П: '+prep+' · З: '+launch:prep?'Подготовка · '+prep:launch?'Запуск · '+launch:'—';});
  });if(dayDialog.open&&activeDay)renderDay(activeDay);}
  editor=attachPlanEditor(initial,monthNames,document.getElementById('plan-save-status'),cards,refreshCalendar,openSchedule);
  const calendar=document.getElementById('plan-calendar');
  for(let offset=0;offset<12;offset++){
    const date=new Date(2026,9+offset,1),year=date.getFullYear(),month=date.getMonth(),count=new Date(year,month+1,0).getDate(),prefix=year+'-'+String(month+1).padStart(2,'0')+'-';
    const block=el('article','calendar-month'),grid=el('div','day-grid'),days=[];block.append(el('h3','',monthNames[month]+' '+year));
    ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(d=>grid.append(el('span','weekday',d)));
    for(let b=0;b<(date.getDay()+6)%7;b++){const blank=el('span');blank.setAttribute('aria-hidden','true');grid.append(blank);}
    for(let day=1;day<=count;day++){const key=prefix+String(day).padStart(2,'0'),b=button('',()=>{activeDay=key;renderDay(key);dayDialog.showModal();},'plan-day');b.dataset.date=key;b.append(el('span','day-number',day),el('span','day-phase'));days.push(b);grid.append(b);}
    const products=el('details','calendar-products');products.append(el('summary'),el('ol'));block.append(grid,products);calendar.append(block);calendarViews.push({start:prefix+'01',end:prefix+count,products,days});
  }
  refreshCalendar();
}
