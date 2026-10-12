// Culture-flavoured names for civilizations and their people, generated from syllables.

const CULTURES = {
  nile: { on: ['ka', 'me', 'ne', 'ta', 'hu', 'se', 'ra', 'ankh', 'nef', 'tep', 'wa', 'ti', 'sen', 'mer', 'pa'], end: ['ret', 'tep', 'mose', 'hotep', 'kare', 'et', 'u', 'is', 'ra', 'nu'], adj: 'ian' },
  semitic: { on: ['ur', 'ak', 'ka', 'ba', 'ash', 'nin', 'mar', 'sha', 'ha', 'za', 'el', 'lu', 'gal', 'ki', 'id'], end: ['ad', 'ur', 'ash', 'an', 'is', 'ar', 'ub', 'esh', 'ia', 'um'], adj: 'ian' },
  iranian: { on: ['par', 'da', 'ar', 'ku', 'xer', 'mi', 'zar', 'ba', 'kho', 'sa', 've', 'ro'], end: ['ush', 'ran', 'es', 'dan', 'pa', 'tan', 'iya', 'sht', 'ak'], adj: 'ian' },
  indic: { on: ['ma', 'ha', 'su', 'ka', 'vi', 'ra', 'ga', 'chan', 'pa', 'dha', 'sri', 'in', 'ku'], end: ['dha', 'pur', 'ra', 'ya', 'ta', 'ndra', 'shi', 'kar', 'la', 'na'], adj: 'an' },
  sinitic: { on: ['xia', 'shang', 'zhou', 'qin', 'han', 'wei', 'jin', 'song', 'liang', 'chu', 'yan', 'zhao', 'lu', 'wu', 'shu'], end: [''], adj: '', mono: true },
  eastasian: { on: ['ya', 'ma', 'to', 'ka', 'mi', 'na', 'go', 'se', 'ha', 'ri', 'ko', 'jo', 'sil', 'baek'], end: ['to', 'mi', 'shi', 'ra', 'ke', 'jo', 'ka', 'gu', 'ryeo', 'la'], adj: 'ese' },
  steppe: { on: ['kha', 'tur', 'oy', 'ba', 'tem', 'jo', 'kip', 'sar', 'ul', 'ar', 'bo', 'ta', 'kar'], end: ['gan', 'kh', 'ar', 'chi', 'tai', 'ul', 'at', 'uz', 'il', 'mak'], adj: '' },
  slavic: { on: ['vla', 'mir', 'bor', 'ra', 'sla', 'kie', 'no', 'lu', 'po', 'vo', 'dra', 'ya', 'zo'], end: ['via', 'grad', 'slav', 'ov', 'ka', 'ny', 'ia', 'mir', 'ska', 'ets'], adj: 'ian' },
  hellenic: { on: ['ath', 'ko', 'my', 'the', 'spa', 'ar', 'kle', 'ly', 'phi', 'de', 'he', 'mi', 'po'], end: ['os', 'ene', 'ia', 'kles', 'ta', 'on', 'ai', 'nos', 'ope', 'is'], adj: 'ean' },
  anatolian: { on: ['hat', 'lu', 'ka', 'mi', 'ur', 'phry', 'ly', 'ta', 'ar', 'kar', 'su', 'ne'], end: ['tusa', 'wiya', 'ia', 'ash', 'ni', 'kes', 'ara', 'ian', 'tu'], adj: 'ian' },
  latin: { on: ['ro', 'au', 'va', 'lu', 'ca', 'ma', 'ju', 'fla', 'cor', 'ser', 'ta', 'ae', 'li'], end: ['ia', 'us', 'um', 'ius', 'ina', 'ica', 'ana', 'esia', 'onia'], adj: 'an' },
  germanic: { on: ['al', 'bur', 'fri', 'go', 'sax', 'ger', 'wil', 'thu', 'hal', 'ost', 'nor', 'swe', 'dan', 'an'], end: ['mark', 'land', 'helm', 'ric', 'ia', 'gard', 'heim', 'wald', 'burg'], adj: 'ish' },
  celtic: { on: ['bri', 'ga', 'ca', 'do', 'ar', 'ber', 'eir', 'mo', 'tu', 'cym', 'ul', 'vel'], end: ['tan', 'ia', 'nach', 'ric', 'dun', 'more', 'gal', 'ain', 'on'], adj: 'ic' },
  bantu: { on: ['ka', 'zu', 'mbo', 'nde', 'lu', 'shi', 'ma', 'ko', 'ba', 'tu', 'nya', 'ngo', 'swa'], end: ['ba', 'ngo', 'lu', 'nda', 'si', 'mba', 'we', 'zi', 'ti', 'ka'], adj: '' },
  westafrican: { on: ['ma', 'son', 'ga', 'ka', 'yo', 'ba', 'kan', 'wo', 'fu', 'ha', 'asa', 'oy', 'be'], end: ['li', 'ghai', 'na', 'em', 'ruba', 'ni', 'ko', 'te', 'sa', 'bo'], adj: 'an' },
  ethiopic: { on: ['ak', 'sum', 'ge', 'ze', 'la', 'te', 'da', 'ma', 'ab', 'ha', 'kush', 'me'], end: ['sum', 'ez', 'ra', 'ya', 'wi', 'nat', 'roe', 'ba', 'te'], adj: 'ite' },
  berber: { on: ['ta', 'ma', 'nu', 'ga', 'za', 'ka', 'mu', 'ti', 'gar', 'amaz', 'ifr', 'tu'], end: ['midia', 'ra', 'ghen', 'ama', 'tan', 'set', 'igh', 'ar', 'ni'], adj: 'ian' },
  mesoamerican: { on: ['tla', 'ma', 'xo', 'te', 'chi', 'ol', 'za', 'mix', 'to', 'pa', 'que', 'ku', 'itz'], end: ['tec', 'can', 'pan', 'tlan', 'huac', 'ya', 'mec', 'co', 'hil', 'tl'], adj: '' },
  andean: { on: ['in', 'ca', 'qui', 'chi', 'mo', 'wa', 'ti', 'na', 'cha', 'pa', 'hua', 'ay', 'cu'], end: ['ca', 'mu', 'ri', 'su', 'pa', 'ya', 'wanaku', 'vin', 'zco', 'ra'], adj: '' },
  amazonian: { on: ['tu', 'pi', 'gua', 'ra', 'ca', 'ma', 'ya', 'ta', 'ara', 'ji', 'ka', 'ba'], end: ['pi', 'ni', 'ra', 'wak', 'na', 'ba', 'ja', 'ke', 'ri', 'ta'], adj: '' },
  northamerican: { on: ['cho', 'mo', 'ka', 'sha', 'wa', 'che', 'lak', 'pa', 'ha', 'mi', 'si', 'ta', 'na'], end: ['kee', 'tah', 'wa', 'nee', 'pi', 'kota', 'ho', 'shi', 'go', 'mac'], adj: '' },
  austronesian: { on: ['ma', 'ja', 'su', 'ta', 'ka', 'ba', 'la', 'pa', 'ra', 'sri', 'nu', 'ha', 'to'], end: ['pahit', 'wa', 'tra', 'lu', 'ka', 'nga', 'ya', 'vi', 'ao', 'ni'], adj: 'an' },
  seasian: { on: ['kh', 'an', 'cham', 'pa', 'sia', 'la', 'da', 'vi', 'ayu', 'pe', 'ta', 'su'], end: ['mer', 'kor', 'pa', 'am', 'vat', 'gu', 'thaya', 'ya', 'na'], adj: 'ese' },
  australian: { on: ['wi', 'ya', 'gu', 'ka', 'mu', 'ar', 'wa', 'bi', 'ta', 'ngu', 'pi', 'yu'], end: ['rri', 'ra', 'ndi', 'lu', 'nga', 'rra', 'ba', 'jarra', 'ri'], adj: '' },
  arctic: { on: ['in', 'nu', 'ka', 'ta', 'si', 'qa', 'ul', 'pu', 'ki', 'a'], end: ['nuk', 'vik', 'uit', 'luk', 'naq', 'tuk', 'miut'], adj: '' },
};
const COUNTRY_CULTURE = {
  nile: 'Egypt Sudan S. Sudan',
  semitic: 'Iraq Syria Lebanon Israel Jordan Saudi Arabia Yemen Oman United Arab Emirates Kuwait Qatar Palestine',
  iranian: 'Iran Afghanistan Tajikistan Pakistan',
  indic: 'India Nepal Bangladesh Sri Lanka Bhutan',
  sinitic: 'China Taiwan',
  eastasian: 'Japan South Korea North Korea',
  steppe: 'Mongolia Kazakhstan Uzbekistan Turkmenistan Kyrgyzstan',
  slavic: 'Russia Ukraine Belarus Poland Czechia Slovakia Serbia Croatia Bulgaria Bosnia and Herz. Slovenia Macedonia Montenegro Lithuania Latvia Estonia Moldova',
  hellenic: 'Greece Cyprus Albania',
  anatolian: 'Turkey Armenia Georgia Azerbaijan',
  latin: 'Italy Spain Portugal France Romania Switzerland',
  germanic: 'Germany Austria Netherlands Belgium Denmark Norway Sweden Iceland Finland Luxembourg',
  celtic: 'United Kingdom Ireland',
  westafrican: 'Nigeria Ghana Mali Senegal Niger Burkina Faso Côte d\'Ivoire Guinea Sierra Leone Liberia Togo Benin Gambia Guinea-Bissau Cameroon Chad',
  ethiopic: 'Ethiopia Eritrea Somalia Somaliland Djibouti Kenya',
  berber: 'Morocco Algeria Tunisia Libya Mauritania W. Sahara',
  mesoamerican: 'Mexico Guatemala Belize Honduras El Salvador Nicaragua Costa Rica Panama Cuba Jamaica Haiti Dominican Rep.',
  andean: 'Peru Bolivia Ecuador Chile Argentina',
  amazonian: 'Brazil Venezuela Guyana Suriname Paraguay Uruguay Colombia',
  northamerican: 'United States of America Canada',
  austronesian: 'Indonesia Philippines Malaysia Papua New Guinea Madagascar New Zealand Brunei Timor-Leste',
  seasian: 'Thailand Vietnam Laos Cambodia Myanmar',
  australian: 'Australia',
  arctic: 'Greenland',
};
const LOOKUP = {}; for (const [k, v] of Object.entries(COUNTRY_CULTURE)) for (const c of v.split(/ (?=[A-Z])/)) LOOKUP[c] = k;
// multi-word names are listed whole above; match them first
const MULTI = Object.entries(COUNTRY_CULTURE).flatMap(([k, v]) => ['United States of America', 'Saudi Arabia', 'United Arab Emirates', 'Sri Lanka', 'South Korea', 'North Korea', 'Bosnia and Herz.', 'United Kingdom', 'Burkina Faso', 'Côte d\'Ivoire', 'Sierra Leone', 'W. Sahara', 'El Salvador', 'Costa Rica', 'Dominican Rep.', 'Papua New Guinea', 'New Zealand', 'S. Sudan', 'Guinea-Bissau'].filter(n => v.includes(n)).map(n => [n, k]));
for (const [n, k] of MULTI) LOOKUP[n] = k;

