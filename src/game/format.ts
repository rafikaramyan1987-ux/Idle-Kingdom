const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Big, friendly numbers: 999, 1.2K, 34.5M, 120B … */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '∞';
  const sign = value < 0 ? '-' : '';
  let v = Math.abs(value);
  if (v < 1000) {
    if (v < 10 && v % 1 !== 0) return sign + (Math.floor(v * 10) / 10).toString();
    return sign + Math.floor(v).toString();
  }
  let tier = 0;
  while (v >= 1000 && tier < SUFFIXES.length - 1) {
    v /= 1000;
    tier++;
  }
  // Truncate instead of rounding so 999.96K never shows as "1000K".
  const digits = v >= 100 ? 0 : 1;
  const f = Math.pow(10, digits);
  const shown = Math.floor(v * f) / f;
  return sign + shown.toFixed(digits).replace(/\.0$/, '') + SUFFIXES[tier];
}

export function formatRate(perSecond: number): string {
  if (perSecond <= 0) return '0/s';
  if (perSecond < 1) return `${formatNumber(perSecond * 60)}/m`;
  return `${formatNumber(perSecond)}/s`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${(s % 60).toString().padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60).toString().padStart(2, '0')}m`;
}
