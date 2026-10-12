// Formable nations: historical empires and modern states that a civilization can proclaim
// once it controls the right lands in the right age.

const MED = ['Spain', 'France', 'Greece', 'Turkey', 'Tunisia', 'Egypt', 'Syria', 'Portugal', 'Algeria', 'Libya', 'Israel', 'Lebanon', 'Croatia', 'Albania', 'Bulgaria', 'Romania', 'Morocco', 'Jordan', 'Serbia'];
const EU = ['France', 'Germany', 'Italy', 'Spain', 'Portugal', 'Netherlands', 'Belgium', 'Austria', 'Poland', 'Czechia', 'Slovakia', 'Hungary', 'Romania', 'Bulgaria', 'Greece', 'Sweden', 'Finland', 'Denmark', 'Ireland', 'Croatia', 'Slovenia', 'Lithuania', 'Latvia', 'Estonia', 'Luxembourg', 'Cyprus', 'Malta'];

// sets: every set must be satisfied. A set is { countries, box:[lat0,lat1,lon0,lon1], share } or { overseas: n } (tiles on other continents).
export const FORMABLES = [
  { id: 'egypt', name: 'Kemet', adj: 'Egyptian', title: 'Kingdom of the Two Lands', minAge: 1, maxAge: 4, sets: [{ countries: ['Egypt'], share: 0.6 }], fx: { food: 0.08, stability: 0.004 }, desc: 'Unite Upper and Lower Egypt along the Nile.' },
  { id: 'akkad', name: 'Akkad', adj: 'Akkadian', title: 'Akkadian Empire', minAge: 1, maxAge: 3, sets: [{ countries: ['Iraq'], share: 0.75 }, { countries: ['Syria', 'Kuwait', 'Iran'], share: 0.15 }], fx: { wealth: 0.06, pc: 0.1 }, desc: 'The first empire: master Mesopotamia.' },
  { id: 'hatti', name: 'Hatti', adj: 'Hittite', title: 'Hittite Empire', minAge: 1, maxAge: 3, sets: [{ countries: ['Turkey'], share: 0.55 }], fx: { metal: 0.1, atkLand: 0.04 }, desc: 'Rule the Anatolian plateau and its iron.' },
  { id: 'shang', name: 'Shang', adj: 'Shang', title: 'Shang Dynasty', minAge: 1, maxAge: 2, sets: [{ countries: ['China'], box: [30, 41, 105, 122], share: 0.6 }], fx: { research: 0.06, stability: 0.004 }, desc: 'Bronze and oracle bones on the Yellow River.' },
  { id: 'persia', name: 'Persia', adj: 'Persian', title: 'Persian Empire', minAge: 2, maxAge: 6, sets: [{ countries: ['Iran'], share: 0.75 }, { countries: ['Iraq', 'Afghanistan', 'Turkey', 'Syria', 'Egypt', 'Pakistan', 'Turkmenistan', 'Uzbekistan', 'Armenia', 'Azerbaijan'], share: 0.3 }], fx: { garrison: 0.15, wealth: 0.08, diplo: 0.05 }, desc: 'King of Kings from the Indus to the Aegean.' },
  { id: 'macedon', name: 'Macedon', adj: 'Macedonian', title: 'Macedonian Empire', minAge: 3, maxAge: 4, sets: [{ countries: ['Greece'], share: 1 }, { countries: ['Turkey', 'Egypt', 'Iran', 'Iraq', 'Syria'], share: 0.35 }], fx: { atkLand: 0.08, xp: 0.2 }, desc: 'The heirs of Alexander.' },
  { id: 'rome', name: 'Rome', adj: 'Roman', title: 'Roman Empire', minAge: 3, maxAge: 5, sets: [{ countries: ['Italy'], share: 0.9 }, { countries: MED, share: 0.4 }], fx: { garrison: 0.2, build: 0.1, stability: 0.004, speedLand: 0.1 }, desc: 'Mare Nostrum: the Mediterranean is a Roman lake.' },
  { id: 'carthage', name: 'Carthage', adj: 'Carthaginian', title: 'Carthaginian Republic', minAge: 2, maxAge: 4, sets: [{ countries: ['Tunisia'], share: 1 }, { countries: ['Algeria', 'Libya', 'Spain', 'Morocco'], share: 0.3 }], fx: { wealth: 0.1, tradeBonus: 0.15, speedSea: 0.1 }, desc: 'Merchant empire of the western sea.' },
  { id: 'maurya', name: 'Magadha', adj: 'Mauryan', title: 'Maurya Empire', minAge: 3, maxAge: 5, sets: [{ countries: ['India'], share: 0.55 }], fx: { food: 0.08, stability: 0.006 }, desc: 'Unite the Indian subcontinent.' },
  { id: 'han', name: 'Han', adj: 'Han', title: 'Han Empire', minAge: 3, maxAge: 6, sets: [{ countries: ['China'], box: [18, 42, 100, 125], share: 0.7 }], fx: { research: 0.08, wealth: 0.06, stability: 0.005 }, desc: 'All under Heaven.' },
  { id: 'aksum', name: 'Aksum', adj: 'Aksumite', title: 'Kingdom of Aksum', minAge: 3, maxAge: 5, sets: [{ countries: ['Ethiopia', 'Eritrea'], share: 0.6 }, { countries: ['Yemen', 'Sudan'], share: 0.25 }], fx: { tradeBonus: 0.15, wealth: 0.06 }, desc: 'Masters of the Red Sea trade.' },
  { id: 'byzantium', name: 'Byzantium', adj: 'Byzantine', title: 'Byzantine Empire', minAge: 4, maxAge: 5, sets: [{ countries: ['Greece', 'Turkey'], share: 0.7 }], fx: { garrison: 0.25, diplo: 0.1 }, desc: 'The eastern Roman Empire endures.' },
  { id: 'caliphate', name: 'Caliphate', adj: 'Abbasid', title: 'Abbasid Caliphate', minAge: 4, maxAge: 5, sets: [{ countries: ['Saudi Arabia'], share: 0.5 }, { countries: ['Iraq', 'Syria', 'Egypt', 'Jordan', 'Israel'], share: 0.6 }], fx: { research: 0.1, wealth: 0.06, stability: 0.004 }, desc: 'The House of Wisdom and the golden age of learning.' },
  { id: 'hre', name: 'the Empire', adj: 'Imperial', title: 'Holy Roman Empire', minAge: 4, maxAge: 5, sets: [{ countries: ['Germany'], share: 0.8 }, { countries: ['Austria', 'Czechia', 'Netherlands', 'Belgium', 'Switzerland', 'Italy'], share: 0.35 }], fx: { pc: 0.15, manpower: 0.2 }, desc: 'Neither holy, nor Roman, nor an empire.' },
  { id: 'mongol', name: 'Mongolia', adj: 'Mongol', title: 'Mongol Empire', minAge: 4, maxAge: 5, sets: [{ countries: ['Mongolia'], share: 0.9 }, { countries: ['China', 'Russia', 'Kazakhstan', 'Iran', 'Uzbekistan', 'Afghanistan'], share: 0.22 }], fx: { speedLand: 0.25, atkLand: 0.08 }, desc: 'From the steppe to every horizon.' },
  { id: 'mali', name: 'Mali', adj: 'Malian', title: 'Mali Empire', minAge: 4, maxAge: 5, sets: [{ countries: ['Mali', 'Senegal', 'Guinea', 'Mauritania', 'Niger', 'Burkina Faso', 'Gambia'], share: 0.55 }], fx: { wealth: 0.15 }, desc: 'Gold and salt and the scholars of Timbuktu.' },
  { id: 'khmer', name: 'Kambuja', adj: 'Khmer', title: 'Khmer Empire', minAge: 4, maxAge: 5, sets: [{ countries: ['Cambodia', 'Thailand', 'Laos', 'Vietnam'], share: 0.5 }], fx: { food: 0.12, build: 0.1 }, desc: 'Angkor and its great reservoirs.' },
  { id: 'inca', name: 'Tawantinsuyu', adj: 'Inca', title: 'Inca Empire', minAge: 3, maxAge: 5, sets: [{ countries: ['Peru'], share: 0.75 }, { countries: ['Bolivia', 'Ecuador', 'Chile'], share: 0.3 }], fx: { food: 0.1, speedLand: 0.1, stability: 0.004 }, desc: 'The Four Regions, bound by mountain roads.' },
  { id: 'aztec', name: 'Mexica', adj: 'Aztec', title: 'Aztec Empire', minAge: 3, maxAge: 5, sets: [{ countries: ['Mexico'], box: [14, 24, -106, -86], share: 0.7 }], fx: { food: 0.08, atkLand: 0.06 }, desc: 'The Triple Alliance of the Valley of Mexico.' },
  { id: 'maya', name: 'Mutul', adj: 'Maya', title: 'Maya Confederation', minAge: 2, maxAge: 4, sets: [{ countries: ['Guatemala', 'Belize', 'Honduras'], share: 0.6 }, { countries: ['Mexico'], box: [14, 22, -92, -86], share: 0.5 }], fx: { research: 0.08 }, desc: 'Astronomers and city-states of the jungle.' },
  { id: 'japan', name: 'Nippon', adj: 'Japanese', title: 'Empire of Japan', minAge: 4, maxAge: 9, sets: [{ countries: ['Japan'], share: 0.9 }], fx: { stability: 0.006, prod: 0.06 }, desc: 'Unite the home islands.' },
  { id: 'russia', name: 'Rus', adj: 'Russian', title: 'Tsardom of Russia', minAge: 4, maxAge: 6, sets: [{ countries: ['Russia'], box: [45, 65, 25, 60], share: 0.6 }], fx: { manpower: 0.25, defLand: 0.06 }, desc: 'Gather the Russian lands.' },
  { id: 'mughal', name: 'Hindustan', adj: 'Mughal', title: 'Mughal Empire', minAge: 5, maxAge: 6, sets: [{ countries: ['India', 'Pakistan', 'Bangladesh'], share: 0.6 }, { countries: ['Afghanistan'], share: 0.3 }], fx: { wealth: 0.12, approval: 0.03 }, desc: 'Splendour on the Ganges.' },
  { id: 'ottoman', name: 'Osman', adj: 'Ottoman', title: 'Ottoman Empire', minAge: 5, maxAge: 6, sets: [{ countries: ['Turkey'], share: 0.9 }, { countries: ['Greece', 'Bulgaria', 'Romania', 'Serbia', 'Egypt', 'Syria', 'Iraq', 'Saudi Arabia', 'Libya', 'Tunisia', 'Algeria'], share: 0.3 }], fx: { garrison: 0.15, manpower: 0.2, wealth: 0.05 }, desc: 'The Sublime Porte rules three continents.' },
  { id: 'spain_emp', name: 'Spain', adj: 'Spanish', title: 'Spanish Empire', minAge: 5, maxAge: 6, sets: [{ countries: ['Spain', 'Portugal'], share: 0.9 }, { overseas: 12 }], fx: { wealth: 0.1, claimCost: -0.1 }, desc: 'An empire on which the sun never sets.' },
  { id: 'britain', name: 'Britain', adj: 'British', title: 'British Empire', minAge: 6, maxAge: 7, sets: [{ countries: ['United Kingdom', 'Ireland'], share: 1 }, { overseas: 35 }], fx: { wealth: 0.1, speedSea: 0.15, atkSea: 0.08 }, desc: 'Rule the waves.' },
  { id: 'usa', name: 'America', adj: 'American', title: 'United States of America', minAge: 6, maxAge: 9, sets: [{ countries: ['United States of America'], box: [24, 50, -125, -66], share: 0.8 }], fx: { wealth: 0.1, research: 0.06, approval: 0.03 }, desc: 'From sea to shining sea.' },
  { id: 'ussr', name: 'the Union', adj: 'Soviet', title: 'Union of Soviet Socialist Republics', minAge: 7, maxAge: 8, gov: 'oneparty', sets: [{ countries: ['Russia'], share: 0.8 }, { countries: ['Ukraine', 'Belarus', 'Kazakhstan', 'Uzbekistan', 'Georgia', 'Armenia', 'Azerbaijan', 'Lithuania', 'Latvia', 'Estonia', 'Turkmenistan', 'Kyrgyzstan', 'Tajikistan', 'Moldova'], share: 0.6 }], fx: { prod: 0.15, manpower: 0.3 }, desc: 'Workers of the world, unite.' },
  { id: 'eu', name: 'Europe', adj: 'European', title: 'European Union', minAge: 9, sets: [{ countries: EU, share: 0.6 }], fx: { wealth: 0.12, diplo: 0.2, research: 0.06 }, desc: 'Ever closer union.' },
  { id: 'arab_league', name: 'Arabia', adj: 'Arab', title: 'United Arab Republic', minAge: 7, sets: [{ countries: ['Saudi Arabia', 'Egypt', 'Iraq', 'Syria', 'Jordan', 'Yemen', 'Oman', 'Libya'], share: 0.6 }], fx: { oil: 0.2, wealth: 0.06 }, desc: 'Pan-Arab unity.' },
  { id: 'gran_colombia', name: 'Colombia', adj: 'Colombian', title: 'Gran Colombia', minAge: 6, sets: [{ countries: ['Colombia', 'Venezuela', 'Ecuador', 'Panama'], share: 0.7 }], fx: { wealth: 0.06, stability: 0.004 }, desc: 'Bolívar\'s dream.' },
];