export function cultureOf(tile) {
  if (tile.country && LOOKUP[tile.country]) return LOOKUP[tile.country];
  const { lat, lon } = tile;
  if (lon < -30) return lat > 15 ? 'northamerican' : lat > 5 ? 'mesoamerican' : lon < -66 ? 'andean' : 'amazonian';
  if (lon > 110 && lat < -10) return 'australian';
  if (lat > 50 && lon > 60) return 'steppe';
  if (lat < 5 && lon > -20 && lon < 52) return 'bantu';
  if (lat < 18 && lon > -20 && lon < 20) return 'westafrican';
  if (lon > 95 && lat < 25) return lat < 8 ? 'austronesian' : 'seasian';
  if (lat > 35 && lon < 45) return 'germanic';
  return 'semitic';
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const pick = (a, r) => a[Math.floor(r() * a.length)];

export function civName(culture, r = Math.random, used = new Set()) {
  const C = CULTURES[culture] || CULTURES.semitic;
  for (let k = 0; k < 40; k++) {
    let base;
    if (C.mono) base = pick(C.on, r);
    else base = pick(C.on, r) + (r() < 0.45 ? pick(C.on, r) : '') + pick(C.end, r);
    base = base.replace(/(.)\1\1+/g, '$1$1');
    if (base.length < 3 || base.length > 11) continue;
    let name = cap(base);
    if (used.has(name) && C.mono) name = pick(['Later', 'Northern', 'Southern', 'Eastern', 'Western', 'Former', 'Great', 'Little'], r) + ' ' + name; // Later Han, Northern Wei
    if (used.has(name)) continue;
    used.add(name);
    let adj = name;
    if (C.adj) {
      if (/[aeiou]$/.test(name)) adj = name.replace(/[aeiou]$/, '') + C.adj;
      else adj = name + (C.adj === 'ian' ? 'ian' : C.adj === 'an' ? 'an' : C.adj);
    }
    return { name, adj };
  }
  // every name of this people is taken: borrow the sounds of another
  const others = Object.keys(CULTURES).filter(k => k !== culture && !CULTURES[k].mono);
  return used.size < 5000 ? civName(others[Math.floor(r() * others.length)], r, used) : { name: 'Tribe ' + Math.floor(r() * 999), adj: 'Tribal' };
}

const EPITHETS = ['the Bold', 'the Wise', 'the Elder', 'the Tall', 'Ironhand', 'the Builder', 'the Just', 'the Fierce', 'the Patient', 'Swiftfoot', 'the Red', 'the Silent', 'Stormborn', 'the Pious', 'the Great', 'the Young', 'the Lame', 'the Lion'];
export function personName(culture, age, r = Math.random) {
  const C = CULTURES[culture] || CULTURES.semitic;
  const part = () => { let b = pick(C.on, r) + (C.mono ? '' : pick(C.end, r)); if (C.mono) b += r() < 0.6 ? pick(['ming', 'hao', 'wei', 'lan', 'yi', 'jun', 'fang', 'tao', 'shan'], r) : ''; return cap(b.replace(/(.)\1\1+/g, '$1$1')); };
  const first = part();
  if (age <= 1) return r() < 0.3 ? `${first} ${pick(EPITHETS, r)}` : first;
  if (age <= 4) return r() < 0.5 ? `${first} ${pick(EPITHETS, r)}` : `${first} ${part()}`;
  return `${first} ${part()}`;
}

// distinct, readable civilization colours
const PALETTE = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe', '#008080', '#e6beff', '#9a6324', '#fffac8', '#d0563c', '#aaffc3', '#b7b33c', '#ffd8b1', '#6f8cff', '#c9b8a6',
  '#ff6f61', '#6b5b95', '#88b04b', '#f7cac9', '#92a8d1', '#955251', '#b565a7', '#009b77', '#dd4124', '#d65076', '#45b8ac', '#efc050', '#5b5ea6', '#9b2335', '#dfcfbe', '#55b4b0', '#e15d44', '#7fcdcd', '#bc243c', '#c3447a'];
export function civColor(k) {
  if (k < PALETTE.length) return PALETTE[k];
  const h = (k * 137.508) % 360, s = 55 + (k % 3) * 12, l = 50 + (k % 4) * 6;
  const f = n => { const a = s / 100 * Math.min(l / 100, 1 - l / 100); const kk = (n + h / 30) % 12; const c = l / 100 - a * Math.max(-1, Math.min(kk - 3, 9 - kk, 1)); return Math.round(c * 255).toString(16).padStart(2, '0'); };
  return '#' + f(0) + f(8) + f(4);
}
