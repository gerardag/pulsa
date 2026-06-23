import PDFDocument from 'pdfkit';
import { classify, daysBetween, MONTHS_CA, WEEKDAYS_CA } from './classify.js';

// ---------- CSV ----------
export function toCSV(rows) {
  const header = ['data', 'hora', 'sistolica', 'diastolica', 'pulsacions', 'classificacio'];
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [header.join(',')];
  for (const r of rows) {
    const cat = classify(r.systolic, r.diastolic);
    lines.push([
      r.date, r.time, r.systolic, r.diastolic,
      r.pulse ?? '', cat.label
    ].map(esc).join(','));
  }
  // BOM perquè Excel reconegui UTF-8
  return '\uFEFF' + lines.join('\r\n');
}

// ---------- PDF: llista ----------
export function pdfList(rows, { from, to }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });

  doc.fontSize(18).fillColor('#111').text('Registre de tensió arterial', { align: 'left' });
  doc.moveDown(0.2);
  doc.fontSize(10).fillColor('#666')
     .text(`Període: ${from} a ${to}   ·   ${rows.length} lectures`);
  doc.moveDown(0.8);

  // estadístiques resum
  if (rows.length) {
    const avg = (k) => Math.round(rows.reduce((a, r) => a + r[k], 0) / rows.length);
    const pulses = rows.filter(r => r.pulse).map(r => r.pulse);
    const avgPulse = pulses.length ? Math.round(pulses.reduce((a, b) => a + b, 0) / pulses.length) : null;
    doc.fontSize(10).fillColor('#111').text(
      `Mitjana: ${avg('systolic')}/${avg('diastolic')} mmHg` +
      (avgPulse ? `   ·   Pols mitjà: ${avgPulse} ppm` : '')
    );
    doc.moveDown(0.6);
  }

  // capçalera de taula
  const cols = [
    { t: 'Data', x: 40, w: 80 },
    { t: 'Hora', x: 120, w: 45 },
    { t: 'Sist.', x: 165, w: 45 },
    { t: 'Diast.', x: 210, w: 45 },
    { t: 'Pols', x: 255, w: 45 },
    { t: 'Classificació', x: 300, w: 255 },
  ];

  const drawHeader = () => {
    doc.fontSize(9).fillColor('#fff');
    doc.rect(40, doc.y, 515, 18).fill('#334155');
    const y = doc.y + 5;
    cols.forEach(c => doc.fillColor('#fff').text(c.t, c.x + 3, y, { width: c.w - 6 }));
    doc.y += 18;
    doc.fillColor('#111');
  };

  drawHeader();

  let zebra = false;
  for (const r of rows) {
    if (doc.y > 780) { doc.addPage(); drawHeader(); zebra = false; }
    const cat = classify(r.systolic, r.diastolic);
    const rowY = doc.y;
    const rowH = 16;
    if (zebra) { doc.rect(40, rowY, 515, rowH).fill('#f1f5f9'); doc.fillColor('#111'); }
    zebra = !zebra;
    const ty = rowY + 4;
    doc.fontSize(8.5).fillColor('#111');
    doc.text(r.date, cols[0].x + 3, ty, { width: cols[0].w - 6 });
    doc.text(r.time, cols[1].x + 3, ty, { width: cols[1].w - 6 });
    doc.text(String(r.systolic), cols[2].x + 3, ty, { width: cols[2].w - 6 });
    doc.text(String(r.diastolic), cols[3].x + 3, ty, { width: cols[3].w - 6 });
    doc.text(r.pulse ? String(r.pulse) : '—', cols[4].x + 3, ty, { width: cols[4].w - 6 });
    doc.fillColor(cat.color).text(cat.label, cols[5].x + 3, ty, { width: cols[5].w - 6 });
    doc.y = rowY + rowH;
  }

  doc.end();
  return doc;
}

// ---------- PDF: calendari mensual ----------
export function pdfCalendar(rows, { from, to }) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });

  // agrupa lectures per dia
  const byDay = new Map();
  for (const r of rows) {
    if (!byDay.has(r.date)) byDay.set(r.date, []);
    byDay.get(r.date).push(r);
  }

  // determina els mesos a pintar a partir del rang
  const months = new Set();
  for (const d of daysBetween(from, to)) months.add(d.slice(0, 7)); // YYYY-MM

  const monthList = [...months].sort();
  monthList.forEach((ym, idx) => {
    if (idx > 0) doc.addPage();
    drawMonth(doc, ym, byDay);
  });

  if (monthList.length === 0) {
    doc.fontSize(14).text('No hi ha dades per al període seleccionat.');
  }

  doc.end();
  return doc;
}

function drawMonth(doc, ym, byDay) {
  const [y, m] = ym.split('-').map(Number);
  const pageW = doc.page.width - 60;
  const startX = 30;
  let startY = 40;

  doc.fontSize(18).fillColor('#111')
     .text(`${MONTHS_CA[m - 1]} ${y}`, startX, startY);
  startY += 30;

  const cols = 7;
  const cellW = pageW / cols;
  const cellH = 95;

  // capçalera dies de la setmana
  doc.fontSize(9).fillColor('#475569');
  WEEKDAYS_CA.forEach((wd, i) => {
    doc.text(wd.toUpperCase(), startX + i * cellW + 4, startY, { width: cellW - 8 });
  });
  startY += 16;

  // primer dia del mes; setmana comença en dilluns
  const first = new Date(y, m - 1, 1);
  let weekday = (first.getDay() + 6) % 7; // 0 = dilluns
  const daysInMonth = new Date(y, m, 0).getDate();

  let col = weekday;
  let rowY = startY;

  for (let day = 1; day <= daysInMonth; day++) {
    const x = startX + col * cellW;
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const readings = byDay.get(dateStr) || [];

    // cel·la
    doc.rect(x, rowY, cellW - 2, cellH).fillAndStroke('#ffffff', '#e2e8f0');
    doc.fontSize(10).fillColor('#0f172a').text(String(day), x + 4, rowY + 3, { width: cellW - 8 });

    // resum del dia
    if (readings.length) {
      const sAvg = Math.round(readings.reduce((a, r) => a + r.systolic, 0) / readings.length);
      const dAvg = Math.round(readings.reduce((a, r) => a + r.diastolic, 0) / readings.length);
      const cat = classify(sAvg, dAvg);

      // pastilla de color amb la mitjana
      doc.roundedRect(x + 4, rowY + 16, cellW - 10, 16, 3).fill(cat.color);
      doc.fontSize(9).fillColor('#fff')
         .text(`${sAvg}/${dAvg}`, x + 6, rowY + 19, { width: cellW - 14 });

      // llista compacta de lectures (màx 4)
      doc.fontSize(7).fillColor('#334155');
      let ly = rowY + 36;
      readings.slice(0, 4).forEach(r => {
        doc.text(`${r.time}  ${r.systolic}/${r.diastolic}${r.pulse ? ' · ' + r.pulse : ''}`,
                 x + 5, ly, { width: cellW - 10 });
        ly += 9;
      });
      if (readings.length > 4) {
        doc.fillColor('#94a3b8').text(`+${readings.length - 4} més`, x + 5, ly, { width: cellW - 10 });
      }
    }

    col++;
    if (col === 7) { col = 0; rowY += cellH; }
  }
}
