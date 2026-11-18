import { html, render, useState, useEffect, useMemo, useRef, useCallback } from './vendor/htm-preact.js';

// ---------- api ----------
let token = null;
try { token = localStorage.getItem('soprano_token'); } catch (e) { /* storage blocked */ }
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') { setToken(null); location.reload(); }
  if (!res.ok) throw new Error(data.error || 'Ошибка ' + res.status);
  return data;
}
function setToken(t) { token = t; try { t ? localStorage.setItem('soprano_token', t) : localStorage.removeItem('soprano_token'); } catch (e) { /* ignore */ } }

// ---------- format ----------
const eur = (n) => (n == null ? '—' : new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' €');
const eur0 = (n) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + ' €';
const DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS1 = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const dateObj = (d) => new Date(d + 'T12:00:00Z');
const addDays = (d, n) => { const x = dateObj(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const fmtDay = (d) => { const x = dateObj(d); return `${DOW[x.getUTCDay()]}, ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`; };
const fmtShort = (d) => { const x = dateObj(d.slice(0, 10)); return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()].slice(0, 3)}${d.length > 10 ? ' ' + d.slice(11, 16) : ''}`; };
const fmtMonth = (m) => `${MONTHS1[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
const addMonths = (m, n) => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const initials = (n) => n.split(' ').map((x) => x[0]).join('').slice(0, 2);
const METHOD = { cash: 'Наличные', card: 'Карта', transfer: 'Перевод', stebby: 'Stebby' };
const STATUS = { booked: ['Записан', ''], arrived: ['Пришёл', 'warn'], done: ['Оказано', 'ok'], no_show: ['Не пришёл', 'bad'], cancelled: ['Отменено', 'bad'] };

// ---------- icons ----------
const I = {
  cal: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`,
  users: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c1.8.7 3 2.5 3.5 5.4"/></svg>`,
  box: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/></svg>`,
  money: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>`,
  wallet: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/></svg>`,
  log: html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7M9 7h3"/></svg>`,
};

// ---------- small components ----------
function Toast({ text }) { return text ? html`<div class="toast">${text}</div>` : null; }
function Drawer({ title, sub, onClose, children }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, []);
  return html`<div class="overlay" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="drawer"><div class="drawer-head"><div style="flex:1"><h2>${title}</h2>${sub && html`<div class="muted small" style="margin-top:4px">${sub}</div>`}</div><button class="close" onClick=${onClose} aria-label="Закрыть">×</button></div>${children}</div>
  </div>`;
}
const Avatar = ({ name, color, size = 30 }) => html`<span class="avatar" style=${`background:${color};width:${size}px;height:${size}px`}>${initials(name)}</span>`;
const Status = ({ s }) => html`<span class=${'badge ' + STATUS[s][1]}>${STATUS[s][0]}</span>`;

// ---------- login ----------
function Login({ onIn }) {
  const [people, setPeople] = useState([]);
  const [sel, setSel] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/staff-public').then((p) => { setPeople(p); setSel(p[0]?.id); }).catch((e) => setError(e.message)); }, []);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { const r = await api('/login', { method: 'POST', body: { staff_id: sel, pin } }); setToken(r.token); onIn(); } catch (e2) { setError(e2.message); setBusy(false); }
  };
  return html`<div class="login"><form class="login-box" onSubmit=${submit}>
    <div class="brand"><span>Soprano Studio</span><b>Система учёта</b></div>
    <div class="people">${people.map((p) => html`<button type="button" class=${'person' + (p.id === sel ? ' on' : '')} onClick=${() => { setSel(p.id); setPin(''); }}>
      <${Avatar} name=${p.name} color=${p.color}/><span><b>${p.name}</b><small>${p.title}</small></span></button>`)}</div>
    <div class="field"><label>PIN-код</label><input class="input pin" type="password" inputmode="numeric" maxlength="6" value=${pin} onInput=${(e) => setPin(e.target.value)} autofocus/></div>
    ${error && html`<div class="error" style="margin-bottom:12px">${error}</div>`}
    <button class="btn primary" style="width:100%" disabled=${busy || !pin}>Войти</button>
    <div class="hint" style="margin-top:16px"><b>Демо-версия.</b> Все клиенты и цифры выдуманы. PIN владелицы — <b>1111</b>, мастеров — <b>2222</b>, <b>3333</b>, <b>4444</b>, <b>5555</b>. Войдите как мастер, чтобы увидеть, что ему доступно.</div>
  </form></div>`;
}

// ---------- calendar ----------
const DAY_FROM = 8 * 60, DAY_TO = 20 * 60, PPM = 1.6;
function Calendar({ boot, toast, openClient }) {
  const [date, setDate] = useState(boot.today);
  const [view, setView] = useState('staff');
  const [appts, setAppts] = useState([]);
  const [sel, setSel] = useState(null);
  const [newAt, setNewAt] = useState(null);
  const [pay, setPay] = useState(null);
  const scroller = useRef();
  const load = useCallback(() => api('/appointments?from=' + date).then(setAppts), [date]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = Math.max(0, (9 * 60 - DAY_FROM) * PPM - 10); }, []);
  const dev = Object.fromEntries(boot.devices.map((d) => [d.id, d]));
  const staffOrder = boot.me.role === 'master' ? [...boot.staff.filter((s) => s.id === boot.me.id), ...boot.staff.filter((s) => s.id !== boot.me.id)] : boot.staff;
  const cols = view === 'staff' ? staffOrder.map((s) => ({ id: s.id, name: s.name + (s.id === boot.me.id && boot.me.role === 'master' ? ' (вы)' : ''), color: s.color, key: 'staff_id' }))
    : view === 'room' ? boot.rooms.map((r) => ({ id: r.id, name: r.name, key: 'room_id' }))
    : boot.devices.map((d) => ({ id: d.id, name: d.name, color: d.color, key: 'device_id' }));
  const narrow = window.innerWidth < 600;
  const colW = narrow ? 128 : view === 'device' ? 150 : 190;
  const hours = []; for (let m = DAY_FROM; m <= DAY_TO; m += 60) hours.push(m);
  const nowMin = boot.now.slice(0, 10) === date ? toMin(new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Tallinn', hour: '2-digit', minute: '2-digit' })) : null;
  const slots = []; for (let m = DAY_FROM; m < DAY_TO; m += 15) slots.push(m);
  const visible = appts.filter((a) => a.status !== 'cancelled');
  const selA = sel && appts.find((a) => a.id === sel);
  const staffName = (id) => boot.staff.find((s) => s.id === id)?.name;
  return html`<div>
    <div class="cal-tools">
      <button class="btn sm" onClick=${() => setDate(addDays(date, -1))} aria-label="Предыдущий день">‹</button>
      <button class="btn sm" onClick=${() => setDate(boot.today)}>Сегодня</button>
      <button class="btn sm" onClick=${() => setDate(addDays(date, 1))} aria-label="Следующий день">›</button>
      <div class="cal-date">${fmtDay(date)}</div>
      <div class="seg">${[['staff', 'Мастера'], ['room', 'Кабинеты'], ['device', 'Аппараты']].map(([k, l]) => html`<button class=${view === k ? 'on' : ''} onClick=${() => setView(k)}>${l}</button>`)}</div>
      <button class="btn primary sm" onClick=${() => setNewAt({ start: `${date} 10:00` })}>+ Запись</button>
    </div>
    <div class="legend">${boot.devices.map((d) => html`<span><i class="dot" style=${'background:' + d.color}></i>${d.name}</span>`)}<span><i class="dot" style="background:var(--gold)"></i>без аппарата</span></div>
    <div class="cal" ref=${scroller}>
      <div class="cal-grid" style=${`grid-template-columns: 52px repeat(${cols.length}, minmax(${colW}px, 1fr))`}>
        <div class="cal-head corner"></div>
        ${cols.map((c) => html`<div class="cal-head">${c.color && html`<i class="dot" style=${'background:' + c.color}></i>`}${c.name}</div>`)}
        <div class="cal-times" style=${`height:${(DAY_TO - DAY_FROM) * PPM}px`}>${hours.map((m) => html`<div style=${`top:${(m - DAY_FROM) * PPM}px`}>${fromMin(m)}</div>`)}</div>
        ${cols.map((c) => html`<div class="cal-col" style=${`height:${(DAY_TO - DAY_FROM) * PPM}px`}>
          ${hours.map((m) => html`<div class="hour" style=${`top:${(m - DAY_FROM) * PPM}px`}></div><div class="half" style=${`top:${(m + 30 - DAY_FROM) * PPM}px`}></div>`)}
          ${slots.map((m) => html`<div class="slot" style=${`top:${(m - DAY_FROM) * PPM}px;height:${15 * PPM}px`} title=${'Записать на ' + fromMin(m)}
            onClick=${() => setNewAt({ start: `${date} ${fromMin(m)}`, [c.key]: c.id })}></div>`)}
          ${nowMin != null && nowMin > DAY_FROM && nowMin < DAY_TO && html`<div class="now-line" style=${`top:${(nowMin - DAY_FROM) * PPM}px`}></div>`}
          ${visible.filter((a) => a[c.key] === c.id).map((a) => {
            const s = toMin(a.start.slice(11)), e = toMin(a.end.slice(11));
            const d = dev[a.device_id]; const h = (e - s) * PPM;
            return html`<div class=${`appt ${a.status} ${a.paid > 0 ? 'paid' : ''}`} style=${`top:${(s - DAY_FROM) * PPM + 1}px;height:${h - 2}px;--c:${d ? d.color : 'var(--gold)'}`}
              onClick=${() => setSel(a.id)} title=${`${a.start.slice(11)}–${a.end.slice(11)} ${a.client_name || ''} · ${a.service_name || a.title}`}>
              <div><span class="t">${a.start.slice(11)}</span> <b>${a.client_name || a.title}</b></div>
              ${h > 30 && html`<div>${a.service_name}</div>`}
              ${h > 46 && html`<div class="muted">${view === 'staff' ? (boot.rooms.find((r) => r.id === a.room_id)?.name || '') : staffName(a.staff_id)}${d && view !== 'device' ? html` <span class="dev">${d.name}</span>` : ''}</div>`}
            </div>`;
          })}
        </div>`)}
      </div>
    </div>
    <p class="muted small" style="margin-top:10px">Нажмите на пустое место в сетке, чтобы записать клиента. Цвет записи — аппарат: если аппарат занят, вторая запись на него не пройдёт, даже у другого мастера.</p>
    ${selA && html`<${ApptDrawer} a=${selA} boot=${boot} onClose=${() => setSel(null)} reload=${load} toast=${toast} openClient=${openClient} onPay=${() => setPay(selA)}/>`}
    ${newAt && html`<${NewAppt} init=${newAt} boot=${boot} onClose=${() => setNewAt(null)} onDone=${(start) => { setNewAt(null); if (start.slice(0, 10) !== date) setDate(start.slice(0, 10)); else load(); toast('Запись создана'); }}/>`}
    ${pay && html`<${PayDrawer} a=${pay} boot=${boot} onClose=${() => setPay(null)} onDone=${(r) => { setPay(null); setSel(null); load(); toast(`Оплачено. Бонус мастера ${eur(r.bonus)}${r.cash_taken ? `, забрано наличными ${eur(r.cash_taken)}` : ''}`); }}/>`}
  </div>`;
}

function ApptDrawer({ a, boot, onClose, reload, toast, openClient, onPay }) {
  const [move, setMove] = useState(false);
  const [time, setTime] = useState(a.start.slice(11));
  const [day, setDay] = useState(a.start.slice(0, 10));
  const [staff, setStaff] = useState(a.staff_id);
  const [error, setError] = useState('');
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState('');
  const d = boot.devices.find((x) => x.id === a.device_id);
  const patch = async (body, msg) => { setError(''); try { await api('/appointments/' + a.id, { method: 'PATCH', body }); await reload(); toast(msg); onClose(); } catch (e) { setError(e.message); } };
  const canEdit = boot.me.role !== 'master' || a.staff_id === boot.me.id;
  return html`<${Drawer} title=${a.client_name || a.title} sub=${a.client_phone} onClose=${onClose}>
    <dl class="kv">
      <dt>Услуга</dt><dd><b>${a.service_name}</b> · ${eur(a.service_price)}</dd>
      <dt>Когда</dt><dd>${fmtDay(a.start.slice(0, 10))}, ${a.start.slice(11)}–${a.end.slice(11)}</dd>
      <dt>Мастер</dt><dd>${boot.staff.find((s) => s.id === a.staff_id)?.name}</dd>
      <dt>Кабинет</dt><dd>${boot.rooms.find((r) => r.id === a.room_id)?.name || '—'}</dd>
      <dt>Аппарат</dt><dd>${d ? html`<span class="row" style="gap:6px"><i class="dot" style=${'background:' + d.color}></i>${d.name}</span>` : 'не нужен'}</dd>
      <dt>Статус</dt><dd><${Status} s=${a.status}/> ${a.paid > 0 && html`<span class="badge ok">Оплачено ${eur(a.paid)}</span>`}</dd>
      ${a.note && html`<dt>Примечание</dt><dd>${a.note}</dd>`}
      ${a.cancel_reason && html`<dt>Причина</dt><dd>${a.cancel_reason}</dd>`}
    </dl>
    ${error && html`<div class="error" style="margin-bottom:12px">${error}</div>`}
    ${!canEdit && html`<div class="hint">Это запись другого мастера — её можно только посмотреть.</div>`}
    ${canEdit && a.status !== 'cancelled' && !(a.paid > 0) && html`
      <div class="row" style="margin-bottom:10px">
        ${a.status === 'booked' && html`<button class="btn sm" onClick=${() => patch({ status: 'arrived' }, 'Отмечено: клиент пришёл')}>Пришёл</button>`}
        <button class="btn gold sm" onClick=${onPay}>Оплата</button>
        <button class="btn sm" onClick=${() => setMove(!move)}>Перенести</button>
        <button class="btn sm" onClick=${() => patch({ status: 'no_show' }, 'Отмечено: не пришёл')}>Не пришёл</button>
        <button class="btn danger sm" onClick=${() => setCancel(!cancel)}>Отменить</button>
      </div>
      ${move && html`<div class="card" style="margin-bottom:10px">
        <div class="grid2"><div class="field"><label>Дата</label><input class="input" type="date" value=${day} onInput=${(e) => setDay(e.target.value)}/></div>
        <div class="field"><label>Время</label><input class="input" type="time" step="900" value=${time} onInput=${(e) => setTime(e.target.value)}/></div></div>
        ${boot.me.role !== 'master' && html`<div class="field"><label>Мастер</label><select class="input" value=${staff} onChange=${(e) => setStaff(+e.target.value)}>${boot.staff.map((s) => html`<option value=${s.id}>${s.name}</option>`)}</select></div>`}
        <button class="btn primary sm" onClick=${() => patch({ start: `${day} ${time}`, staff_id: staff }, 'Запись перенесена')}>Сохранить перенос</button>
      </div>`}
      ${cancel && html`<div class="card" style="margin-bottom:10px">
        <div class="field"><label>Причина отмены</label><input class="input" value=${reason} onInput=${(e) => setReason(e.target.value)} placeholder="Например: клиент заболел"/></div>
        <button class="btn danger sm" onClick=${() => patch({ status: 'cancelled', cancel_reason: reason || 'Без причины' }, 'Запись отменена')}>Отменить запись</button>
      </div>`}`}
    ${a.client_id && html`<button class="btn" style="margin-top:6px" onClick=${() => openClient(a.client_id)}>Карточка клиента →</button>`}
    <p class="muted small" style="margin-top:18px">Любой перенос, отмена и оплата попадают в журнал действий: кто, когда, что было и что стало.</p>
  <//>`;
}

function NewAppt({ init, boot, onClose, onDone }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [client, setClient] = useState(null);
  const [newC, setNewC] = useState(false);
  const [nc, setNc] = useState({ name: '', phone: '' });
  const firstSvc = init.device_id ? boot.services.find((s) => s.device_id === init.device_id) : null;
  const [svc, setSvc] = useState(firstSvc ? firstSvc.id : '');
  const meMaster = boot.me.role === 'master';
  const [staff, setStaff] = useState(meMaster ? boot.me.id : (init.staff_id || boot.staff[1]?.id));
  const [day, setDay] = useState(init.start.slice(0, 10));
  const [time, setTime] = useState(init.start.slice(11));
  const [room, setRoom] = useState(init.room_id || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.length < 2) { setFound([]); return; } const t = setTimeout(() => api('/clients?q=' + encodeURIComponent(q)).then(setFound), 200); return () => clearTimeout(t); }, [q]);
  const cats = useMemo(() => { const g = {}; boot.services.forEach((s) => (g[s.category] = g[s.category] || []).push(s)); return g; }, []);
  const s = boot.services.find((x) => x.id === +svc);
  const dev = s && boot.devices.find((d) => d.id === s.device_id);
  const submit = async () => {
    setError(''); setBusy(true);
    try {
      await api('/appointments', { method: 'POST', body: { client_id: client?.id, new_client: newC ? nc : null, service_id: +svc, staff_id: +staff, start: `${day} ${time}`, room_id: room ? +room : null } });
      onDone(`${day} ${time}`);
    } catch (e) { setError(e.message); setBusy(false); }
  };
  return html`<${Drawer} title="Новая запись" onClose=${onClose}>
    <div class="section-title">Клиент</div>
    ${client ? html`<div class="row card" style="padding:10px 14px"><div class="grow"><b>${client.name}</b><div class="muted small">${client.phone} · визитов: ${client.visits}</div></div><button class="btn sm ghost" onClick=${() => setClient(null)}>Изменить</button></div>`
      : newC ? html`<div class="grid2"><div class="field"><label>Имя</label><input class="input" value=${nc.name} onInput=${(e) => setNc({ ...nc, name: e.target.value })}/></div>
          <div class="field"><label>Телефон</label><input class="input" type="tel" value=${nc.phone} placeholder="+372 …" onInput=${(e) => setNc({ ...nc, phone: e.target.value })}/></div></div>
          <button class="btn sm ghost" onClick=${() => setNewC(false)}>← Найти существующего</button>`
      : html`<div class="field"><input class="input" placeholder="Имя или первые цифры телефона" value=${q} onInput=${(e) => setQ(e.target.value)} autofocus/>
          ${found.length > 0 && html`<div class="suggest">${found.map((c) => html`<div onClick=${() => setClient(c)}><b>${c.name}</b> <span class="muted small">${c.phone} · визитов: ${c.visits}</span></div>`)}</div>`}</div>
          <button class="btn sm" onClick=${() => { setNewC(true); setNc({ name: /\d/.test(q) ? '' : q, phone: /\d/.test(q) ? q : '' }); }}>+ Новый клиент</button>`}
    <div class="section-title">Услуга</div>
    <div class="field"><select class="input" value=${svc} onChange=${(e) => setSvc(e.target.value)}>
      <option value="">— выберите —</option>
      ${Object.entries(cats).map(([c, list]) => html`<optgroup label=${c}>${list.map((x) => html`<option value=${x.id}>${x.name} · ${x.price_from ? 'от ' : ''}${x.price} € · ${x.duration} мин</option>`)}</optgroup>`)}
    </select></div>
    ${s && html`<div class="hint" style="margin-bottom:12px">${s.duration} мин · ${dev ? html`нужен аппарат <b>${dev.name}</b> — система проверит, что он свободен` : 'аппарат не нужен'}${s.bonus_type === 'pct_net' ? html` · процент мастера считается после вычета препарата` : ''}</div>`}
    <div class="grid2">
      <div class="field"><label>Дата</label><input class="input" type="date" value=${day} onInput=${(e) => setDay(e.target.value)}/></div>
      <div class="field"><label>Время</label><input class="input" type="time" step="900" value=${time} onInput=${(e) => setTime(e.target.value)}/></div>
      <div class="field"><label>Мастер</label><select class="input" value=${staff} disabled=${meMaster} onChange=${(e) => setStaff(e.target.value)}>${boot.staff.map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select></div>
      <div class="field"><label>Кабинет</label><select class="input" value=${room} onChange=${(e) => setRoom(e.target.value)}><option value="">Автоматически</option>${boot.rooms.map((r) => html`<option value=${r.id}>${r.name}</option>`)}</select></div>
    </div>
    ${error && html`<div class="error" style="margin-bottom:12px">⚠ ${error}</div>`}
    <button class="btn primary" style="width:100%" disabled=${busy || !svc || !(client || (newC && nc.name && nc.phone))} onClick=${submit}>Записать</button>
  <//>`;
}

