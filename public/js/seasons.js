// Seasons run on the same calendar as the sun: game hour 0 is 1 January 2025, a year is 365 game days.
// Everything here is hemisphere-aware and fades out toward the equator, where there is no real winter.
const DOY0 = 0; // 1 January

export function dayOfYear(t) { return ((DOY0 + t / 24) % 365 + 365) % 365; }
// -1 at the depth of northern summer, +1 at the depth of northern winter (21 Dec)
function northWinter(t) { return Math.cos(2 * Math.PI * (dayOfYear(t) - 355) / 365); }
const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
// how much a latitude feels the seasons at all
export function seasonality(lat) { return smooth(18, 50, Math.abs(lat)); }
// -1 high summer .. +1 deep winter at this latitude
export function winterness(lat, t) { return (lat >= 0 ? 1 : -1) * northWinter(t); }
// 0..1 harshness of winter for armies and travel
export function cold(lat, t) { return Math.max(0, winterness(lat, t)) * smooth(30, 62, Math.abs(lat)); }
// harvest multiplier: richer summers, lean winters; averages to 1 over the year
export function harvest(lat, t) { return 1 - 0.3 * winterness(lat, t) * seasonality(lat); }

const NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];
export const SEASON_ICON = { Spring: '🌱', Summer: '☀️', Autumn: '🍂', Winter: '❄️', Wet: '🌧️', Dry: '🌤️' };
// season name at a latitude; the tropics get a wet and a dry season instead
export function seasonName(lat, t) {
  const d = dayOfYear(t), south = lat < 0;
  if (Math.abs(lat) < 18) { const wet = (Math.sin(2 * Math.PI * (d - 79) / 365) > 0) !== south; return wet ? 'Wet' : 'Dry'; }
  const q = Math.floor((((d - 60 + 365) % 365) / 365) * 4); // meteorological: spring from 1 March, winter Dec-Feb
  return NAMES[(q + (south ? 2 : 0)) % 4];
}
