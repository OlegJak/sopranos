// Demo API for the Soprano Studio admin prototype (Cloudflare Pages Functions + D1).
// All data is fictional and can be reset from the UI.

const TZ = 'Europe/Tallinn';

// ---------- helpers ----------
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const err = (message, status = 400) => json({ error: message }, status);
const round2 = (n) => Math.round(n * 100) / 100;

function nowLocal() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  const hh = p.hour === '24' ? '00' : p.hour;
  return `${p.year}-${p.month}-${p.day} ${hh}:${p.minute}`;
}
const today = () => nowLocal().slice(0, 10);
function addDays(date, n) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const weekday = (date) => new Date(date + 'T12:00:00Z').getUTCDay(); // 0 = Sunday
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
function addMinutes(dt, minutes) {
  const [d, t] = dt.split(' ');
  return `${d} ${fromMin(toMin(t) + minutes)}`;
}

// deterministic PRNG so the demo looks the same after every reset
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ---------- schema ----------
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS firms (id INTEGER PRIMARY KEY, name TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rooms (id INTEGER PRIMARY KEY, name TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS devices (id INTEGER PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, room_id INTEGER)`,
  `CREATE TABLE IF NOT EXISTS staff (id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, title TEXT, pin TEXT NOT NULL, color TEXT, pct REAL NOT NULL DEFAULT 40, active INTEGER NOT NULL DEFAULT 1)`,
  `CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, staff_id INTEGER NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS services (id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, duration INTEGER NOT NULL, price REAL NOT NULL, price_from INTEGER NOT NULL DEFAULT 0, device_id INTEGER, firm_id INTEGER NOT NULL, bonus_type TEXT NOT NULL DEFAULT 'pct', bonus_value REAL, drug_product_id INTEGER)`,
  `CREATE TABLE IF NOT EXISTS bonus_overrides (staff_id INTEGER NOT NULL, service_id INTEGER NOT NULL, bonus_type TEXT NOT NULL, bonus_value REAL NOT NULL, PRIMARY KEY (staff_id, service_id))`,
  `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, unit TEXT NOT NULL, firm_id INTEGER NOT NULL, cost REAL NOT NULL, price REAL, stock REAL NOT NULL, min_stock REAL NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS service_consumables (service_id INTEGER NOT NULL, product_id INTEGER NOT NULL, qty REAL NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS clients (id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, birthday TEXT, anamnesis TEXT, consent_health INTEGER NOT NULL DEFAULT 0, consent_marketing INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL, staff_id INTEGER NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS appointments (id INTEGER PRIMARY KEY, client_id INTEGER, staff_id INTEGER NOT NULL, service_id INTEGER, title TEXT, room_id INTEGER, device_id INTEGER, start TEXT NOT NULL, end TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'booked', note TEXT, cancel_reason TEXT, created_by INTEGER, created_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS appt_start ON appointments(start)`,
  `CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY, appointment_id INTEGER, staff_id INTEGER NOT NULL, client_id INTEGER, firm_id INTEGER NOT NULL, date TEXT NOT NULL, item_type TEXT NOT NULL, item_id INTEGER NOT NULL, qty REAL NOT NULL DEFAULT 1, amount REAL NOT NULL, cost REAL NOT NULL DEFAULT 0, bonus REAL NOT NULL DEFAULT 0, cash_taken REAL NOT NULL DEFAULT 0, cancelled INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY, appointment_id INTEGER, firm_id INTEGER NOT NULL, method TEXT NOT NULL, amount REAL NOT NULL, date TEXT NOT NULL, staff_id INTEGER)`,
  `CREATE TABLE IF NOT EXISTS stock_moves (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, type TEXT NOT NULL, qty REAL NOT NULL, price REAL, comment TEXT, staff_id INTEGER, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY, firm_id INTEGER NOT NULL, date TEXT NOT NULL, category TEXT NOT NULL, amount REAL NOT NULL, comment TEXT)`,
  `CREATE TABLE IF NOT EXISTS bank_tx (id INTEGER PRIMARY KEY, firm_id INTEGER NOT NULL, date TEXT NOT NULL, kind TEXT NOT NULL, amount REAL NOT NULL, payer TEXT, descr TEXT)`,
  `CREATE TABLE IF NOT EXISTS cash_counts (firm_id INTEGER NOT NULL, date TEXT NOT NULL, counted REAL NOT NULL, staff_id INTEGER, PRIMARY KEY (firm_id, date))`,
  `CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, at TEXT NOT NULL, staff_id INTEGER, action TEXT NOT NULL, object TEXT, before TEXT, after TEXT)`,
];
const TABLES = ['firms', 'rooms', 'devices', 'staff', 'sessions', 'services', 'bonus_overrides', 'products', 'service_consumables', 'clients', 'notes', 'appointments', 'sales', 'payments', 'stock_moves', 'expenses', 'bank_tx', 'cash_counts', 'audit'];

// ---------- seed data (fictional) ----------
const FIRMS = [[1, 'SOPRANOS OÜ'], [2, 'Фирма 2'], [3, 'Фирма 3']];
const ROOMS = [[1, 'Кабинет 1'], [2, 'Кабинет 2']];
const DEVICES = [
  [1, 'Лазер', '#C9776B', 1], [2, 'IPL', '#D8A657', 1], [3, 'Endospheres', '#6E9C8B', 2],
  [4, 'RF', '#8C7BB8', 2], [5, 'SMAS', '#5C86B0', 2], [6, 'Электроэпилятор', '#B07A9E', 2], [7, 'Dr.Pen', '#7FA35B', 2],
];
const STAFF = [
  // id, name, role, title, pin, color, default %
  [1, 'Лидия', 'owner', 'Владелица, косметолог', '1111', '#1E3A32', 40],
  [2, 'Анна', 'master', 'Косметолог', '2222', '#9A5A50', 40],
  [3, 'Мария', 'master', 'Косметолог', '3333', '#B48F5A', 40],
  [4, 'Ольга', 'master', 'Косметолог', '4444', '#5C86B0', 40],
  [5, 'Катрин', 'master', 'Специалист по массажу', '5555', '#6E9C8B', 35],
];
// products: id, name, kind, unit, firm, cost, price, stock, min
const PRODUCTS = [
  [1, 'Гель для лазера', 'consumable', 'мл', 1, 0.02, null, 1800, 1000],
  [2, 'Гель для IPL', 'consumable', 'мл', 1, 0.03, null, 650, 500],
  [3, 'Картридж Dr.Pen', 'consumable', 'шт', 1, 4.5, null, 6, 10],
  [4, 'Ботулотоксин', 'drug', 'ед.', 2, 2.6, null, 300, 100],
  [5, 'Мезококтейль', 'drug', 'фл.', 2, 18, null, 14, 5],
  [6, 'Пробирка PRP', 'drug', 'шт', 2, 12, null, 22, 10],
  [7, 'Крем SPF 50', 'retail', 'шт', 1, 14, 32, 9, 4],
  [8, 'Сыворотка с гиалуроновой кислотой', 'retail', 'шт', 1, 19, 45, 3, 4],
  [9, 'Масло для массажа', 'consumable', 'мл', 3, 0.03, null, 2400, 1000],
  [10, 'Пенка для умывания', 'retail', 'шт', 1, 9, 24, 12, 5],
];
// services: id, name, category, duration, price, from, device, firm, bonus_type, bonus_value(null = staff default), drug product
const SERVICES = [
  [1, 'ЛЭ Подмышки', 'Лазерная эпиляция', 10, 40, 0, 1, 1, 'pct', null, null],
  [2, 'ЛЭ Верхняя губа', 'Лазерная эпиляция', 10, 20, 0, 1, 1, 'pct', null, null],
  [3, 'ЛЭ Бикини классика', 'Лазерная эпиляция', 20, 50, 0, 1, 1, 'pct', null, null],
  [4, 'ЛЭ Бикини глубокое', 'Лазерная эпиляция', 20, 70, 0, 1, 1, 'pct', null, null],
  [5, 'ЛЭ Голени', 'Лазерная эпиляция', 30, 50, 0, 1, 1, 'pct', null, null],
  [6, 'ЛЭ Ноги полностью', 'Лазерная эпиляция', 45, 100, 0, 1, 1, 'pct', null, null],
  [7, 'ЛЭ Под + Бик', 'Лазерная эпиляция', 30, 100, 0, 1, 1, 'pct', null, null],
  [8, 'ЛЭ Под + Гол + Бик', 'Лазерная эпиляция', 60, 145, 0, 1, 1, 'pct', null, null],
  [9, 'ЛЭ Под + Ноги + Бик', 'Лазерная эпиляция', 70, 195, 0, 1, 1, 'pct', null, null],
  [10, 'IPL', 'Аппаратная косметология', 60, 80, 0, 2, 1, 'pct', null, null],
  [11, 'RF', 'Аппаратная косметология', 60, 150, 0, 4, 1, 'pct', null, null],
  [12, 'Smas Lifting', 'Аппаратная косметология', 60, 250, 1, 5, 1, 'pct', null, null],
  [13, 'Dr.Pen', 'Аппаратная косметология', 60, 70, 0, 7, 1, 'pct', null, null],
  [14, 'Электро ЭП 30 мин', 'Электроэпиляция', 30, 40, 0, 6, 1, 'pct', null, null],
  [15, 'ENDOSPHERES 45 мин', 'Endospheres', 45, 50, 0, 3, 3, 'pct', null, null],
  [16, 'ENDOSPHERES 60 мин', 'Endospheres', 60, 70, 0, 3, 3, 'pct', null, null],
  [17, 'ENDOSPHERES Face', 'Endospheres', 40, 50, 0, 3, 3, 'pct', null, null],
  [18, 'Botox', 'Инъекции', 60, 200, 0, null, 2, 'pct_net', 30, 4],
  [19, 'Meso', 'Инъекции', 60, 90, 0, null, 2, 'pct_net', 30, 5],
  [20, 'Plasma', 'Инъекции', 60, 150, 0, null, 2, 'pct_net', 30, 6],
  [21, 'Face massaaž', 'Уход и массаж', 60, 35, 0, null, 3, 'pct', null, null],
  [22, 'Уход База', 'Уход и массаж', 60, 60, 0, null, 1, 'pct', null, null],
  [23, 'Карбокси', 'Уход и массаж', 60, 70, 0, null, 1, 'pct', null, null],
];
// default drug usage per injection service (units) for seeded visits
const DRUG_USE = { 18: 40, 19: 1, 20: 2 };
const CONSUMABLES = [
  [1, 1, 10], [2, 1, 8], [3, 1, 15], [4, 1, 20], [5, 1, 25], [6, 1, 40], [7, 1, 25], [8, 1, 45], [9, 1, 60],
  [10, 2, 20], [13, 3, 1], [21, 9, 20],
];
const NAMES_RU = [['Тамара', 'Елена', 'Светлана', 'Ирина', 'Наталья', 'Ольга', 'Юлия', 'Татьяна', 'Галина', 'Виктория', 'Анастасия', 'Алина', 'Евгения', 'Дарья', 'Екатерина', 'Ксения', 'Марина', 'Оксана', 'Инна', 'Полина'],
  ['Иванова', 'Смирнова', 'Петрова', 'Кузнецова', 'Попова', 'Волкова', 'Соколова', 'Морозова', 'Павлова', 'Орлова', 'Лебедева', 'Козлова', 'Новикова', 'Фёдорова', 'Михайлова']];
const NAMES_ET = [['Kadri', 'Liis', 'Maarja', 'Anu', 'Kristiina', 'Triin', 'Kätlin', 'Merike', 'Laura', 'Helen', 'Kerli', 'Piret', 'Tiina', 'Eva', 'Marit'],
  ['Kask', 'Tamm', 'Mägi', 'Sepp', 'Saar', 'Lepik', 'Rebane', 'Ilves', 'Kukk', 'Pärn', 'Kuusk', 'Kaasik', 'Oja', 'Raudsepp', 'Lõhmus']];
const NOTE_TEXTS = [
  'Чувствительная кожа, после процедуры лёгкое покраснение — проходит за час.',
  'Мощность лазера снизили на 10 %, клиентке так комфортнее.',
  'Просит напоминать о курсе за 2 дня в WhatsApp.',
  'Аллергия на лидокаин! Анестезию не использовать.',
  'Принимает изотретиноин до конца месяца — пилинги и Dr.Pen пока нельзя.',
  'Курс 6 процедур, сделано 3. Следующая через 4 недели.',
  'Предпочитает утреннее время, работает с 14:00.',
  'Хорошо реагирует на IPL, пигмент светлеет. Продолжаем.',
  'Оплачивает через Stebby (работодатель).',
  'После Botox — контроль через 14 дней, записать бесплатно.',
];

// SQL literal for seeding (the seed is generated here, never from user input)
const lit = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

// Returns the seed as SQL lines; rows sharing one INSERT template are merged into multi-row inserts.
function seedSql() {
  const groups = new Map();
  const ins = (sql, ...args) => {
    const i = sql.indexOf('VALUES');
    const head = sql.slice(0, i + 6);
    if (!groups.has(head)) groups.set(head, []);
    groups.get(head).push(`(${args.map(lit).join(',')})`);
  };
  seedRows(ins);
  const lines = [];
  for (const [head, vals] of groups) {
    let chunk = [];
    let size = 0;
    for (const v of vals) {
      if (size + v.length > 60000) { lines.push(`${head} ${chunk.join(',')};`); chunk = []; size = 0; }
      chunk.push(v); size += v.length + 1;
    }
    if (chunk.length) lines.push(`${head} ${chunk.join(',')};`);
  }
  return lines;
}

function seedRows(ins) {
  const T = today();
  const now = nowLocal();
  FIRMS.forEach((r) => ins('INSERT INTO firms VALUES (?,?)', ...r));
  ROOMS.forEach((r) => ins('INSERT INTO rooms VALUES (?,?)', ...r));
  DEVICES.forEach((r) => ins('INSERT INTO devices VALUES (?,?,?,?)', ...r));
  STAFF.forEach((r) => ins('INSERT INTO staff (id,name,role,title,pin,color,pct) VALUES (?,?,?,?,?,?,?)', ...r));
  PRODUCTS.forEach((r) => ins('INSERT INTO products VALUES (?,?,?,?,?,?,?,?,?)', ...r));
  SERVICES.forEach((r) => ins('INSERT INTO services VALUES (?,?,?,?,?,?,?,?,?,?,?)', ...r));
  CONSUMABLES.forEach((r) => ins('INSERT INTO service_consumables VALUES (?,?,?)', ...r));
  // Anna gets 35 % on laser full legs instead of 40 % — example of a per-master override
  ins('INSERT INTO bonus_overrides VALUES (?,?,?,?)', 2, 9, 'pct', 35);

  const r = rng(20261117);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];

  // clients
  const clients = [];
  const usedNames = new Set();
  for (let i = 1; i <= 48; i++) {
    let name;
    do { const set = r() < 0.65 ? NAMES_RU : NAMES_ET; name = `${pick(set[0])} ${pick(set[1])}`; } while (usedNames.has(name));
    usedNames.add(name);
    const phone = `+372 5${Math.floor(r() * 900 + 100)} ${Math.floor(r() * 9000 + 1000)}`;
    const anam = {
      complaints: pick(['Нежелательные волосы', 'Пигментация', 'Возрастные изменения, тонус кожи', 'Целлюлит, отёки', 'Расширенные капилляры', 'Акне, постакне']),
      contraindications: pick(['Нет', 'Нет', 'Нет', 'Беременность — нет; кардиостимулятор — нет', 'Гипертония, контролирует']),
      allergies: pick(['Нет', 'Нет', 'Нет', 'Лидокаин', 'Цитрусовые']),
      medications: pick(['Нет', 'Нет', 'Оральные контрацептивы', 'Изотретиноин (до конца месяца)']),
      skin_type: pick(['II', 'III', 'III', 'IV']),
    };
    clients.push(i);
    ins('INSERT INTO clients VALUES (?,?,?,?,?,?,?,?,?)', i, name, phone,
      r() < 0.6 ? `client${i}@example.com` : null,
      `19${Math.floor(r() * 30 + 70)}-${String(Math.floor(r() * 12 + 1)).padStart(2, '0')}-${String(Math.floor(r() * 28 + 1)).padStart(2, '0')}`,
      JSON.stringify(anam), 1, r() < 0.7 ? 1 : 0, addDays(T, -Math.floor(r() * 300 + 30)) + ' 10:00');
  }
  // 1–3 notes per client from different masters
  clients.forEach((cid) => {
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      ins('INSERT INTO notes (client_id, staff_id, text, created_at) VALUES (?,?,?,?)', cid, 1 + Math.floor(r() * 5), pick(NOTE_TEXTS), addDays(T, -Math.floor(r() * 120 + 1)) + ` ${fromMin(9 * 60 + Math.floor(r() * 18) * 30)}`);
    }
  });
  // appointments: from the 1st of last month until 7 days ahead
  const monthStart = T.slice(0, 8) + '01';
  const start = addDays(monthStart, -31).slice(0, 8) + '01';
  const end = addDays(T, 7);
  const svcById = Object.fromEntries(SERVICES.map((s) => [s[0], s]));
  const roomServices = {
    1: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 18, 19, 20, 22, 23],
    2: [11, 12, 13, 14, 15, 16, 17, 21, 22, 18, 19],
  };
  let apptId = 0;
  const cardByFirmDay = {}; const cashByFirmDay = {}; const transfers = []; const stebby = {};
  const sold = {};
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const wd = weekday(d);
    if (wd === 0) continue; // closed on Sunday
    const closeMin = wd === 6 ? 15 * 60 : 19 * 60;
    // two shifts per room; rotate masters by day
    const dayIdx = Math.round((new Date(d) - new Date(start)) / 864e5);
    const order = [1, 2, 3, 4, 5].map((_, i, a) => a[(i + dayIdx) % 5]);
    const plan = [
      { room: 1, staff: order[0], from: 9 * 60, to: 14 * 60 },
      { room: 1, staff: order[1], from: 14 * 60, to: closeMin },
      { room: 2, staff: order[2], from: 10 * 60, to: 15 * 60 },
      { room: 2, staff: order[3], from: 15 * 60, to: closeMin },
    ];
    if (d === T) {
      // a staff meeting block for everyone at the end of the day
    }
    for (const sh of plan) {
      let t = sh.from + (r() < 0.3 ? 30 : 0);
      while (t < sh.to - 30) {
        let sid = pick(roomServices[sh.room]);
        if (sh.staff === 5) sid = pick([15, 16, 17, 21, 21, 15]); // massage specialist
        const s = svcById[sid];
        if (t + s[3] > sh.to) break;
        const cid = pick(clients);
        const st0 = `${d} ${fromMin(t)}`; const en = `${d} ${fromMin(t + s[3])}`;
        const past = en <= now;
        const status = past ? (r() < 0.05 ? 'no_show' : 'done') : 'booked';
        apptId++;
        ins('INSERT INTO appointments (id, client_id, staff_id, service_id, room_id, device_id, start, end, status, note, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
          apptId, cid, sh.staff, sid, sh.room, s[6], st0, en, status, r() < 0.12 ? 'Первый визит' : null, pick([1, sh.staff]), addDays(d, -Math.floor(r() * 10 + 1)) + ' 12:00');
        if (status === 'done') {
          const firm = s[7];
          const amount = s[5] ? s[4] + Math.floor(r() * 4) * 20 : s[4];
          let cost = 0;
          (CONSUMABLES.filter((c) => c[0] === sid)).forEach((c) => { const p = PRODUCTS.find((x) => x[0] === c[1]); cost += c[2] * p[5]; sold[c[1]] = (sold[c[1]] || 0) + c[2]; });
          let qty = 1;
          if (s[10]) { const p = PRODUCTS.find((x) => x[0] === s[10]); qty = DRUG_USE[sid]; cost += qty * p[5]; sold[s[10]] = (sold[s[10]] || 0) + qty; }
          const pct = sh.staff === 2 && sid === 9 ? 35 : (s[9] ?? STAFF.find((x) => x[0] === sh.staff)[6]); // matches the bonus_overrides row below
          const bonus = round2((s[8] === 'pct_net' ? amount - cost : amount) * pct / 100);
          const methodRoll = r();
          const method = (sid >= 15 && sid <= 17) || sid === 21 ? (methodRoll < 0.5 ? 'stebby' : methodRoll < 0.75 ? 'card' : 'cash')
            : methodRoll < 0.35 ? 'cash' : methodRoll < 0.92 ? 'card' : 'transfer';
          const cashTaken = method === 'cash' && r() < 0.6 ? bonus : 0;
          ins('INSERT INTO sales (appointment_id, staff_id, client_id, firm_id, date, item_type, item_id, qty, amount, cost, bonus, cash_taken) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            apptId, sh.staff, cid, firm, d, 'service', sid, s[10] ? qty : 1, amount, round2(cost), bonus, cashTaken);
          ins('INSERT INTO payments (appointment_id, firm_id, method, amount, date, staff_id) VALUES (?,?,?,?,?,?)', apptId, firm, method, amount, d, sh.staff);
          const k = `${firm}|${d}`;
          if (method === 'card') cardByFirmDay[k] = (cardByFirmDay[k] || 0) + amount;
          if (method === 'cash') cashByFirmDay[k] = (cashByFirmDay[k] || 0) + amount - cashTaken;
          if (method === 'transfer') transfers.push([firm, d, amount, cid]);
          if (method === 'stebby') stebby[d] = (stebby[d] || 0) + amount;
          // sometimes a cream is sold on top
          if (r() < 0.12) {
            const pr = pick([7, 8, 10]); const p = PRODUCTS.find((x) => x[0] === pr);
            const pb = round2(p[6] * 0.1);
            ins('INSERT INTO sales (appointment_id, staff_id, client_id, firm_id, date, item_type, item_id, qty, amount, cost, bonus, cash_taken) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
              apptId, sh.staff, cid, p[4], d, 'product', pr, 1, p[6], p[5], pb, 0);
            ins('INSERT INTO payments (appointment_id, firm_id, method, amount, date, staff_id) VALUES (?,?,?,?,?,?)', apptId, p[4], 'card', p[6], d, sh.staff);
            cardByFirmDay[`${p[4]}|${d}`] = (cardByFirmDay[`${p[4]}|${d}`] || 0) + p[6];
          }
        }
        t += s[3] + pick([0, 0, 0, 15, 30, 60]);
      }
    }
  }
  // staff meeting today 18:00–19:00 (service-less block, blocks nobody's device)
  // bank: card terminal settles next working day; one deliberate mismatch
  let mism = 0;
  Object.entries(cardByFirmDay).sort().forEach(([k, sum]) => {
    const [firm, d] = k.split('|');
    let settle = addDays(d, 1); if (weekday(settle) === 0) settle = addDays(settle, 1);
    if (settle > T) return;
    let amt = sum;
    if (mism < 2 && d >= monthStart && r() < 0.15) { amt = sum - 70; mism++; }
    ins('INSERT INTO bank_tx (firm_id, date, kind, amount, payer, descr) VALUES (?,?,?,?,?,?)', +firm, settle, 'card', round2(amt), 'Swedbank Terminal', `Терминал за ${d}`);
  });
  transfers.forEach(([firm, d, amount, cid], i) => {
    if (d > T) return;
    if (i === 3) return; // one transfer never arrived
    ins('INSERT INTO bank_tx (firm_id, date, kind, amount, payer, descr) VALUES (?,?,?,?,?,?)', firm, d, 'transfer', amount, `Клиент #${cid}`, 'Оплата процедуры');
  });
  // Stebby pays weekly (Monday) for the previous week; latest week one visit short
  const weeks = {};
  Object.entries(stebby).forEach(([d, sum]) => { let m = d; while (weekday(m) !== 1) m = addDays(m, 1); if (m === d) m = addDays(m, 7); weeks[m] = (weeks[m] || 0) + sum; });
  const wk = Object.keys(weeks).sort();
  wk.forEach((m, i) => { if (m > T) return; const amt = i === wk.filter((x) => x <= T).length - 1 ? weeks[m] - 50 : weeks[m]; ins('INSERT INTO bank_tx (firm_id, date, kind, amount, payer, descr) VALUES (?,?,?,?,?,?)', 3, m, 'stebby', round2(amt), 'Stebby OÜ', 'Выплата Stebby за неделю'); });
  // cash counted at end of day, one shortage of 20 €
  let shortage = false;
  Object.entries(cashByFirmDay).forEach(([k, sum]) => { const [firm, d] = k.split('|'); if (d >= T) return; let c = sum; if (!shortage && d >= monthStart && r() < 0.1) { c -= 20; shortage = true; } ins('INSERT INTO cash_counts VALUES (?,?,?,?)', +firm, d, round2(c), 1); });

  // expenses for last and current month
  [addDays(monthStart, -1).slice(0, 8) + '01', monthStart].forEach((m) => {
    const exp = [
      [1, '03', 'Аренда', 1200, 'Rakvere 19'], [1, '05', 'Коммунальные', 210, 'Электричество, вода'], [1, '08', 'Закупка расходников', 340, 'Гели, картриджи'],
      [1, '12', 'Реклама', 150, 'Instagram/Facebook'], [2, '06', 'Закупка препаратов', 960, 'Ботулотоксин, мезококтейли'], [2, '15', 'Лицензия и страхование', 85, ''],
      [3, '04', 'Аренда', 300, 'Доля кабинета'], [3, '10', 'Закупка расходников', 60, 'Масло для массажа'], [1, '14', 'Связь и программы', 45, 'Телефон, DIKIDI'],
    ];
    exp.forEach(([firm, day, cat, amt, c]) => { const d = m.slice(0, 8) + day; if (d <= T) ins('INSERT INTO expenses (firm_id, date, category, amount, comment) VALUES (?,?,?,?,?)', firm, d, cat, amt, c); });
  });
  // stock movements: one receipt per product last month, consumption summary
  PRODUCTS.forEach((p) => {
    ins('INSERT INTO stock_moves (product_id, type, qty, price, comment, staff_id, created_at) VALUES (?,?,?,?,?,?,?)', p[0], 'receipt', p[7] + (sold[p[0]] || 0), p[5], 'Поставка', 1, start + ' 09:30');
    if (sold[p[0]]) ins('INSERT INTO stock_moves (product_id, type, qty, price, comment, staff_id, created_at) VALUES (?,?,?,?,?,?,?)', p[0], 'consumption', -sold[p[0]], p[5], 'Списано по процедурам (итого)', null, T + ' 08:00');
  });
  ins('INSERT INTO stock_moves (product_id, type, qty, price, comment, staff_id, created_at) VALUES (?,?,?,?,?,?,?)', 8, 'writeoff', -1, 19, 'Брак: повреждена упаковка', 3, addDays(T, -3) + ' 16:10');
  // a few audit entries so the log is not empty
  [
    [addDays(T, -2) + ' 11:04', 3, 'Перенос записи', 'Запись: ЛЭ Голени', 'Вт 10:00, Кабинет 1', 'Вт 12:30, Кабинет 1'],
    [addDays(T, -2) + ' 15:40', 2, 'Изменение оплаты', 'Оплата 80 €', 'Наличные', 'Карта'],
    [addDays(T, -1) + ' 09:12', 1, 'Изменение цены услуги', 'Услуга: IPL', '75 €', '80 €'],
    [addDays(T, -1) + ' 17:55', 4, 'Отмена записи', 'Запись: Botox', 'Записан', 'Отменено: клиент заболел'],
  ].forEach((a) => ins('INSERT INTO audit (at, staff_id, action, object, before, after) VALUES (?,?,?,?,?,?)', ...a));
}