function PayDrawer({ a, boot, onClose, onDone }) {
  const s = boot.services.find((x) => x.id === a.service_id);
  const [firm, setFirm] = useState(s.firm_id);
  const [parts, setParts] = useState([{ method: 'card', amount: s.price }]);
  const [drug, setDrug] = useState(s.drug_product_id ? (s.id === 18 ? 40 : s.id === 19 ? 1 : 2) : 0);
  const [taken, setTaken] = useState(false);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const total = parts.reduce((x, p) => x + (+p.amount || 0), 0);
  const cash = parts.filter((p) => p.method === 'cash').reduce((x, p) => x + (+p.amount || 0), 0);
  const drugP = s.drug_product_id && boot.products.find((p) => p.id === s.drug_product_id);
  useEffect(() => { const t = setTimeout(() => api(`/appointments/${a.id}/quote`, { method: 'POST', body: { amount: total, drug_qty: drug } }).then(setQuote).catch(() => {}), 150); return () => clearTimeout(t); }, [total, drug]);
  const set = (i, k, v) => setParts(parts.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const submit = async () => { setError(''); try { onDone(await api(`/appointments/${a.id}/pay`, { method: 'POST', body: { firm_id: +firm, parts, drug_qty: drug, cash_taken: taken } })); } catch (e) { setError(e.message); } };
  const staffName = boot.staff.find((x) => x.id === a.staff_id)?.name;
  return html`<${Drawer} title="Оплата" sub=${`${a.client_name} · ${s.name} · мастер ${staffName}`} onClose=${onClose}>
    <div class="field"><label>Фирма</label><select class="input" value=${firm} onChange=${(e) => setFirm(e.target.value)}>${boot.firms.map((f) => html`<option value=${f.id}>${f.name}</option>`)}</select></div>
    <div class="section-title">Способ оплаты</div>
    ${parts.map((p, i) => html`<div class="pay-part">
      <select class="input" value=${p.method} onChange=${(e) => set(i, 'method', e.target.value)}>${Object.entries(METHOD).map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select>
      <input class="input num" type="number" inputmode="decimal" step="0.01" value=${p.amount} onInput=${(e) => set(i, 'amount', e.target.value)}/>
      ${parts.length > 1 ? html`<button class="close" onClick=${() => setParts(parts.filter((_, j) => j !== i))} aria-label="Убрать">×</button>` : html`<span></span>`}
    </div>`)}
    <button class="btn sm ghost" onClick=${() => setParts([...parts, { method: 'stebby', amount: 0 }])}>+ Разделить оплату (например, часть Stebby)</button>
    ${drugP && html`<div class="section-title">Препарат</div>
      <div class="field"><label>${drugP.name}: использовано, ${drugP.unit} (себестоимость ${eur(drugP.cost)} за ${drugP.unit})</label>
      <input class="input num" type="number" inputmode="decimal" value=${drug} onInput=${(e) => setDrug(+e.target.value)}/></div>`}
    ${cash > 0 && html`<label class="check" style="margin:12px 0"><input type="checkbox" checked=${taken} onChange=${(e) => setTaken(e.target.checked)}/><span>Мастер сразу забирает свой процент из наличных<br/><span class="muted small">Сумма будет вычтена из зарплаты, чтобы не заплатить дважды</span></span></label>`}
    ${quote && html`<div class="preview">
      <div class="line"><span>Оплачено</span><b class="num">${eur(total)}</b></div>
      ${quote.cost > 0 && html`<div class="line"><span>Препарат (себестоимость)</span><span class="num">− ${eur(quote.cost)}</span></div>`}
      <div class="line"><span>Правило</span><span class="muted">${quote.rule}</span></div>
      <div class="line total"><span>Бонус мастера</span><span class="num">${eur(quote.bonus)}</span></div>
      ${taken && cash > 0 && html`<div class="line"><span>Забирает наличными сейчас</span><span class="num">${eur(Math.min(quote.bonus, cash))}</span></div>
        <div class="line"><span>Останется в кассе</span><span class="num">${eur(cash - Math.min(quote.bonus, cash))}</span></div>`}
    </div>`}
    ${error && html`<div class="error" style="margin-bottom:12px">${error}</div>`}
    <button class="btn primary" style="width:100%" disabled=${total <= 0} onClick=${submit}>Провести оплату ${eur(total)}</button>
    ${s.bonus_type === 'pct_net' && html`<p class="muted small" style="margin-top:12px">Для инъекций процент считается от суммы за вычетом препарата — так, как не умеет DIKIDI. Препарат автоматически списывается со склада.</p>`}
  <//>`;
}

// ---------- clients ----------
const ANAM = [['complaints', 'Жалобы / цель визита'], ['contraindications', 'Противопоказания'], ['allergies', 'Аллергии'], ['medications', 'Принимает препараты'], ['skin_type', 'Фототип кожи (I–VI)']];
function Clients({ boot, toast, openId }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(openId || null);
  useEffect(() => { const t = setTimeout(() => api('/clients?q=' + encodeURIComponent(q)).then(setList), 150); return () => clearTimeout(t); }, [q]);
  useEffect(() => { if (openId) setSel(openId); }, [openId]);
  return html`<div class=${'split' + (sel ? ' has-sel' : '')}>
    <div class="list"><div class="search"><input class="input" placeholder="Поиск: имя или телефон" value=${q} onInput=${(e) => setQ(e.target.value)}/></div>
      <div class="items">${list.map((c) => html`<div class=${'item' + (c.id === sel ? ' on' : '')} onClick=${() => setSel(c.id)}>
        <div><b>${c.name}</b><div class="muted small">${c.phone}</div></div><div class="muted small right">${c.visits} виз.<br/>${c.last_visit ? fmtShort(c.last_visit.slice(0, 10)) : ''}</div></div>`)}</div></div>
    <div>${sel ? html`<${ClientCard} id=${sel} boot=${boot} toast=${toast} onBack=${() => setSel(null)}/>` : html`<div class="card muted">Выберите клиента слева. У каждого клиента одна общая карточка: анамнез, заметки всех мастеров и вся история визитов.</div>`}</div>
  </div>`;
}
function ClientCard({ id, boot, toast, onBack }) {
  const [c, setC] = useState(null);
  const [anam, setAnam] = useState({});
  const [note, setNote] = useState('');
  const load = () => api('/clients/' + id).then((x) => { setC(x); setAnam(x.anamnesis || {}); });
  useEffect(() => { setC(null); load(); }, [id]);
  if (!c) return html`<div class="card muted">Загрузка…</div>`;
  const done = c.history.filter((h) => h.status === 'done');
  const spent = done.reduce((s, h) => s + h.paid, 0);
  const saveAnam = async () => { await api('/clients/' + id, { method: 'PATCH', body: { anamnesis: anam } }); toast('Анамнез сохранён'); };
  const consent = async (k, v) => { await api('/clients/' + id, { method: 'PATCH', body: { [k]: v ? 1 : 0 } }); load(); };
  const addNote = async () => { await api(`/clients/${id}/notes`, { method: 'POST', body: { text: note } }); setNote(''); load(); toast('Заметка добавлена'); };
  return html`<div>
    <button class="btn sm ghost tab-back" onClick=${onBack} style="margin-bottom:8px">← Все клиенты</button>
    <div class="card">
      <div class="row" style="align-items:flex-start"><div class="grow"><h2>${c.name}</h2><div class="muted" style="margin-top:4px">${c.phone}${c.email ? ' · ' + c.email : ''}${c.birthday ? ' · род. ' + c.birthday.split('-').reverse().join('.') : ''}</div></div>
        <div class="right"><div class="kpi">${eur0(spent)}</div><div class="muted small">${done.length} визитов</div></div></div>
      <div class="row" style="margin-top:14px;gap:18px">
        <label class="check"><input type="checkbox" checked=${!!c.consent_health} onChange=${(e) => consent('consent_health', e.target.checked)}/><span>Согласие на обработку данных о здоровье</span></label>
        <label class="check"><input type="checkbox" checked=${!!c.consent_marketing} onChange=${(e) => consent('consent_marketing', e.target.checked)}/><span>Согласие на рассылки</span></label>
      </div>
    </div>
    <div class="card"><h3>Анамнез</h3><p class="muted small" style="margin:4px 0 12px">Заполняется до первого приёма. Видят мастера, которым разрешила владелица; в боевой версии хранится зашифрованным.</p>
      <div class="anam">${ANAM.map(([k, l]) => html`<div class="field"><label>${l}</label><input class="input" value=${anam[k] || ''} onInput=${(e) => setAnam({ ...anam, [k]: e.target.value })}/></div>`)}</div>
      <button class="btn sm primary" onClick=${saveAnam}>Сохранить анамнез</button></div>
    <div class="card"><h3>Заметки мастеров</h3><p class="muted small" style="margin:4px 0 12px">Общие для всех мастеров — новый мастер сразу видит всю историю.</p>
      <div class="field"><textarea class="input" placeholder=${`Заметка от имени ${boot.me.name}…`} value=${note} onInput=${(e) => setNote(e.target.value)}></textarea></div>
      <button class="btn sm" disabled=${!note.trim()} onClick=${addNote} style="margin-bottom:16px">Добавить заметку</button>
      ${c.notes.length === 0 && html`<p class="muted">Заметок пока нет.</p>`}
      ${c.notes.map((n) => html`<div class="note" style=${'--c:' + n.color}><div class="meta"><b style=${'color:' + n.color}>${n.author}</b> · ${fmtShort(n.created_at)}</div>${n.text}</div>`)}
    </div>
    <div class="card"><h3>История визитов</h3>
      <div class="tablewrap"><table class="t" style="margin-top:8px"><thead><tr><th>Дата</th><th>Услуга</th><th>Мастер</th><th>Статус</th><th class="right">Оплачено</th></tr></thead>
      <tbody>${c.history.map((h) => html`<tr><td class="num">${fmtShort(h.start)}</td><td>${h.service_name}</td><td>${h.staff_name}</td><td><${Status} s=${h.status}/></td><td class="right num">${h.paid ? eur(h.paid) : '—'}</td></tr>`)}</tbody></table></div>
    </div>
  </div>`;
}

// ---------- stock ----------
function Stock({ boot, toast }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('stock');
  const [move, setMove] = useState(null);
  const load = () => api('/stock').then(setData);
  useEffect(() => { load(); }, []);
  if (!data) return html`<div class="muted">Загрузка…</div>`;
  const low = data.products.filter((p) => p.stock < p.min_stock);
  const KIND = { retail: 'Товар на продажу', consumable: 'Расходник', drug: 'Препарат' };
  const TYPE = { receipt: ['Приход', 'ok'], consumption: ['Списано по процедуре', ''], writeoff: ['Списание', 'bad'], sale: ['Продажа', 'ok'], inventory: ['Инвентаризация', 'warn'] };
  const value = data.products.reduce((s, p) => s + p.stock * p.cost, 0);
  return html`<div>
    <div class="cards" style="margin-bottom:16px">
      <div class="card"><div class="muted small">Склад по себестоимости</div><div class="kpi">${eur0(value)}</div></div>
      <div class="card"><div class="muted small">Ниже минимума</div><div class="kpi" style=${low.length ? 'color:var(--warn)' : ''}>${low.length}</div><div class="muted small">${low.map((p) => p.name).join(', ') || 'всё в порядке'}</div></div>
    </div>
    <div class="row" style="margin-bottom:12px"><div class="seg">${[['stock', 'Остатки'], ['moves', 'Движения'], ['cost', 'Себестоимость процедур']].map(([k, l]) => html`<button class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${l}</button>`)}</div>
      <span class="grow"></span><button class="btn primary sm" onClick=${() => setMove({ type: 'receipt' })}>+ Приход товара</button></div>
    ${tab === 'stock' && html`<div class="card tablewrap"><table class="t"><thead><tr><th>Наименование</th><th>Тип</th><th>Фирма</th><th class="right">Остаток</th><th class="right">Минимум</th><th class="right">Цена закупки</th><th></th></tr></thead>
      <tbody>${data.products.map((p) => html`<tr><td><b>${p.name}</b>${p.price ? html`<div class="muted small">продажа ${eur(p.price)}</div>` : ''}</td><td class="muted">${KIND[p.kind]}</td><td class="muted">${p.firm_name}</td>
        <td class="right num">${p.stock < p.min_stock ? html`<span class="badge warn">${+p.stock.toFixed(1)} ${p.unit}</span>` : html`${+p.stock.toFixed(1)} ${p.unit}`}</td><td class="right num muted">${p.min_stock} ${p.unit}</td><td class="right num">${eur(p.cost)}</td>
        <td class="right"><div class="row" style="justify-content:flex-end;flex-wrap:nowrap"><button class="btn sm" onClick=${() => setMove({ type: 'receipt', product_id: p.id })}>Приход</button><button class="btn sm" onClick=${() => setMove({ type: 'writeoff', product_id: p.id })}>Списать</button><button class="btn sm" onClick=${() => setMove({ type: 'inventory', product_id: p.id })}>Пересчёт</button></div></td></tr>`)}</tbody></table></div>`}
    ${tab === 'moves' && html`<div class="card tablewrap"><table class="t"><thead><tr><th>Когда</th><th>Товар</th><th>Операция</th><th class="right">Количество</th><th>Кто</th><th>Комментарий</th></tr></thead>
      <tbody>${data.moves.map((m) => html`<tr><td class="num">${fmtShort(m.created_at)}</td><td>${m.product_name}</td><td><span class=${'badge ' + TYPE[m.type][1]}>${TYPE[m.type][0]}</span></td><td class="right num">${m.qty > 0 ? '+' : ''}${+m.qty.toFixed(1)} ${m.unit}</td><td>${m.staff_name || '—'}</td><td class="muted">${m.comment || ''}</td></tr>`)}</tbody></table></div>`}
    ${tab === 'cost' && html`<div class="card tablewrap"><p class="muted small" style="margin-top:0">Сколько в среднем уходит расходников и препаратов на одну процедуру — по нормам и фактическим вводам мастеров.</p><table class="t"><thead><tr><th>Процедура</th><th class="right">Сделано</th><th class="right">Средняя цена</th><th class="right">Себестоимость</th><th class="right">Доля</th></tr></thead>
      <tbody>${data.usage.map((u) => html`<tr><td>${u.name}</td><td class="right num">${u.n}</td><td class="right num">${eur(u.avg_price)}</td><td class="right num">${eur(u.avg_cost)}</td><td class="right num">${Math.round(u.avg_cost / u.avg_price * 100)} %</td></tr>`)}</tbody></table></div>`}
    ${move && html`<${MoveDrawer} init=${move} products=${data.products} onClose=${() => setMove(null)} onDone=${(msg) => { setMove(null); load(); toast(msg); }}/>`}
  </div>`;
}
function MoveDrawer({ init, products, onClose, onDone }) {
  const [type, setType] = useState(init.type);
  const [pid, setPid] = useState(init.product_id || products[0].id);
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const p = products.find((x) => x.id === +pid);
  const title = { receipt: 'Приход товара', writeoff: 'Списание', inventory: 'Пересчёт остатка' }[type];
  const submit = async () => { setError(''); try { await api('/stock/move', { method: 'POST', body: { type, product_id: +pid, qty: +qty, price: +price || null, comment } }); onDone(title + ' сохранён'); } catch (e) { setError(e.message); } };
  return html`<${Drawer} title=${title} onClose=${onClose}>
    <div class="seg" style="margin-bottom:14px">${[['receipt', 'Приход'], ['writeoff', 'Списание'], ['inventory', 'Пересчёт']].map(([k, l]) => html`<button class=${type === k ? 'on' : ''} onClick=${() => setType(k)}>${l}</button>`)}</div>
    <div class="field"><label>Товар</label><select class="input" value=${pid} onChange=${(e) => setPid(e.target.value)}>${products.map((x) => html`<option value=${x.id}>${x.name} (остаток ${+x.stock.toFixed(1)} ${x.unit})</option>`)}</select></div>
    <div class="grid2"><div class="field"><label>${type === 'inventory' ? 'Фактически на складе' : 'Количество'}, ${p.unit}</label><input class="input num" type="number" inputmode="decimal" value=${qty} onInput=${(e) => setQty(e.target.value)}/></div>
    ${type === 'receipt' && html`<div class="field"><label>Цена закупки за ${p.unit}</label><input class="input num" type="number" inputmode="decimal" placeholder=${p.cost} value=${price} onInput=${(e) => setPrice(e.target.value)}/></div>`}</div>
    <div class="field"><label>Комментарий</label><input class="input" value=${comment} onInput=${(e) => setComment(e.target.value)} placeholder=${type === 'writeoff' ? 'Брак, пробник, личное использование…' : 'Поставщик, накладная…'}/></div>
    ${type === 'inventory' && qty !== '' && html`<div class="hint" style="margin-bottom:12px">Расхождение: <b>${+(qty - p.stock).toFixed(1)} ${p.unit}</b> — будет записано в журнал.</div>`}
    ${error && html`<div class="error" style="margin-bottom:12px">${error}</div>`}
    <button class="btn primary" style="width:100%" disabled=${qty === ''} onClick=${submit}>Сохранить</button>
  <//>`;
}

// ---------- finance ----------
function MonthNav({ month, setMonth }) {
  return html`<div class="row"><button class="btn sm" onClick=${() => setMonth(addMonths(month, -1))}>‹</button><b style="min-width:140px;text-align:center">${fmtMonth(month)}</b><button class="btn sm" onClick=${() => setMonth(addMonths(month, 1))}>›</button></div>`;
}
const diffBadge = (exp, got) => got == null ? html`<span class="badge bad">не поступило</span>` : Math.abs(got - exp) < 0.01 ? html`<span class="badge ok">сходится</span>` : html`<span class="badge bad">${got - exp > 0 ? '+' : '−'}${eur(Math.abs(got - exp))}</span>`;
function Finance({ boot }) {
  const [month, setMonth] = useState(boot.today.slice(0, 7));
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('card');
  useEffect(() => { setD(null); api('/finance?month=' + month).then(setD); }, [month]);
  if (!d) return html`<${MonthNav} month=${month} setMonth=${setMonth}/><p class="muted">Загрузка…</p>`;
  const firm = (id) => boot.firms.find((f) => f.id === id)?.name;
  const tot = (k) => d.byFirm.reduce((s, f) => s + f[k], 0);
  const issues = {
    card: d.cardRec.filter((c) => c.received != null && Math.abs(c.received - c.expected) > 0.01).length,
    transfer: d.transferRec.filter((c) => c.received == null).length,
    stebby: d.stebbyRec.filter((c) => Math.abs(c.received - c.expected) > 0.01).length,
    cash: d.cashRec.filter((c) => c.counted != null && Math.abs(c.counted - c.expected) > 0.01).length,
  };
  const COLORS = { cash: '#B48F5A', card: '#1E3A32', transfer: '#5C86B0', stebby: '#9A5A50' };
  return html`<div>
    <div class="row" style="margin-bottom:16px"><${MonthNav} month=${month} setMonth=${setMonth}/><span class="grow"></span>
      <span class="muted small">Итого по трём фирмам: выручка <b>${eur0(tot('revenue'))}</b>, прибыль <b>${eur0(tot('profit'))}</b></span></div>
    <div class="cards">${d.byFirm.map((f) => { const sum = Object.values(f.methods).reduce((a, b) => a + b, 0) || 1; return html`<div class="card firm-card">
      <h3>${f.name}</h3>
      <div class="bar">${Object.entries(f.methods).map(([k, v]) => v > 0 && html`<i style=${`width:${v / sum * 100}%;background:${COLORS[k]}`} title=${METHOD[k]}></i>`)}</div>
      <div class="row small muted" style="gap:4px 12px;margin-bottom:10px">${Object.entries(f.methods).filter(([, v]) => v > 0).map(([k, v]) => html`<span><i class="dot" style=${'background:' + COLORS[k]}></i> ${METHOD[k]} ${eur0(v)}</span>`)}</div>
      <div class="line"><span>Выручка (начислено)</span><span class="num">${eur(f.revenue)}</span></div>
      <div class="line"><span>Фактически поступило</span><span class="num">${eur(f.received)}</span></div>
      <div class="line muted"><span>− Себестоимость</span><span class="num">${eur(f.cost)}</span></div>
      <div class="line muted"><span>− Зарплаты мастеров</span><span class="num">${eur(f.salaries)}</span></div>
      <div class="line muted"><span>− Расходы</span><span class="num">${eur(f.expenses)}</span></div>
      <div class="line total"><span>Прибыль</span><span class="num" style=${f.profit < 0 ? 'color:var(--bad)' : ''}>${eur(f.profit)}</span></div>
    </div>`; })}</div>
    <div class="card" style="margin-top:16px"><div class="row" style="margin-bottom:6px"><h3 class="grow">Сверка денег</h3>
      <div class="seg">${[['card', 'Карта'], ['transfer', 'Переводы'], ['stebby', 'Stebby'], ['cash', 'Наличные']].map(([k, l]) => html`<button class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${l}${issues[k] ? html` <span class="badge bad">${issues[k]}</span>` : ''}</button>`)}</div></div>
      <p class="muted small" style="margin:0 0 10px">${{ card: 'Оплаты картой за день сравниваются с поступлением от терминала по банковской выписке (обычно на следующий рабочий день).', transfer: 'Каждый перевод, отмеченный мастером, ищется в выписке по сумме и дате.', stebby: 'Еженедельная выплата Stebby сравнивается с оплатами Stebby за прошлую неделю.', cash: 'Наличные в кассе на конец дня = получено наличными − процент, который мастера забрали сразу.' }[tab]}</p>
      <div class="tablewrap">
      ${tab === 'card' && html`<table class="t"><thead><tr><th>День</th><th>Фирма</th><th class="right">Отмечено картой</th><th class="right">Пришло в банк</th><th>Сверка</th></tr></thead><tbody>${d.cardRec.map((c) => html`<tr><td class="num">${fmtShort(c.date)}</td><td>${firm(c.firm_id)}</td><td class="right num">${eur(c.expected)}</td><td class="right num">${c.received != null ? eur(c.received) : html`<span class="muted">ожидается</span>`}</td><td>${c.received != null ? diffBadge(c.expected, c.received) : html`<span class="badge">в пути</span>`}</td></tr>`)}</tbody></table>`}
      ${tab === 'transfer' && html`<table class="t"><thead><tr><th>День</th><th>Фирма</th><th>Клиент</th><th class="right">Сумма</th><th>В выписке</th></tr></thead><tbody>${d.transferRec.map((c) => html`<tr><td class="num">${fmtShort(c.date)}</td><td>${firm(c.firm_id)}</td><td>${c.client_name}</td><td class="right num">${eur(c.expected)}</td><td>${diffBadge(c.expected, c.received)}</td></tr>`)}</tbody></table>`}
      ${tab === 'stebby' && html`<table class="t"><thead><tr><th>Выплата</th><th>За период</th><th class="right">Отмечено Stebby</th><th class="right">Выплатил Stebby</th><th>Сверка</th></tr></thead><tbody>${d.stebbyRec.map((c) => html`<tr><td class="num">${fmtShort(c.date)}</td><td class="muted">${c.period.split(' – ').map(fmtShort).join(' – ')}</td><td class="right num">${eur(c.expected)}</td><td class="right num">${eur(c.received)}</td><td>${diffBadge(c.expected, c.received)}</td></tr>`)}</tbody></table>`}
      ${tab === 'cash' && html`<table class="t"><thead><tr><th>День</th><th>Фирма</th><th class="right">Наличными</th><th class="right">Забрали мастера</th><th class="right">Должно быть</th><th class="right">Пересчитано</th><th>Сверка</th></tr></thead><tbody>${d.cashRec.map((c) => html`<tr><td class="num">${fmtShort(c.date)}</td><td>${firm(c.firm_id)}</td><td class="right num">${eur(c.cash_in)}</td><td class="right num">${eur(c.taken)}</td><td class="right num">${eur(c.expected)}</td><td class="right num">${c.counted != null ? eur(c.counted) : '—'}</td><td>${c.counted != null ? diffBadge(c.expected, c.counted) : html`<span class="badge">не закрыт</span>`}</td></tr>`)}</tbody></table>`}
      </div></div>
    <div class="card"><h3>Расходы</h3><div class="tablewrap"><table class="t" style="margin-top:8px"><thead><tr><th>Дата</th><th>Фирма</th><th>Категория</th><th>Комментарий</th><th class="right">Сумма</th></tr></thead>
      <tbody>${d.expenses.map((e) => html`<tr><td class="num">${fmtShort(e.date)}</td><td>${firm(e.firm_id)}</td><td>${e.category}</td><td class="muted">${e.comment}</td><td class="right num">${eur(e.amount)}</td></tr>`)}</tbody>
      <tfoot><tr><td colspan="4">Итого</td><td class="right num">${eur(d.expenses.reduce((s, e) => s + e.amount, 0))}</td></tr></tfoot></table></div></div>
  </div>`;
}

// ---------- salaries ----------
function Salaries({ boot }) {
  const owner = boot.me.role === 'owner';
  const [month, setMonth] = useState(boot.today.slice(0, 7));
  const [staff, setStaff] = useState(owner ? 0 : boot.me.id);
  const [d, setD] = useState(null);
  useEffect(() => { api(`/salaries?month=${month}&staff=${staff}`).then(setD); }, [month, staff]);
  if (!d) return html`<p class="muted">Загрузка…</p>`;
  const sum = (k) => d.rows.reduce((s, r) => s + r[k], 0);
  const who = boot.staff.find((s) => s.id === d.detail_staff);
  return html`<div>
    <div class="row" style="margin-bottom:16px"><${MonthNav} month=${month} setMonth=${setMonth}/><span class="grow"></span>
      ${!owner && html`<span class="badge">Вы видите только свою зарплату</span>`}</div>
    <div class="card tablewrap"><table class="t"><thead><tr><th>Мастер</th><th class="right">Процедур</th><th class="right">Выручка</th><th class="right">Бонус</th><th class="right">Забрано наличными</th><th class="right">К выплате</th></tr></thead>
      <tbody>${d.rows.map((r) => html`<tr class=${'click' + (r.id === d.detail_staff ? ' sel' : '')} onClick=${() => owner && setStaff(r.id === staff ? 0 : r.id)}>
        <td><div class="row" style="gap:8px;flex-wrap:nowrap"><${Avatar} name=${r.name} color=${r.color} size=${26}/><div><b>${r.name}</b><div class="muted small">${r.title} · по умолчанию ${r.pct} %</div></div></div></td>
        <td class="right num">${r.procedures}</td><td class="right num">${eur(r.revenue)}</td><td class="right num">${eur(r.bonus)}</td><td class="right num">${r.cash_taken ? '− ' + eur(r.cash_taken) : '—'}</td><td class="right num"><b>${eur(r.to_pay)}</b></td></tr>`)}</tbody>
      ${owner && html`<tfoot><tr><td>Итого</td><td class="right num">${sum('procedures')}</td><td class="right num">${eur(sum('revenue'))}</td><td class="right num">${eur(sum('bonus'))}</td><td class="right num">− ${eur(sum('cash_taken'))}</td><td class="right num">${eur(sum('to_pay'))}</td></tr></tfoot>`}
    </table></div>
    <p class="muted small" style="margin:10px 0 0">К выплате = бонусы − то, что мастер уже забрал наличными при оплате. ${owner ? 'Нажмите на мастера, чтобы увидеть все его продажи.' : ''}</p>
    ${who && html`<div class="card" style="margin-top:16px"><h3>${who.name}: продажи за ${fmtMonth(month).toLowerCase()}</h3><div class="tablewrap"><table class="t" style="margin-top:8px"><thead><tr><th>Дата</th><th>Услуга / товар</th><th>Клиент</th><th>Оплата</th><th class="right">Сумма</th><th class="right">Себест.</th><th class="right">Бонус</th><th class="right">Забрано</th></tr></thead>
      <tbody>${d.detail.map((x) => html`<tr><td class="num">${fmtShort(x.date)}</td><td>${x.item}${x.item_type === 'product' ? html` <span class="badge">товар</span>` : ''}</td><td>${x.client_name}</td><td class="muted">${(x.methods || '').split(',').map((m) => METHOD[m]).join(' + ')}</td><td class="right num">${eur(x.amount)}</td><td class="right num muted">${x.cost ? eur(x.cost) : '—'}</td><td class="right num">${eur(x.bonus)}</td><td class="right num">${x.cash_taken ? eur(x.cash_taken) : '—'}</td></tr>`)}</tbody></table></div></div>`}
  </div>`;
}

// ---------- audit ----------
function Audit() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { api('/audit').then(setRows); }, []);
  if (!rows) return html`<p class="muted">Загрузка…</p>`;
  const f = rows.filter((r) => !q || `${r.staff_name} ${r.action} ${r.object} ${r.before} ${r.after}`.toLowerCase().includes(q.toLowerCase()));
  return html`<div>
    <div class="row" style="margin-bottom:12px"><input class="input" style="max-width:360px" placeholder="Фильтр: мастер, действие, клиент…" value=${q} onInput=${(e) => setQ(e.target.value)}/><span class="muted small">Журнал нельзя изменить или удалить. Его видит только владелица.</span></div>
    <div class="card tablewrap"><table class="t"><thead><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Что</th><th>Было</th><th>Стало</th></tr></thead>
      <tbody>${f.map((r) => html`<tr><td class="num">${fmtShort(r.at)}</td><td>${r.staff_name}</td><td><b>${r.action}</b></td><td>${r.object}</td><td class="muted">${r.before || ''}</td><td>${r.after || ''}</td></tr>`)}</tbody></table></div>
  </div>`;
}