// generic modern nation-states: any modern country of 3+ tiles
const ADJ = { 'United States of America': 'American', Russia: 'Russian', China: 'Chinese', India: 'Indian', Brazil: 'Brazilian', Canada: 'Canadian', Australia: 'Australian', France: 'French', Germany: 'German', 'United Kingdom': 'British', Japan: 'Japanese', Mexico: 'Mexican', Argentina: 'Argentine', Spain: 'Spanish', Italy: 'Italian', Turkey: 'Turkish', Iran: 'Iranian', Egypt: 'Egyptian', 'Saudi Arabia': 'Saudi', Indonesia: 'Indonesian', Nigeria: 'Nigerian', 'South Africa': 'South African', Pakistan: 'Pakistani', Kazakhstan: 'Kazakh', Peru: 'Peruvian', Colombia: 'Colombian', Chile: 'Chilean', 'Dem. Rep. Congo': 'Congolese', Ethiopia: 'Ethiopian', Ukraine: 'Ukrainian', Poland: 'Polish', Sweden: 'Swedish', Norway: 'Norwegian', Finland: 'Finnish', Mongolia: 'Mongolian', Thailand: 'Thai', Vietnam: 'Vietnamese', Philippines: 'Filipino', Iraq: 'Iraqi', Syria: 'Syrian', Afghanistan: 'Afghan', Sudan: 'Sudanese', Algeria: 'Algerian', Libya: 'Libyan', Morocco: 'Moroccan', Kenya: 'Kenyan', Tanzania: 'Tanzanian', Venezuela: 'Venezuelan', Bolivia: 'Bolivian', Greece: 'Greek', Romania: 'Romanian', 'New Zealand': 'New Zealand', Madagascar: 'Malagasy', Angola: 'Angolan', Mozambique: 'Mozambican', Myanmar: 'Burmese', Malaysia: 'Malaysian', 'Papua New Guinea': 'Papuan', Greenland: 'Greenlandic' };
export function modernFormables(tilesByCountry) {
  const out = [];
  for (const [c, n] of Object.entries(tilesByCountry)) {
    if (n < 3) continue;
    const adj = ADJ[c] || (c.endsWith('a') ? c + 'n' : c + 'ian');
    out.push({ id: 'm:' + c, name: c.replace('Dem. Rep. ', 'Democratic Republic of the ').replace('United States of America', 'America'), adj, title: c.replace('Dem. Rep.', 'Democratic Republic of the'), minAge: 6, sets: [{ countries: [c], share: 0.85 }], fx: { stability: 0.004, approval: 0.03 }, desc: `Proclaim the modern nation of ${c}.`, modern: true });
  }
  return out;
}