async function ensureDb(db, force = false) {
  if (!force) {
    try { const r = await db.prepare('SELECT COUNT(*) AS n FROM staff').first(); if (r && r.n > 0) return; } catch (e) { /* not created yet */ }
  }
  // exec() runs newline-separated statements in a single call
  // a reset keeps sessions, so whoever pressed «Сбросить демо» stays logged in
  const drops = TABLES.filter((t) => !(force && t === 'sessions')).map((t) => `DROP TABLE IF EXISTS ${t};`);
  const sql = [...drops, ...SCHEMA.map((s) => s + ';'), ...seedSql()].join('\n');
  await db.exec(sql);
}

// ---------- auth & audit ----------
async function currentUser(db, request) {
  const h = request.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  return db.prepare('SELECT s.id, s.name, s.role, s.title, s.color FROM sessions x JOIN staff s ON s.id = x.staff_id WHERE x.token = ?').bind(token).first();
}
const logAudit = (db, user, action, object, before, after) =>
  db.prepare('INSERT INTO audit (at, staff_id, action, object, before, after) VALUES (?,?,?,?,?,?)').bind(nowLocal(), user.id, action, object, before ?? null, after ?? null).run();

// ---------- domain ----------
async function findConflict(db, { start, end, staff_id, room_id, device_id, ignoreId }) {
  const rows = (await db.prepare(
    `SELECT a.*, s.name AS staff_name, r.name AS room_name, d.name AS device_name FROM appointments a
     JOIN staff s ON s.id = a.staff_id LEFT JOIN rooms r ON r.id = a.room_id LEFT JOIN devices d ON d.id = a.device_id
     WHERE a.status NOT IN ('cancelled','no_show') AND a.start < ? AND a.end > ? AND a.id != ?
       AND (a.staff_id = ? OR a.room_id = ? OR (a.device_id IS NOT NULL AND a.device_id = ?))`
  ).bind(end, start, ignoreId || 0, staff_id, room_id || -1, device_id || -1).all()).results;
  if (!rows.length) return null;
  const c = rows[0]; const t = `${c.start.slice(11)}–${c.end.slice(11)}`;
  if (device_id && c.device_id === device_id) return `${c.device_name} занят ${t} (${c.staff_name}, ${c.room_name}). Выберите другое время.`;
  if (c.staff_id === staff_id) return `У мастера ${c.staff_name} уже есть запись ${t}.`;
  return `${c.room_name} занят ${t} (${c.staff_name}).`;
}