// ---------- app ----------
function App() {
  const [boot, setBoot] = useState(null);
  const [needLogin, setNeedLogin] = useState(!token);
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('soprano_tab') || 'cal'; } catch (e) { return 'cal'; } });
  const [toastText, setToastText] = useState('');
  const [clientId, setClientId] = useState(null);
  const toast = useCallback((t) => { setToastText(t); setTimeout(() => setToastText(''), 2600); }, []);
  const loadBoot = () => api('/bootstrap').then(setBoot).catch(() => setNeedLogin(true));
  useEffect(() => { if (!needLogin) loadBoot(); }, [needLogin]);
  useEffect(() => { try { sessionStorage.setItem('soprano_tab', tab); } catch (e) { /* ignore */ } }, [tab]);
  if (needLogin) return html`<${Login} onIn=${() => setNeedLogin(false)}/>`;
  if (!boot) return html`<div class="boot">Загрузка…</div>`;
  const owner = boot.me.role === 'owner';
  const tabs = [['cal', 'Календарь', I.cal], ['clients', 'Клиенты', I.users], ['stock', 'Склад', I.box], ['salary', 'Зарплаты', I.wallet], ...(owner ? [['finance', 'Финансы', I.money], ['audit', 'Журнал', I.log]] : [])];
  const cur = tabs.find((t) => t[0] === tab) ? tab : 'cal';
  const openClient = (id) => { setClientId(id); setTab('clients'); };
  const logout = () => { setToken(null); setBoot(null); setNeedLogin(true); };
  const reset = async () => { if (!confirm('Вернуть демо-данные к исходным? Все ваши изменения в демо пропадут.')) return; await api('/reset', { method: 'POST' }); location.reload(); };
  return html`<div class="shell">
    <aside class="side"><div class="brand"><span>Soprano Studio</span><b>Система учёта</b></div>
      <nav class="nav">${tabs.map(([k, l, ic]) => html`<button class=${cur === k ? 'on' : ''} onClick=${() => setTab(k)}>${ic}${l}</button>`)}</nav>
      <div class="me"><div class="who"><${Avatar} name=${boot.me.name} color=${owner ? 'var(--gold)' : boot.me.color}/><div><b>${boot.me.name}</b><div style="opacity:.7;font-size:12px">${boot.me.title}</div></div></div>
        <div class="row"><button class="btn sm" onClick=${logout}>Выйти</button>${owner && html`<button class="btn sm" onClick=${reset}>Сбросить демо</button>`}</div></div>
    </aside>
    <main class="main">
      <div class="top"><h1>${tabs.find((t) => t[0] === cur)[1]}</h1><span class="demo-badge">демо</span>
        <span class="row only-mobile" style="gap:6px"><${Avatar} name=${boot.me.name} color=${owner ? 'var(--gold)' : boot.me.color} size=${28}/><button class="btn sm ghost" onClick=${logout}>Выйти</button></span></div>
      <div class="content">
        ${cur === 'cal' && html`<${Calendar} boot=${boot} toast=${toast} openClient=${openClient}/>`}
        ${cur === 'clients' && html`<${Clients} boot=${boot} toast=${toast} openId=${clientId}/>`}
        ${cur === 'stock' && html`<${Stock} boot=${boot} toast=${toast}/>`}
        ${cur === 'salary' && html`<${Salaries} boot=${boot}/>`}
        ${cur === 'finance' && html`<${Finance} boot=${boot}/>`}
        ${cur === 'audit' && html`<${Audit}/>`}
      </div>
    </main>
    <nav class="tabbar">${tabs.map(([k, l, ic]) => html`<button class=${cur === k ? 'on' : ''} onClick=${() => setTab(k)}>${ic}<span>${l}</span></button>`)}</nav>
    <${Toast} text=${toastText}/>
  </div>`;
}

render(html`<${App}/>`, document.getElementById('app'));
