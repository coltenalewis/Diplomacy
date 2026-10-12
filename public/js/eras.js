// The ten ages of history, the world calendar, and per-age scaling.

export const AGES = [
  { key: 'stone', name: 'Stone Age', short: 'Stone', from: -10000, to: -3500, color: '#c2a37e', blurb: 'Bands of hunters and gatherers. The first villages, pottery and farms.' },
  { key: 'bronze', name: 'Bronze Age', short: 'Bronze', from: -3500, to: -1200, color: '#d89a54', blurb: 'Cities, writing, chariots and god-kings. Copper and tin are power.' },
  { key: 'iron', name: 'Iron Age', short: 'Iron', from: -1200, to: -500, color: '#9aa3ad', blurb: 'Iron weapons for the many, alphabets, coinage and the first empires.' },
  { key: 'classical', name: 'Classical Age', short: 'Classical', from: -500, to: 500, color: '#e3c77a', blurb: 'Philosophy, law, legions and roads. Empires that span continents.' },
  { key: 'medieval', name: 'Medieval Age', short: 'Medieval', from: 500, to: 1450, color: '#8f6fb5', blurb: 'Castles, feudal lords, great faiths and the Silk Road.' },
  { key: 'renaissance', name: 'Age of Discovery', short: 'Discovery', from: 1450, to: 1750, color: '#5aa7c7', blurb: 'Gunpowder, printing presses and ocean-going ships. The world opens.' },
  { key: 'industrial', name: 'Industrial Age', short: 'Industrial', from: 1750, to: 1900, color: '#c97a4a', blurb: 'Steam, coal, railways and factories. Nations become machines.' },
  { key: 'modern', name: 'Modern Age', short: 'Modern', from: 1900, to: 1945, color: '#7f9a5a', blurb: 'Electricity, oil, tanks and aircraft. Total war.' },
  { key: 'atomic', name: 'Atomic Age', short: 'Atomic', from: 1945, to: 1990, color: '#e0c33a', blurb: 'The bomb, jets, rockets and the race to space.' },
  { key: 'information', name: 'Information Age', short: 'Information', from: 1990, to: 2100, color: '#57d2ff', blurb: 'Computers, networks, artificial intelligence and the stars.' },
];
export const NAGES = AGES.length;

// economic scale of an age: unit and building costs, yields and upkeep grow with it
export const ageScale = a => Math.pow(1.75, a);
// research cost of a technology in an age
export const techCost = a => Math.round((a === 0 ? 10 : 14) * Math.pow(2.5, a));

// calendar
export function yearStr(y) {
  if (y < 0) { const v = -y; return (v >= 1000 ? Math.round(v / 10) * 10 : Math.round(v)).toLocaleString('en-US') + ' BC'; }
  return y < 1000 ? 'AD ' + Math.max(1, Math.round(y)) : String(Math.floor(y));
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dateStr(y, age = 0) {
  if (y < 1500 || age < 6) return yearStr(y);
  const m = Math.floor(((y % 1) + 1) % 1 * 12);
  return `${MONTHS[m]} ${Math.floor(y)}`;
}
// years that pass per game day when the most advanced civilization is in age `a`
export const YEARS_PER_DAY = [24, 13, 6, 6, 5.5, 2.6, 1.4, 0.55, 0.45, 0.32];