async function pickRoom(db, start, end, device_id, staff_id, ignoreId) {
  const rooms = (await db.prepare('SELECT id FROM rooms ORDER BY id').all()).results.map((x) => x.id);
  let pref = null;
  if (device_id) pref = (await db.prepare('SELECT room_id FROM devices WHERE id = ?').bind(device_id).first())?.room_id;
  const order = pref ? [pref, ...rooms.filter((x) => x !== pref)] : rooms;
  for (const room of order) {
    const busy = await db.prepare(`SELECT 1 FROM appointments WHERE status NOT IN ('cancelled','no_show') AND room_id = ? AND start < ? AND end > ? AND id != ? LIMIT 1`).bind(room, end, start, ignoreId || 0).first();
    if (!busy) return room;
  }
  return order[0]; // let the conflict check explain which room is busy
}

async function bonusFor(db, svc, staff, amount, cost) {
  const ov = await db.prepare('SELECT * FROM bonus_overrides WHERE staff_id = ? AND service_id = ?').bind(staff.id, svc.id).first();
  const type = ov ? ov.bonus_type : svc.bonus_type;
  const value = ov ? ov.bonus_value : (svc.bonus_value ?? staff.pct);
  if (type === 'fixed') return { bonus: value, rule: `${value} € за процедуру` };
  const base = type === 'pct_net' ? amount - cost : amount;
  return { bonus: round2(base * value / 100), rule: type === 'pct_net' ? `${value} % от (цены − препарат ${round2(cost)} €)` : `${value} % от цены${ov ? ' (личная ставка)' : ''}` };
}

