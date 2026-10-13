/* Advertising plan: source rankings stay immutable; notes are browser-local. */
function initAdPlan(data, render) {
  'use strict';
  const KEY = 'polyarik-ad-plan-2026-2027-v1';
  const status = document.getElementById('plan-save-status');
  const monthNames = data.year.map(row => row.m);
  data.plan = data.year.map((label, index) => ({
    ...data.year[(index + 1) % 12], m: label.m, s: label.s,
    sourceMonth: data.year[(index + 1) % 12].m
  }));
  render('plan');
  let notes = {};
  function validNotes(value) {
    return value && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).every(key => /^(0|[1-9]|10|11)$/.test(key) &&
        Array.isArray(value[key]) && value[key].length <= 100 &&
        value[key].every(text => typeof text === 'string' && text.length <= 5000));
  }
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const value = JSON.parse(saved);
      if (!validNotes(value)) throw new Error('Invalid notes');
      notes = value;
      status.textContent = 'Сохранённые заметки загружены';
    }
  } catch (_) {
    status.textContent = 'Не удалось загрузить заметки. Используйте экспорт, чтобы сохранить текущий текст.';
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(notes));
      status.textContent = 'Заметки сохранены в этом браузере';
    } catch (_) {
      status.textContent = 'Автосохранение недоступно. Сохраните заметки кнопкой «Экспорт».';
    }
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const noteHosts = [];
  const cards = document.querySelectorAll('#months-plan .month');
  cards.forEach((card, month) => {
    const source = element('p', 'plan-source', 'Спрос: ' + data.plan[month].sourceMonth.toLowerCase());
    card.querySelector('header').after(source);
    // Counts represent the source month, not the shifted advertising month.
    card.querySelectorAll('.qty').forEach(q => { q.title = 'Исторические заказы: ' + data.plan[month].sourceMonth.toLowerCase(); });
    const section = element('div', 'plan-notes');
    section.append(element('h4', '', 'Свои товары и задачи'));
    const host = element('div', 'note-fields');
    noteHosts[month] = host;
    const add = element('button', 'add-note', '+ Добавить поле');
    add.type = 'button';
    add.setAttribute('aria-label', 'Добавить поле: ' + monthNames[month]);
    add.addEventListener('click', () => {
      if ((notes[month] || []).length >= 100) { status.textContent = 'Для месяца можно добавить до 100 полей'; return; }
      (notes[month] ||= []).push('');
      drawNotes(month);
      save();
      host.lastElementChild.querySelector('textarea').focus();
    });
    section.append(host, add);
    card.append(section);
    drawNotes(month);
  });
  function drawNotes(month) {
    const host = noteHosts[month];
    host.replaceChildren();
    (notes[month] || []).forEach((text, index) => {
      const row = element('div', 'note-row');
      const input = element('textarea');
      input.rows = 2;
      input.maxLength = 5000;
      input.value = text;
      input.placeholder = 'Товар, задача или комментарий…';
      input.setAttribute('aria-label', monthNames[month] + ': поле ' + (index + 1));
      input.addEventListener('input', () => { notes[month][index] = input.value; save(); });
      const remove = element('button', 'remove-note', '×');
      remove.type = 'button';
      remove.title = 'Удалить поле';
      remove.setAttribute('aria-label', 'Удалить поле ' + (index + 1) + ': ' + monthNames[month]);
      remove.addEventListener('click', () => {
        if (input.value.trim() && !window.confirm('Удалить это поле с текстом?')) return;
        notes[month].splice(index, 1);
        drawNotes(month); save();
        (host.querySelector('textarea') || host.nextElementSibling).focus();
      });
      row.append(input, remove); host.append(row);
    });
  }
  document.getElementById('plan-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({version: 1, period: '2026-10/2027-09', notes}, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = element('a');
    link.href = url; link.download = 'polyarik-plan-notes-2026-2027.json';
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Экспорт заметок подготовлен';
  });
  const fileInput = document.getElementById('plan-file');
  document.getElementById('plan-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      if (file.size > 7 * 1024 * 1024) throw new Error('Too large');
      const value = JSON.parse(await file.text());
      if (value.version !== 1 || value.period !== '2026-10/2027-09' || !validNotes(value.notes)) throw new Error('Invalid file');
      if (Object.values(notes).some(list => list.length) && !window.confirm('Заменить текущие заметки содержимым файла?')) return;
      notes = value.notes;
      cards.forEach((_, month) => drawNotes(month)); save();
    } catch (_) { status.textContent = 'Файл не подходит. Выберите JSON, созданный кнопкой «Экспорт заметок».'; }
    finally { fileInput.value = ''; }
  });
  const dialog = element('dialog', 'plan-dialog');
  const close = element('button', 'dialog-close', 'Закрыть');
  close.type = 'button'; close.addEventListener('click', () => dialog.close());
  const dialogTitle = element('h3'); dialogTitle.id = 'plan-day-title';
  dialog.setAttribute('aria-labelledby', dialogTitle.id);
  const detail = element('div'); dialog.append(close, dialogTitle, detail); document.body.append(dialog);
  function showDay(year, month, day) {
    const phase = day <= 14 ? 'Подготовка' : 'Запуск';
    dialogTitle.textContent = new Date(year, month, day).toLocaleDateString('ru-RU', {day: 'numeric', month: 'long', year: 'numeric'}) + ' · ' + phase;
    detail.replaceChildren(element('p', 'plan-source', 'Топ-7 по спросу следующего месяца: ' + data.plan[month].sourceMonth.toLowerCase()));
    const list = element('ol'); data.plan[month].items.forEach(item => list.append(element('li', '', item[0])));
    detail.append(list);
    const own = (notes[month] || []).filter(text => text.trim());
    if (own.length) {
      detail.append(element('h4', '', 'Свои товары и задачи'));
      const ul = element('ul'); own.forEach(text => ul.append(element('li', 'day-note', text))); detail.append(ul);
    }
    dialog.showModal();
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
      button.setAttribute('aria-label', day + ' ' + monthNames[month] + ' ' + year + ': ' + phase + ' топ-7 товаров');
      button.append(element('span', 'day-number', day), element('span', 'day-phase', day <= 14 ? 'Подго\u00adтовка' : phase));
      button.addEventListener('click', () => showDay(year, month, day)); grid.append(button);
    }
    block.append(grid);
    const products = element('details', 'calendar-products');
    products.append(element('summary', '', 'Товары месяца · 7'));
    const list = element('ol'); data.plan[month].items.forEach(item => list.append(element('li', '', item[0])));
    products.append(list); block.append(products); calendar.append(block);
  }
}
