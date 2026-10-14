/* Rankings and shared notes load from plan-data.json. */
function initAdPlan(data, render, initial) {
  'use strict';
  const status = document.getElementById('plan-save-status');
  const monthNames = data.year.map(row => row.m);
  data.plan = data.year.map((label,index) => ({...data.year[(index+1)%12],m:label.m,s:label.s,sourceMonth:data.year[(index+1)%12].m}));
  render('plan');
  function element(tag,className,text) {const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  const cards = document.querySelectorAll('#months-plan .month');
  cards.forEach((card,month)=>{card.querySelector('header').after(element('p','plan-source','Спрос: '+data.plan[month].sourceMonth.toLowerCase()));card.querySelectorAll('.qty').forEach(q=>{q.title='Исторические заказы: '+data.plan[month].sourceMonth.toLowerCase();});});
  const calendarViews=[];
  let notesForMonth=()=>[];
  notesForMonth = attachPlanEditor(initial,monthNames,status,cards,refreshCalendar);
  const dialog = element('dialog', 'plan-dialog');
  const close = element('button', 'dialog-close', 'Закрыть');
  close.type = 'button'; close.addEventListener('click', () => dialog.close());
  const dialogTitle = element('h3'); dialogTitle.id = 'plan-day-title';
  dialog.setAttribute('aria-labelledby', dialogTitle.id);
  const detail = element('div'); dialog.append(close, dialogTitle, detail); document.body.append(dialog);
  let activeDay=null;
  function renderDay(year, month, day) {
    const phase = day <= 14 ? 'Подготовка' : 'Запуск';
    dialogTitle.textContent = new Date(year, month, day).toLocaleDateString('ru-RU', {day: 'numeric', month: 'long', year: 'numeric'}) + ' · ' + phase;
    detail.replaceChildren(element('p', 'plan-source', 'Топ-7 по спросу следующего месяца: ' + data.plan[month].sourceMonth.toLowerCase()));
    const list = productList(month);
    detail.append(list);
  }
  function showDay(year,month,day){activeDay={year,month,day};renderDay(year,month,day);if(!dialog.open)dialog.showModal();}
  function productList(month){
    const list=element('ol');
    data.plan[month].items.forEach(item=>list.append(element('li','',item[0])));
    notesForMonth(month).forEach(text=>list.append(element('li','manual-note',text)));
    return list;
  }
  function refreshCalendar(){
    calendarViews.forEach(({month,products})=>{
      const total=7+notesForMonth(month).length;
      products.querySelector('summary').textContent='Товары и задачи месяца · '+total;
      products.querySelector('ol').replaceWith(productList(month));
    });
    if(calendarViews.length&&dialog.open&&activeDay)renderDay(activeDay.year,activeDay.month,activeDay.day);
  }
  const calendar = document.getElementById('plan-calendar');
  for (let offset = 0; offset < 12; offset++) {
    const date = new Date(2026, 9 + offset, 1);
    const year = date.getFullYear(), month = date.getMonth();
    const count = new Date(year, month + 1, 0).getDate();
    const block = element('article', 'calendar-month');
    block.append(element('h3', '', monthNames[month] + ' ' + year));
    const grid = element('div', 'day-grid');
    ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach(day => grid.append(element('span', 'weekday', day)));
    const blanks = (date.getDay() + 6) % 7;
    for (let b = 0; b < blanks; b++) { const blank = element('span'); blank.setAttribute('aria-hidden', 'true'); grid.append(blank); }
    for (let day = 1; day <= count; day++) {
      const phase = day <= 14 ? 'Подготовка' : 'Запуск';
      const button = element('button', 'plan-day ' + (day <= 14 ? 'prep' : 'launch'));
      button.type = 'button';
      button.dataset.date = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      button.setAttribute('aria-label', day + ' ' + monthNames[month] + ' ' + year + ': ' + phase + ' товаров и задач месяца');
      button.append(element('span', 'day-number', day), element('span', 'day-phase', day <= 14 ? 'Подго\u00adтовка' : phase));
      button.addEventListener('click', () => showDay(year, month, day)); grid.append(button);
    }
    block.append(grid);
    const products = element('details', 'calendar-products');
    products.append(element('summary', '', 'Товары и задачи месяца · '+(7+notesForMonth(month).length)));
    const list = productList(month);
    products.append(list); block.append(products); calendar.append(block);
    calendarViews.push({month,products});
  }
}
