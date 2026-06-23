// Enviament de missatges via Telegram Bot API.
// Node 22 porta `fetch` global, sense dependències.

// Parts de data/hora a la zona horària indicada (per defecte Europe/Madrid).
// Retorna { date: 'YYYY-MM-DD', time: 'HH:MM' } en hora local.
export function localParts(tz = 'Europe/Madrid', d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

// Envia un missatge de text. Llança Error amb la descripció de Telegram si falla.
export async function sendTelegram(token, chatId, text) {
  if (!token || !chatId) throw new Error('Falta el token o el chat id');
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(data.description || `Error HTTP ${res.status}`);
  }
  return data.result;
}