const AMERICAS = t => t.lon < -30;
const EURAFRASIA = t => t.lon >= -30 && !(t.lon > 110 && t.lat < -10);
const AUSTRALIA = t => t.lon > 110 && t.lat < -10;
export const continentOf = t => (AMERICAS(t) ? 'americas' : AUSTRALIA(t) ? 'oceania' : EURAFRASIA(t) ? 'old' : 'old');

// progress toward a formable: { ok, parts:[{label, have, need}] }
export function formProgress(sim, N, F) {
  const s = sim.s, w = sim.w;
  const parts = [];
  let ok = true;
  for (const set of F.sets) {
    if (set.overseas) {
      const home = continentOf(w.regions[N.capital]);
      const n = sim.regionsOf(N.code).filter(r => continentOf(w.regions[r.i]) !== home).length;
      parts.push({ label: 'Overseas territories', have: n, need: set.overseas }); if (n < set.overseas) ok = false;
      continue;
    }
    const tiles = sim.countryTiles(set.countries, set.box);
    const mine = tiles.filter(i => s.regions[i].owner === N.code).length;
    const need = Math.ceil(tiles.length * set.share);
    parts.push({ label: set.countries.length > 3 ? `${set.countries.slice(0, 3).join(', ')} and others` : set.countries.join(', '), have: mine, need });
    if (mine < need || !tiles.length) ok = false;
  }
  if (N.age < F.minAge || (F.maxAge !== undefined && N.age > F.maxAge)) ok = false;
  if (F.gov && N.gov.type !== F.gov) ok = false;
  if (s.formed?.[F.id]) ok = false;
  return { ok, parts };
}
