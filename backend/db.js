import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.DB_PATH || '/app/data/tensio.db';

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS readings (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    -- data local en format YYYY-MM-DD
    date      TEXT NOT NULL,
    -- hora local en format HH:MM
    time      TEXT NOT NULL,
    systolic  INTEGER NOT NULL,
    diastolic INTEGER NOT NULL,
    pulse     INTEGER,
    notes     TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_readings_date ON readings(date);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// helpers d'accés a la taula clau-valor de configuració
export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setSetting(key, value) {
  if (value == null) {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  } else {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(key, String(value));
  }
}

// Migració suau: afegir columna pulse si la BD és antiga (ignora si ja existeix)
try {
  db.exec(`ALTER TABLE readings ADD COLUMN pulse INTEGER`);
} catch (_) { /* ja existeix */ }
