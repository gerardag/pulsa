import { db } from './db.js';
import { writeFileSync, readdirSync, unlinkSync, copyFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const DB_PATH = process.env.DB_PATH || '/app/data/tensio.db';
const BACKUP_DIR = join(dirname(DB_PATH), 'backups');
const MAX_BACKUPS = 30;
const TZ = process.env.TZ || 'Europe/Madrid';
const BACKUP_HOUR = 3;

export function runBackup() {
  mkdirSync(BACKUP_DIR, { recursive: true });

  const now = new Date();
  const stamp = now.toLocaleDateString('sv-SE', { timeZone: TZ });

  const rows = db.prepare('SELECT * FROM readings ORDER BY date ASC, time ASC').all();
  const jsonPath = join(BACKUP_DIR, `tensio_${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(rows, null, 2));

  const dbCopy = join(BACKUP_DIR, `tensio_${stamp}.db`);
  copyFileSync(DB_PATH, dbCopy);

  console.log(`Backup completat: ${stamp} (${rows.length} lectures)`);

  pruneOldBackups();
}

function pruneOldBackups() {
  const files = readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('tensio_'))
    .sort()
    .reverse();

  const dates = [...new Set(files.map(f => f.match(/tensio_(\d{4}-\d{2}-\d{2})/)?.[1]).filter(Boolean))];

  if (dates.length <= MAX_BACKUPS) return;

  const toRemove = dates.slice(MAX_BACKUPS);
  for (const f of files) {
    const d = f.match(/tensio_(\d{4}-\d{2}-\d{2})/)?.[1];
    if (d && toRemove.includes(d)) {
      unlinkSync(join(BACKUP_DIR, f));
    }
  }
}

export function scheduleBackup() {
  function msUntilNext() {
    const now = new Date();
    const localStr = now.toLocaleString('en-US', { timeZone: TZ });
    const local = new Date(localStr);

    const target = new Date(local);
    target.setHours(BACKUP_HOUR, 0, 0, 0);
    if (local >= target) target.setDate(target.getDate() + 1);

    return target.getTime() - local.getTime();
  }

  function tick() {
    try { runBackup(); } catch (e) { console.error('Error fent backup:', e.message); }
    setTimeout(tick, msUntilNext());
  }

  const ms = msUntilNext();
  console.log(`Pròxim backup programat en ${Math.round(ms / 60000)} minuts`);
  setTimeout(tick, ms);
}