function monthRange(month) {
  const from = `${month}-01`;
  const next = addDays(`${month}-28`, 4).slice(0, 7) + '-01';
  return [from, addDays(next, -1)];
}

// ---------- router ----------
export async function onRequest(context) {
  const { request, env, params } = context;
  const db = env.DB;
  if (!db) return err('D1 binding DB is missing', 500);
  await ensureDb(db);
  const url = new URL(request.url);
  const path = '/' + [].concat(params.route || []).join('/');
  const method = request.method;
  const body = method === 'GET' ? {} : await request.json().catch(() => ({}));

  try {
    if (path === '/staff-public' && method === 'GET') {
      return json((await db.prepare('SELECT id, name, role, title, color FROM staff WHERE active = 1 ORDER BY id').all()).results);
    }
    if (path === '/login' && method === 'POST') {
      const s = await db.prepare('SELECT * FROM staff WHERE id = ? AND pin = ?').bind(body.staff_id, String(body.pin || '')).first();
      if (!s) return err('Неверный PIN', 401);
      const token = crypto.randomUUID();
      await db.prepare('INSERT INTO sessions VALUES (?,?,?)').bind(token, s.id, nowLocal()).run();
      return json({ token });
    }

    const user = await currentUser(db, request);
    if (!user) return err('Нужно войти', 401);
    const owner = user.role === 'owner';
    const ownerOnly = () => (owner ? null : err('Доступно только владелице', 403));

    if (path === '/reset' && method === 'POST') {
      if (!owner) return ownerOnly();
      await ensureDb(db, true);
      return json({ ok: true });
    }

    if (path === '/bootstrap') {
      const q = (sql) => db.prepare(sql).all().then((x) => x.results);
      const [firms, rooms, devices, staff, services, products] = await Promise.all([
        q('SELECT * FROM firms'), q('SELECT * FROM rooms'), q('SELECT * FROM devices'),
        q('SELECT id, name, role, title, color, pct FROM staff WHERE active = 1 ORDER BY id'),
        q('SELECT * FROM services ORDER BY category, name'), q('SELECT * FROM products ORDER BY kind, name'),
      ]);
      return json({ me: user, today: today(), now: nowLocal(), firms, rooms, devices, staff, services, products });
    }

    // --- appointments ---
    if (path === '/appointments' && method === 'GET') {
      const from = url.searchParams.get('from') || today();
      const to = url.searchParams.get('to') || from;
      const rows = (await db.prepare(
        `SELECT a.*, c.name AS client_name, c.phone AS client_phone, sv.name AS service_name, sv.price AS service_price,
          (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.appointment_id = a.id) AS paid
         FROM appointments a LEFT JOIN clients c ON c.id = a.client_id LEFT JOIN services sv ON sv.id = a.service_id
         WHERE a.start >= ? AND a.start < ? ORDER BY a.start`
      ).bind(from + ' 00:00', addDays(to, 1) + ' 00:00').all()).results;
      return json(rows);
    }
    if (path === '/appointments' && method === 'POST') {
      let clientId = body.client_id;
      if (!clientId) {
        if (!body.new_client?.name || !body.new_client?.phone) return err('Укажите имя и телефон клиента');
        const r = await db.prepare('INSERT INTO clients (name, phone, consent_health, consent_marketing, created_at) VALUES (?,?,0,0,?)').bind(body.new_client.name.trim(), body.new_client.phone.trim(), nowLocal()).run();
        clientId = r.meta.last_row_id;
        await logAudit(db, user, 'Новый клиент', `${body.new_client.name} ${body.new_client.phone}`, null, null);
      }
      const svc = await db.prepare('SELECT * FROM services WHERE id = ?').bind(body.service_id).first();
      if (!svc) return err('Выберите услугу');
      const staffId = owner || user.role === 'admin' ? Number(body.staff_id) : user.id;
      const start = body.start; const end = addMinutes(start, svc.duration);
      const room = body.room_id ? Number(body.room_id) : await pickRoom(db, start, end, svc.device_id, staffId);
      const conflict = await findConflict(db, { start, end, staff_id: staffId, room_id: room, device_id: svc.device_id });
      if (conflict) return err(conflict, 409);
      const r = await db.prepare('INSERT INTO appointments (client_id, staff_id, service_id, room_id, device_id, start, end, status, note, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .bind(clientId, staffId, svc.id, room, svc.device_id, start, end, 'booked', body.note || null, user.id, nowLocal()).run();
      await logAudit(db, user, 'Новая запись', `Запись: ${svc.name}`, null, `${start}`);
      return json({ id: r.meta.last_row_id });
    }
    let m = path.match(/^\/appointments\/(\d+)$/);
    if (m && method === 'PATCH') {
      const a = await db.prepare('SELECT a.*, sv.name AS service_name, sv.duration FROM appointments a LEFT JOIN services sv ON sv.id = a.service_id WHERE a.id = ?').bind(m[1]).first();
      if (!a) return err('Запись не найдена', 404);
      if (!owner && user.role !== 'admin' && a.staff_id !== user.id) return err('Это запись другого мастера', 403);
      const labels = { booked: 'Записан', arrived: 'Пришёл', done: 'Оказано', no_show: 'Не пришёл', cancelled: 'Отменено' };
      if (body.start || body.staff_id || body.room_id) {
        const start = body.start || a.start;
        const dur = toMin(a.end.slice(11)) - toMin(a.start.slice(11));
        const end = addMinutes(start, dur);
        const staffId = body.staff_id ? Number(body.staff_id) : a.staff_id;
        const room = body.room_id ? Number(body.room_id) : (body.start ? await pickRoom(db, start, end, a.device_id, staffId, a.id) : a.room_id);
        const conflict = await findConflict(db, { start, end, staff_id: staffId, room_id: room, device_id: a.device_id, ignoreId: a.id });
        if (conflict) return err(conflict, 409);
        await db.prepare('UPDATE appointments SET start = ?, end = ?, staff_id = ?, room_id = ? WHERE id = ?').bind(start, end, staffId, room, a.id).run();
        await logAudit(db, user, 'Перенос записи', `Запись: ${a.service_name}`, a.start, start);
      }
      if (body.status) {
        await db.prepare('UPDATE appointments SET status = ?, cancel_reason = ? WHERE id = ?').bind(body.status, body.cancel_reason || null, a.id).run();
        await logAudit(db, user, body.status === 'cancelled' ? 'Отмена записи' : 'Статус записи', `Запись: ${a.service_name}`, labels[a.status], labels[body.status] + (body.cancel_reason ? `: ${body.cancel_reason}` : ''));
        if (body.status === 'cancelled') await db.prepare('UPDATE sales SET cancelled = 1 WHERE appointment_id = ?').bind(a.id).run();
      }
      return json({ ok: true });
    }
    m = path.match(/^\/appointments\/(\d+)\/quote$/);
    if (m && method === 'POST') {
      const a = await db.prepare('SELECT * FROM appointments WHERE id = ?').bind(m[1]).first();
      const svc = await db.prepare('SELECT * FROM services WHERE id = ?').bind(a.service_id).first();
      const staff = await db.prepare('SELECT * FROM staff WHERE id = ?').bind(a.staff_id).first();
      let cost = 0;
      if (svc.drug_product_id) { const p = await db.prepare('SELECT cost FROM products WHERE id = ?').bind(svc.drug_product_id).first(); cost = round2((Number(body.drug_qty) || 0) * p.cost); }
      return json({ cost, ...(await bonusFor(db, svc, staff, Number(body.amount) || 0, cost)) });
    }
    m = path.match(/^\/appointments\/(\d+)\/pay$/);
    if (m && method === 'POST') {
      const a = await db.prepare('SELECT * FROM appointments WHERE id = ?').bind(m[1]).first();
      if (!a) return err('Запись не найдена', 404);
      if (!owner && user.role !== 'admin' && a.staff_id !== user.id) return err('Это запись другого мастера', 403);
      const svc = await db.prepare('SELECT * FROM services WHERE id = ?').bind(a.service_id).first();
      const staff = await db.prepare('SELECT * FROM staff WHERE id = ?').bind(a.staff_id).first();
      const parts = (body.parts || []).filter((p) => Number(p.amount) > 0);
      if (!parts.length) return err('Введите сумму оплаты');
      const amount = round2(parts.reduce((s, p) => s + Number(p.amount), 0));
      const d = a.start.slice(0, 10);
      const st = [];
      let cost = 0;
      const cons = (await db.prepare('SELECT sc.*, p.cost FROM service_consumables sc JOIN products p ON p.id = sc.product_id WHERE sc.service_id = ?').bind(svc.id).all()).results;
      cons.forEach((c) => { cost += c.qty * c.cost; st.push(db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').bind(c.qty, c.product_id)); st.push(db.prepare('INSERT INTO stock_moves (product_id, type, qty, price, comment, staff_id, created_at) VALUES (?,?,?,?,?,?,?)').bind(c.product_id, 'consumption', -c.qty, c.cost, `Норма: ${svc.name}`, staff.id, nowLocal())); });
      let drugCost = 0; const drugQty = Number(body.drug_qty) || 0;
      if (svc.drug_product_id && drugQty > 0) {
        const p = await db.prepare('SELECT * FROM products WHERE id = ?').bind(svc.drug_product_id).first();
        drugCost = round2(drugQty * p.cost);
        st.push(db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').bind(drugQty, p.id));
        st.push(db.prepare('INSERT INTO stock_moves (product_id, type, qty, price, comment, staff_id, created_at) VALUES (?,?,?,?,?,?,?)').bind(p.id, 'consumption', -drugQty, p.cost, `${svc.name}: использовано`, staff.id, nowLocal()));
      }
      const { bonus } = await bonusFor(db, svc, staff, amount, drugCost);
      const cashPaid = parts.filter((p) => p.method === 'cash').reduce((s, p) => s + Number(p.amount), 0);
      const cashTaken = body.cash_taken ? round2(Math.min(bonus, cashPaid)) : 0;
      st.push(db.prepare('INSERT INTO sales (appointment_id, staff_id, client_id, firm_id, date, item_type, item_id, qty, amount, cost, bonus, cash_taken) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(a.id, staff.id, a.client_id, Number(body.firm_id) || svc.firm_id, d, 'service', svc.id, svc.drug_product_id ? drugQty : 1, amount, round2(cost + drugCost), bonus, cashTaken));
      parts.forEach((p) => st.push(db.prepare('INSERT INTO payments (appointment_id, firm_id, method, amount, date, staff_id) VALUES (?,?,?,?,?,?)').bind(a.id, Number(body.firm_id) || svc.firm_id, p.method, Number(p.amount), d, staff.id)));
      st.push(db.prepare("UPDATE appointments SET status = 'done' WHERE id = ?").bind(a.id));
      await db.batch(st);
      const mlabel = { cash: 'наличные', card: 'карта', transfer: 'перевод', stebby: 'Stebby' };
      await logAudit(db, user, 'Оплата', `Запись: ${svc.name}`, null, parts.map((p) => `${p.amount} € ${mlabel[p.method]}`).join(' + ') + (cashTaken ? `; мастер забрал ${cashTaken} € наличными` : ''));
      return json({ ok: true, bonus, cash_taken: cashTaken });
    }

    // --- clients ---
    if (path === '/clients' && method === 'GET') {
      const q = `%${(url.searchParams.get('q') || '').trim()}%`;
      const rows = (await db.prepare(
        `SELECT c.id, c.name, c.phone, (SELECT COUNT(*) FROM appointments a WHERE a.client_id = c.id AND a.status = 'done') AS visits,
          (SELECT MAX(start) FROM appointments a WHERE a.client_id = c.id AND a.status = 'done') AS last_visit
         FROM clients c WHERE c.name LIKE ? OR REPLACE(c.phone,' ','') LIKE REPLACE(?,' ','') ORDER BY c.name LIMIT 60`
      ).bind(q, q).all()).results;
      return json(rows);
    }
    m = path.match(/^\/clients\/(\d+)$/);
    if (m && method === 'GET') {
      const c = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(m[1]).first();
      if (!c) return err('Клиент не найден', 404);
      const notes = (await db.prepare('SELECT n.*, s.name AS author, s.color FROM notes n JOIN staff s ON s.id = n.staff_id WHERE client_id = ? ORDER BY created_at DESC').bind(c.id).all()).results;
      const history = (await db.prepare(
        `SELECT a.id, a.start, a.status, s.name AS staff_name, sv.name AS service_name,
          (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.appointment_id = a.id) AS paid
         FROM appointments a JOIN staff s ON s.id = a.staff_id LEFT JOIN services sv ON sv.id = a.service_id
         WHERE a.client_id = ? ORDER BY a.start DESC`
      ).bind(c.id).all()).results;
      await logAudit(db, user, 'Просмотр карточки', `Клиент: ${c.name}`, null, null);
      return json({ ...c, anamnesis: c.anamnesis ? JSON.parse(c.anamnesis) : {}, notes, history });
    }
    if (m && method === 'PATCH') {
      const c = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(m[1]).first();
      const fields = ['name', 'phone', 'email', 'birthday', 'consent_health', 'consent_marketing'];
      for (const f of fields) if (f in body && body[f] !== c[f]) {
        await db.prepare(`UPDATE clients SET ${f} = ? WHERE id = ?`).bind(body[f], c.id).run();
        await logAudit(db, user, 'Изменение карточки', `Клиент: ${c.name} — ${f}`, String(c[f] ?? ''), String(body[f] ?? ''));
      }
      if (body.anamnesis) {
        await db.prepare('UPDATE clients SET anamnesis = ? WHERE id = ?').bind(JSON.stringify(body.anamnesis), c.id).run();
        await logAudit(db, user, 'Изменение анамнеза', `Клиент: ${c.name}`, null, null);
      }
      return json({ ok: true });
    }
    m = path.match(/^\/clients\/(\d+)\/notes$/);
    if (m && method === 'POST') {
      if (!body.text?.trim()) return err('Пустая заметка');
      await db.prepare('INSERT INTO notes (client_id, staff_id, text, created_at) VALUES (?,?,?,?)').bind(m[1], user.id, body.text.trim(), nowLocal()).run();
      return json({ ok: true });
    }

    // --- stock ---
    if (path === '/stock' && method === 'GET') {
      const products = (await db.prepare('SELECT p.*, f.name AS firm_name FROM products p JOIN firms f ON f.id = p.firm_id ORDER BY p.kind, p.name').all()).results;
      const moves = (await db.prepare('SELECT m.*, p.name AS product_name, p.unit, s.name AS staff_name FROM stock_moves m JOIN products p ON p.id = m.product_id LEFT JOIN staff s ON s.id = m.staff_id ORDER BY m.created_at DESC, m.id DESC LIMIT 40').all()).results;
      const usage = (await db.prepare(`SELECT sv.name, COUNT(*) AS n, ROUND(AVG(sa.cost),2) AS avg_cost, ROUND(AVG(sa.amount),2) AS avg_price FROM sales sa JOIN services sv ON sv.id = sa.item_id WHERE sa.item_type = 'service' AND sa.cancelled = 0 AND sa.cost > 0 GROUP BY sv.id ORDER BY avg_cost DESC`).all()).results;
      return json({ products, moves, usage });
    }
    if (path === '/stock/move' && method === 'POST') {
      const p = await db.prepare('SELECT * FROM products WHERE id = ?').bind(body.product_id).first();
      const qty = Number(body.qty);
      if (!p || !qty) return err('Выберите товар и количество');
      const signed = body.type === 'receipt' ? qty : body.type === 'inventory' ? qty - p.stock : -qty;
      await db.batch([
        db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').bind(signed, p.id),
        db.prepare('INSERT INTO stock_moves (product_id, type, qty, price, comment, staff_id, created_at) VALUES (?,?,?,?,?,?,?)').bind(p.id, body.type, signed, Number(body.price) || p.cost, body.comment || null, user.id, nowLocal()),
      ]);
      const label = { receipt: 'Приход товара', writeoff: 'Списание', sale: 'Продажа товара', inventory: 'Инвентаризация' }[body.type];
      await logAudit(db, user, label, `${p.name}`, `${p.stock} ${p.unit}`, `${round2(p.stock + signed)} ${p.unit}`);
      return json({ ok: true });
    }

    // --- salaries ---
    if (path === '/salaries' && method === 'GET') {
      const [from, to] = monthRange(url.searchParams.get('month') || today().slice(0, 7));
      const rows = (await db.prepare(
        `SELECT s.id, s.name, s.title, s.color, s.pct,
          COALESCE(SUM(CASE WHEN sa.item_type='service' THEN 1 END),0) AS procedures,
          COALESCE(SUM(sa.amount),0) AS revenue, COALESCE(SUM(sa.bonus),0) AS bonus, COALESCE(SUM(sa.cash_taken),0) AS cash_taken
         FROM staff s LEFT JOIN sales sa ON sa.staff_id = s.id AND sa.cancelled = 0 AND sa.date BETWEEN ? AND ?
         WHERE s.active = 1 ${owner ? '' : 'AND s.id = ?'} GROUP BY s.id ORDER BY s.id`
      ).bind(...(owner ? [from, to] : [from, to, user.id])).all()).results;
      const detailFor = owner ? Number(url.searchParams.get('staff') || 0) : user.id;
      let detail = [];
      if (detailFor) detail = (await db.prepare(
        `SELECT sa.date, sa.amount, sa.cost, sa.bonus, sa.cash_taken, sa.item_type, COALESCE(sv.name, p.name) AS item, c.name AS client_name,
          (SELECT GROUP_CONCAT(method) FROM payments py WHERE py.appointment_id = sa.appointment_id) AS methods
         FROM sales sa LEFT JOIN services sv ON sa.item_type='service' AND sv.id = sa.item_id LEFT JOIN products p ON sa.item_type='product' AND p.id = sa.item_id
         LEFT JOIN clients c ON c.id = sa.client_id WHERE sa.staff_id = ? AND sa.cancelled = 0 AND sa.date BETWEEN ? AND ? ORDER BY sa.date DESC, sa.id DESC`
      ).bind(detailFor, from, to).all()).results;
      return json({ from, to, rows: rows.map((r) => ({ ...r, revenue: round2(r.revenue), bonus: round2(r.bonus), cash_taken: round2(r.cash_taken), to_pay: round2(r.bonus - r.cash_taken) })), detail, detail_staff: detailFor });
    }

    // --- finance (owner) ---
    if (path === '/finance' && method === 'GET') {
      if (!owner) return ownerOnly();
      const month = url.searchParams.get('month') || today().slice(0, 7);
      const [from, to] = monthRange(month);
      const firms = (await db.prepare('SELECT * FROM firms').all()).results;
      const pay = (await db.prepare('SELECT firm_id, method, ROUND(SUM(amount),2) AS sum FROM payments WHERE date BETWEEN ? AND ? GROUP BY firm_id, method').bind(from, to).all()).results;
      const salesAgg = (await db.prepare('SELECT firm_id, ROUND(SUM(amount),2) AS revenue, ROUND(SUM(cost),2) AS cost, ROUND(SUM(bonus),2) AS bonus FROM sales WHERE cancelled = 0 AND date BETWEEN ? AND ? GROUP BY firm_id').bind(from, to).all()).results;
      const exp = (await db.prepare('SELECT * FROM expenses WHERE date BETWEEN ? AND ? ORDER BY date').bind(from, to).all()).results;
      const bank = (await db.prepare('SELECT * FROM bank_tx WHERE date BETWEEN ? AND ? ORDER BY date').bind(from, to).all()).results;
      // card: expected per firm/day vs terminal settlement (next working day)
      const cardDays = (await db.prepare(`SELECT firm_id, date, ROUND(SUM(amount),2) AS expected FROM payments WHERE method='card' AND date BETWEEN ? AND ? GROUP BY firm_id, date ORDER BY date`).bind(from, to).all()).results;
      const terminal = (await db.prepare(`SELECT firm_id, SUBSTR(descr, 13) AS for_date, amount, date FROM bank_tx WHERE kind='card'`).all()).results;
      const cardRec = cardDays.map((c) => { const t = terminal.find((x) => x.firm_id === c.firm_id && x.for_date === c.date); return { ...c, received: t ? t.amount : null, bank_date: t?.date || null }; })
        .sort((a, b) => b.date.localeCompare(a.date) || a.firm_id - b.firm_id);
      // transfers: match by firm + date + amount
      const trPay = (await db.prepare(`SELECT p.*, c.name AS client_name FROM payments p LEFT JOIN appointments a ON a.id = p.appointment_id LEFT JOIN clients c ON c.id = a.client_id WHERE p.method='transfer' AND p.date BETWEEN ? AND ?`).bind(from, to).all()).results;
      const trBank = bank.filter((b) => b.kind === 'transfer');
      const used = new Set();
      const transferRec = trPay.map((p) => { const b = trBank.find((x) => !used.has(x.id) && x.firm_id === p.firm_id && x.date === p.date && Math.abs(x.amount - p.amount) < 0.01); if (b) used.add(b.id); return { date: p.date, firm_id: p.firm_id, client_name: p.client_name, expected: p.amount, received: b ? b.amount : null }; })
        .sort((a, b) => b.date.localeCompare(a.date));
      // stebby: weekly payouts vs payments of previous week
      // Stebby pays on Monday for the previous week, so a payout can cover days of two months:
      // the part of each payout that belongs to this month is allocated by its share of the week's payments.
      const stebbyPay = (await db.prepare(`SELECT date, amount FROM payments WHERE method='stebby'`).all()).results;
      const stebbyBank = (await db.prepare(`SELECT * FROM bank_tx WHERE kind='stebby' AND date BETWEEN ? AND ? ORDER BY date`).bind(from, addDays(to, 7)).all()).results;
      const stebbyRec = stebbyBank.map((b) => {
        const wkFrom = addDays(b.date, -7); const wkTo = addDays(b.date, -1);
        const week = stebbyPay.filter((p) => p.date >= wkFrom && p.date <= wkTo);
        const expected = round2(week.reduce((s, p) => s + p.amount, 0));
        const inMonth = round2(week.filter((p) => p.date >= from && p.date <= to).reduce((s, p) => s + p.amount, 0));
        return { date: b.date, period: `${wkFrom} – ${wkTo}`, expected, received: b.amount, in_month: inMonth, received_in_month: expected ? round2(b.amount * inMonth / expected) : 0 };
      }).filter((x) => x.in_month > 0);
      // cash: expected (cash in − taken by masters) vs counted
      const cashExp = (await db.prepare(`SELECT p.firm_id, p.date, ROUND(SUM(p.amount),2) AS cash_in FROM payments p WHERE p.method='cash' AND p.date BETWEEN ? AND ? GROUP BY p.firm_id, p.date`).bind(from, to).all()).results;
      const taken = (await db.prepare(`SELECT firm_id, date, ROUND(SUM(cash_taken),2) AS taken FROM sales WHERE cancelled = 0 AND date BETWEEN ? AND ? GROUP BY firm_id, date`).bind(from, to).all()).results;
      const counts = (await db.prepare('SELECT * FROM cash_counts WHERE date BETWEEN ? AND ?').bind(from, to).all()).results;
      const cashRec = cashExp.map((c) => { const t = taken.find((x) => x.firm_id === c.firm_id && x.date === c.date)?.taken || 0; const k = counts.find((x) => x.firm_id === c.firm_id && x.date === c.date); return { ...c, taken: t, expected: round2(c.cash_in - t), counted: k ? k.counted : null }; })
        .sort((a, b) => b.date.localeCompare(a.date) || a.firm_id - b.firm_id);
      const byFirm = firms.map((f) => {
        const methods = Object.fromEntries(['cash', 'card', 'transfer', 'stebby'].map((mm) => [mm, pay.find((p) => p.firm_id === f.id && p.method === mm)?.sum || 0]));
        const s = salesAgg.find((x) => x.firm_id === f.id) || { revenue: 0, cost: 0, bonus: 0 };
        const expenses = round2(exp.filter((e) => e.firm_id === f.id).reduce((a, e) => a + e.amount, 0));
        const received = round2(
          cardRec.filter((c) => c.firm_id === f.id).reduce((a, c) => a + (c.received || 0), 0)
          + transferRec.filter((c) => c.firm_id === f.id).reduce((a, c) => a + (c.received || 0), 0)
          + (f.id === 3 ? stebbyRec.reduce((a, c) => a + c.received_in_month, 0) : 0)
          + cashRec.filter((c) => c.firm_id === f.id).reduce((a, c) => a + (c.counted ?? 0) + c.taken, 0));
        return { ...f, methods, revenue: s.revenue, cost: s.cost, salaries: s.bonus, expenses, received, profit: round2(s.revenue - s.cost - s.bonus - expenses) };
      });
      return json({ month, from, to, byFirm, expenses: exp, cardRec, transferRec, stebbyRec, cashRec });
    }

    // --- audit (owner) ---
    if (path === '/audit' && method === 'GET') {
      if (!owner) return ownerOnly();
      const rows = (await db.prepare('SELECT a.*, s.name AS staff_name FROM audit a LEFT JOIN staff s ON s.id = a.staff_id ORDER BY a.at DESC, a.id DESC LIMIT 200').all()).results;
      return json(rows);
    }

    return err('Not found', 404);
  } catch (e) {
    return err(`Ошибка сервера: ${e.message}`, 500);
  }
}
