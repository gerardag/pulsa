import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { db, getSetting, setSetting } from './db.js';
import { classify } from './classify.js';
import { toCSV, pdfList, pdfCalendar } from './export.js';
import { sendTelegram, localParts } from './telegram.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ---------- validació ----------
function validReading(b) {
  const errs = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '')) errs.push('data invàlida (YYYY-MM-DD)');
  if (!/^\d{2}:\d{2}$/.test(b.time || '')) errs.push('hora invàlida (HH:MM)');
  const s = Number(b.systolic), d = Number(b.diastolic);
  if (!Number.isInteger(s) || s < 40 || s > 300) errs.push('sistòlica fora de rang');
  if (!Number.isInteger(d) || d < 20 || d > 200) errs.push('diastòlica fora de rang');
  if (b.pulse != null && b.pulse !== '' && (!Number.isInteger(Number(b.pulse)) || b.pulse < 20 || b.pulse > 250))
    errs.push('pulsacions fora de rang');
  return errs;
}

function withCat(r) {
  return { ...r, classification: classify(r.systolic, r.diastolic) };
}

// ---------- API ----------

// llistar lectures, opcionalment filtrades per rang [from, to]
app.get('/api/readings', (req, res) => {
  const { from, to } = req.query;
  let sql = 'SELECT * FROM readings';
  const params = [];
  const where = [];
  if (from) { where.push('date >= ?'); params.push(from); }
  if (to)   { where.push('date <= ?'); params.push(to); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY date DESC, time DESC, id DESC';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(withCat));
});

// crear lectura
app.post('/api/readings', (req, res) => {
  const b = req.body || {};
  const errs = validReading(b);
  if (errs.length) return res.status(400).json({ errors: errs });
  const pulse = (b.pulse === '' || b.pulse == null) ? null : Number(b.pulse);
  const info = db.prepare(
    `INSERT INTO readings (date, time, systolic, diastolic, pulse, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(b.date, b.time, Number(b.systolic), Number(b.diastolic), pulse, b.notes || null);
  const row = db.prepare('SELECT * FROM readings WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(withCat(row));
});

// editar lectura
app.put('/api/readings/:id', (req, res) => {
  const b = req.body || {};
  const errs = validReading(b);
  if (errs.length) return res.status(400).json({ errors: errs });
  const exists = db.prepare('SELECT id FROM readings WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'no trobada' });
  const pulse = (b.pulse === '' || b.pulse == null) ? null : Number(b.pulse);
  db.prepare(
    `UPDATE readings SET date=?, time=?, systolic=?, diastolic=?, pulse=?, notes=? WHERE id=?`
  ).run(b.date, b.time, Number(b.systolic), Number(b.diastolic), pulse, b.notes || null, req.params.id);
  const row = db.prepare('SELECT * FROM readings WHERE id = ?').get(req.params.id);
  res.json(withCat(row));
});

// esborrar lectura
app.delete('/api/readings/:id', (req, res) => {
  const info = db.prepare('DELETE FROM readings WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'no trobada' });
  res.json({ ok: true });
});

// estadístiques resum d'un rang
app.get('/api/stats', (req, res) => {
  const { from, to } = req.query;
  let sql = 'SELECT * FROM readings';
  const params = [];
  const where = [];
  if (from) { where.push('date >= ?'); params.push(from); }
  if (to)   { where.push('date <= ?'); params.push(to); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  const rows = db.prepare(sql).all(...params);
  if (!rows.length) return res.json({ count: 0 });
  const avg = (k) => Math.round(rows.reduce((a, r) => a + r[k], 0) / rows.length);
  const pulses = rows.filter(r => r.pulse).map(r => r.pulse);
  res.json({
    count: rows.length,
    avgSystolic: avg('systolic'),
    avgDiastolic: avg('diastolic'),
    avgPulse: pulses.length ? Math.round(pulses.reduce((a, b) => a + b, 0) / pulses.length) : null,
    maxSystolic: Math.max(...rows.map(r => r.systolic)),
    minSystolic: Math.min(...rows.map(r => r.systolic)),
  });
});

// ---------- configuració Telegram ----------
const TZ = process.env.TZ || 'Europe/Madrid';

// estat de la config sense exposar mai el token
function configState() {
  const token = getSetting('telegram_token');
  const chatId = getSetting('telegram_chat_id');
  return { chatId: chatId || '', hasToken: !!token, enabled: !!(token && chatId) };
}

app.get('/api/config', (_req, res) => res.json(configState()));

// desar: el token només es canvia si s'envia (buit = mantenir l'actual)
app.post('/api/config', (req, res) => {
  const b = req.body || {};
  if (typeof b.token === 'string' && b.token.trim()) setSetting('telegram_token', b.token.trim());
  if (typeof b.chatId === 'string') setSetting('telegram_chat_id', b.chatId.trim() || null);
  res.json(configState());
});

// esborrar tota la connexió
app.delete('/api/config', (_req, res) => {
  setSetting('telegram_token', null);
  setSetting('telegram_chat_id', null);
  setSetting('telegram_last_notified', null);
  res.json(configState());
});

// provar la connexió: usa els valors enviats o, si falten, els desats
app.post('/api/config/test', async (req, res) => {
  const b = req.body || {};
  const token = (b.token && b.token.trim()) || getSetting('telegram_token');
  const chatId = (typeof b.chatId === 'string' && b.chatId.trim()) || getSetting('telegram_chat_id');
  try {
    await sendTelegram(token, chatId, '✅ <b>Registre de tensió</b>\nConnexió de Telegram correcta.');
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// ---------- recordatori diari a les 9:00 ----------
async function checkReminder() {
  const token = getSetting('telegram_token');
  const chatId = getSetting('telegram_chat_id');
  if (!token || !chatId) return;

  const { date, time } = localParts(TZ);
  if (time < '09:00') return;                                  // encara no són les 9
  if (getSetting('telegram_last_notified') === date) return;   // ja avisat avui

  const row = db.prepare('SELECT 1 FROM readings WHERE date = ? LIMIT 1').get(date);
  if (row) return;                                             // ja hi ha lectura avui

  try {
    await sendTelegram(token, chatId,
      '🩺 <b>Recordatori de tensió</b>\nAvui encara no has registrat cap lectura. No oblidis prendre-te la tensió.');
    setSetting('telegram_last_notified', date);
  } catch (e) {
    console.error('Error enviant recordatori de Telegram:', e.message);
  }
}

// comprova cada minut; dispara un cop quan és >= 09:00 i no hi ha lectura
setInterval(checkReminder, 60 * 1000);

// ---------- exportació ----------
function fetchRange(from, to) {
  let sql = 'SELECT * FROM readings';
  const params = [];
  const where = [];
  if (from) { where.push('date >= ?'); params.push(from); }
  if (to)   { where.push('date <= ?'); params.push(to); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY date ASC, time ASC';
  return db.prepare(sql).all(...params);
}

app.get('/api/export', (req, res) => {
  const { format = 'csv', from = '0000-01-01', to = '9999-12-31' } = req.query;
  const rows = fetchRange(from, to);
  const stamp = `${from}_${to}`;

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tensio_${stamp}.csv"`);
    return res.send(toCSV(rows));
  }

  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="tensio_${stamp}.pdf"`);
    return pdfList(rows, { from, to }).pipe(res);
  }

  if (format === 'calendar') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="tensio_calendari_${stamp}.pdf"`);
    return pdfCalendar(rows, { from, to }).pipe(res);
  }

  res.status(400).json({ error: 'format desconegut (csv | pdf | calendar)' });
});

// ---------- frontend ----------
app.use(express.static(join(__dirname, '..', 'frontend')));

app.listen(PORT, () => {
  console.log(`Tensió escoltant a http://0.0.0.0:${PORT}`);
});
