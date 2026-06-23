// Classificació de la pressió arterial segons categories habituals (ESC/ESH).
// Es classifica pel valor més desfavorable entre sistòlica i diastòlica.
export function classify(systolic, diastolic) {
  const s = Number(systolic);
  const d = Number(diastolic);

  if (s >= 180 || d >= 120) return { key: 'crisi',       label: 'Crisi hipertensiva',  color: '#7f1d1d' };
  if (s >= 160 || d >= 100) return { key: 'hta2',        label: 'Hipertensió grau 2',  color: '#b91c1c' };
  if (s >= 140 || d >= 90)  return { key: 'hta1',        label: 'Hipertensió grau 1',  color: '#ea580c' };
  if (s >= 130 || d >= 85)  return { key: 'normal-alta', label: 'Normal-alta',         color: '#ca8a04' };
  if (s >= 120 || d >= 80)  return { key: 'normal',      label: 'Normal',              color: '#16a34a' };
  if (s < 90  || d < 60)    return { key: 'baixa',       label: 'Baixa',               color: '#2563eb' };
  return { key: 'optima', label: 'Òptima', color: '#15803d' };
}

// Genera la llista de dies YYYY-MM-DD entre dues dates (incloses).
export function daysBetween(fromStr, toStr) {
  const out = [];
  const from = new Date(fromStr + 'T00:00:00');
  const to = new Date(toStr + 'T00:00:00');
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    out.push(isoDate(d));
  }
  return out;
}

export function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const MONTHS_CA = [
  'gener', 'febrer', 'març', 'abril', 'maig', 'juny',
  'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre'
];

export const WEEKDAYS_CA = ['dl', 'dt', 'dc', 'dj', 'dv', 'ds', 'dg'];
