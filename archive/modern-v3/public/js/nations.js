// Nations of the world and the regions they start with. First region listed is the capital.
// Leaders of major powers are fictional.
const N = [];
const add = (code, name, regions, opt = {}) => N.push({ code, name, regions: regions.split(' '), ...opt });

// ---- Americas
add('USA', 'United States', 'NYK CHI TEX CAL ALA PNW NEV MON RKY ARZ PLA DIX FLO CRL VIR OHI NEN HAW', { color: '#3d8bff', leader: 'President Marcus Hale', major: true, traits: { aggression: 0.55, loyalty: 0.65, caution: 0.5 } });
add('CAN', 'Canada', 'ONT QUE BCO ABT YUK NWT NUN BFI MAN LBR ACA NFL', { color: '#e8554e', leader: 'Prime Minister Claire Dubois', traits: { aggression: 0.15, loyalty: 0.85, caution: 0.7 } });
add('MEX', 'Mexico', 'MEX SON CHH YUC', { color: '#2fb36b' });
add('CAM', 'Central America', 'CAM', { color: '#6fcf97' });
add('PAN', 'Panama', 'PAN', { color: '#9be3c0' });
add('CUB', 'Cuba', 'CUB', { color: '#c94c4c' });
add('DOM', 'Dominican Republic', 'HIS', { color: '#5c7cfa' });
add('COL', 'Colombia', 'COL', { color: '#f2c94c' });
add('VEN', 'Venezuela', 'VEN', { color: '#d9822b' });
add('GUY', 'Guyana', 'GUY', { color: '#7bc96f' });
add('ECU', 'Ecuador', 'ECU', { color: '#e6c84f' });
add('PER', 'Peru', 'PER', { color: '#c0392b' });
add('BOL', 'Bolivia', 'BOL', { color: '#58b368' });
add('BRA', 'Brazil', 'BRS RIO SPO AMZ PRA REC BAH MGR RGS', { color: '#27d86c', leader: 'President Lucia Andrade', major: true, traits: { aggression: 0.4, loyalty: 0.7, caution: 0.55 } });
add('PRY', 'Paraguay', 'PGY', { color: '#b55dcf' });
add('URY', 'Uruguay', 'URU', { color: '#7fb3ff' });
add('ARG', 'Argentina', 'BUE GCH PAT', { color: '#74c7ec', major: true });
add('CHL', 'Chile', 'CHL ATA', { color: '#e57373' });
// ---- Europe
add('GBR', 'United Kingdom', 'LON WAL LVP EDI FAL', { color: '#ff4fa3', leader: 'Prime Minister Edmund Gray', major: true, traits: { aggression: 0.45, loyalty: 0.7, caution: 0.6 } });
add('IRL', 'Ireland', 'IRE', { color: '#66d17a' });
add('ISL', 'Iceland', 'ICE', { color: '#9ec5ff' });
add('FRA', 'France', 'PAR BRE PIC BUR GAS MAR', { color: '#7f6bff', leader: 'President Celine Moreau', major: true, traits: { aggression: 0.45, loyalty: 0.6, caution: 0.55 } });
add('ESP', 'Spain', 'SPA LEO CTL ADL', { color: '#ffb000' });
add('PRT', 'Portugal', 'POR', { color: '#4fbf8f' });
add('BEL', 'Belgium', 'BEL', { color: '#e0c341' });
add('NLD', 'Netherlands', 'HOL', { color: '#ff8c3a' });
add('DEU', 'Germany', 'BER RUH KIE MUN', { color: '#c8a46a', leader: 'Chancellor Dieter Brandt', major: true, traits: { aggression: 0.4, loyalty: 0.7, caution: 0.6 } });
add('CHE', 'Switzerland', 'SWI', { color: '#ff6b6b' });
add('ITA', 'Italy', 'ROM PIE VCE TUS NAP SIC SAR', { color: '#3fcf8e', major: true });
add('DNK', 'Denmark', 'DEN GRN', { color: '#d94f5c' });
add('NOR', 'Norway', 'NWY TRO', { color: '#6c8cff' });
add('SWE', 'Sweden', 'SWE LPL', { color: '#4aa8ff' });
add('FIN', 'Finland', 'FIN', { color: '#b3d4ff' });
add('POL', 'Poland', 'WAR PRU SIL GLZ', { color: '#ef6f8f' });
add('CZE', 'Czechia', 'BOH', { color: '#5aa9e6' });
add('AUT', 'Austria', 'VIE', { color: '#f28482' });
add('HUN', 'Hungary', 'BUD', { color: '#84a98c' });
add('HRV', 'Croatia', 'TRI', { color: '#5e81ac' });
add('SRB', 'Serbia', 'SER', { color: '#bf616a' });
add('ALB', 'Albania', 'ALB', { color: '#d08770' });
add('GRC', 'Greece', 'GRC', { color: '#88c0d0' });
add('BGR', 'Bulgaria', 'BUL', { color: '#a3be8c' });
add('ROU', 'Romania', 'RUM', { color: '#ebcb8b' });
add('UKR', 'Ukraine', 'UKR DON SEV', { color: '#ffd84d' });
add('BLR', 'Belarus', 'BLR', { color: '#8fbc8f' });
add('BLT', 'Baltic States', 'LVN', { color: '#9fa8da' });
add('RUS', 'Russia', 'MOS STP ARK KOM KAZ VOL NCA URA YAM OMS NOV KRA TAI EVK IRK YAK VER CHT AMU KHB VLA SAK MAG KOL KAM CHU', { color: '#e9eef5', leader: 'President Anatoly Volkov', major: true, traits: { aggression: 0.75, loyalty: 0.35, caution: 0.35 } });
add('TRC', 'Transcaucasia', 'CAU', { color: '#c38d9e' });
add('KAZ', 'Kazakhstan', 'KZE KZW ALM', { color: '#48cae4' });
add('TKM', 'Turkmenistan', 'TUK', { color: '#90be6d' });
add('UZB', 'Uzbekistan', 'UZB', { color: '#43aa8b' });
add('AFG', 'Afghanistan', 'AFG', { color: '#9c6644' });
// ---- Middle East
add('TUR', 'Turkey', 'ANK CON SMY CIL ERZ', { color: '#ff8a1f', leader: 'President Kemal Arslan', major: true, traits: { aggression: 0.6, loyalty: 0.45, caution: 0.5 } });
add('SYR', 'Syria', 'SYR', { color: '#b5838d' });
add('LEV', 'Levant', 'LEV', { color: '#6d9dc5' });
add('IRQ', 'Iraq', 'IRQ', { color: '#a68a64' });
add('IRN', 'Iran', 'IRN TAB KHU FAR KHO', { color: '#2a9d8f', major: true, traits: { aggression: 0.6, loyalty: 0.5, caution: 0.45 } });
add('PAK', 'Pakistan', 'PUN KAR BLC', { color: '#52b788' });
add('SAU', 'Saudi Arabia', 'RIY HEJ HAS RUB', { color: '#40916c', major: true });
add('ARE', 'Emirates', 'EMI', { color: '#d4a373' });
add('OMN', 'Oman', 'OMA', { color: '#bc4749' });
add('YEM', 'Yemen', 'YEM', { color: '#7f5539' });
// ---- Africa
add('MAR', 'Morocco', 'MOR WSA', { color: '#d62828' });
add('DZA', 'Algeria', 'ALG SAH', { color: '#4c956c' });
add('TUN', 'Tunisia', 'TUN', { color: '#e76f51' });
add('LBY', 'Libya', 'LIB CYR FEZ', { color: '#606c38' });
add('EGY', 'Egypt', 'EGY NUB', { color: '#e9c46a', major: true });
add('SDN', 'Sudan', 'SUD DAR', { color: '#bc6c25' });
add('ETH', 'Ethiopia', 'ETH', { color: '#99d98c' });
add('SOM', 'Somalia', 'SOM', { color: '#56cfe1' });
add('KEN', 'Kenya', 'KEN', { color: '#d00000' });
add('UGA', 'Uganda', 'UGA', { color: '#ffba08' });
add('TZA', 'Tanzania', 'TAN', { color: '#3a86ff' });
add('COD', 'DR Congo', 'CNG KAT', { color: '#8ac926' });
add('AGO', 'Angola', 'ANG', { color: '#ef476f' });
add('NAM', 'Namibia', 'NAM', { color: '#118ab2' });
add('BWA', 'Botswana', 'BTS', { color: '#73d2de' });
add('ZMB', 'Zambia', 'ZAM', { color: '#ff9f1c' });
add('ZWE', 'Zimbabwe', 'ZIM', { color: '#06d6a0' });
add('MOZ', 'Mozambique', 'MOZ', { color: '#f4a261' });
add('MDG', 'Madagascar', 'MAD', { color: '#e63946' });
add('ZAF', 'South Africa', 'JOH CAP DUR', { color: '#b8f23c', leader: 'President Thabo Nkosi', major: true, traits: { aggression: 0.4, loyalty: 0.7, caution: 0.55 } });
add('MRT', 'Mauritania', 'MAU', { color: '#c9a227' });
add('SEN', 'Senegal', 'SEN', { color: '#2d6a4f' });
add('GIN', 'Guinea', 'GUI', { color: '#f77f00' });
add('MLI', 'Mali', 'MLI', { color: '#fcbf49' });
add('CIV', "Cote d'Ivoire", 'CIV', { color: '#f3722c' });
add('GHA', 'Ghana', 'GHA', { color: '#f9c74f' });
add('NGA', 'Nigeria', 'LAG', { color: '#4caf50', major: true });
add('NER', 'Niger', 'NGR', { color: '#e09f3e' });
add('TCD', 'Chad', 'CHD', { color: '#335c67' });
add('CAF', 'Central African Rep.', 'CAF', { color: '#9e2a2b' });
add('GAB', 'Gabon', 'GBN', { color: '#43aa8b' });
// ---- Asia & Oceania
add('IND', 'India', 'DEL BOM BEN MDS DEC RAJ CIN ASS KAS', { color: '#ffc933', leader: 'Prime Minister Ravi Mehta', major: true, traits: { aggression: 0.45, loyalty: 0.6, caution: 0.6 } });
add('LKA', 'Sri Lanka', 'SRI', { color: '#f6bd60' });
add('NPL', 'Nepal', 'NEP', { color: '#e5989b' });
add('CHN', 'China', 'BEJ SHA CAN SZE TIB QIN XIN GAN NMG HEI MCH SHD WUH FUJ GXI YUN SHX', { color: '#ff3344', leader: 'Chairman Wei Zhang', major: true, traits: { aggression: 0.65, loyalty: 0.45, caution: 0.45 } });
add('MNG', 'Mongolia', 'MNG ALT', { color: '#4895ef' });
add('TWN', 'Taiwan', 'TAW', { color: '#4cc9f0' });
add('PRK', 'North Korea', 'PYO', { color: '#9d0208', traits: { aggression: 0.85, loyalty: 0.3, caution: 0.2 } });
add('KOR', 'South Korea', 'KOR', { color: '#7b9cff', major: true });
add('JPN', 'Japan', 'TOK OSA KYU HOK TOH', { color: '#1fe0d0', leader: 'Prime Minister Haruto Sato', major: true, traits: { aggression: 0.4, loyalty: 0.7, caution: 0.6 } });
add('MMR', 'Myanmar', 'MYA', { color: '#80b918' });
add('THA', 'Thailand', 'THA', { color: '#a663cc' });
add('LAO', 'Laos', 'LAO', { color: '#ee6c4d' });
add('VNM', 'Vietnam', 'TON ANN SAI', { color: '#f94144' });
add('KHM', 'Cambodia', 'KHM', { color: '#90e0ef' });
add('MYS', 'Malaysia', 'SIN', { color: '#ffd166' });
add('IDN', 'Indonesia', 'JAV SUM BOR SUL WPA', { color: '#ef233c', major: true });
add('PNG', 'Papua New Guinea', 'PNG', { color: '#f8961e' });
add('PHL', 'Philippines', 'LUZ MIN', { color: '#577590' });
add('AUS', 'Australia', 'SYD MEL PTH BRI QLD PIL KIM NTR ADE GVD TAS', { color: '#e07a5f', leader: 'Prime Minister Fiona McRae', major: true, traits: { aggression: 0.35, loyalty: 0.8, caution: 0.6 } });
add('NZL', 'New Zealand', 'NZN NZS', { color: '#2ec4b6' });

export const NATIONS = N;
export const NATION = Object.fromEntries(N.map(n => [n.code, n]));

// deterministic pseudo-random traits for nations without hand-tuned ones
for (const n of N) {
  if (!n.traits) {
    let h = 0; for (const c of n.code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const r = k => ((Math.sin(h * (k + 1) * 12.9898) * 43758.5453) % 1 + 1) % 1;
    n.traits = { aggression: 0.15 + r(1) * 0.55, loyalty: 0.35 + r(2) * 0.55, caution: 0.3 + r(3) * 0.5 };
  }
  n.leader ||= `Government of ${n.name}`;
}

// Approximate population (millions) and GDP ($ billions), mid-2020s. Federations aggregate their members.
const STATS = `USA 340 28000|CAN 40 2200|MEX 130 1800|CAM 45 330|PAN 4.5 85|CUB 11 100|DOM 11.5 120|COL 52 360|VEN 28 100|GUY 1.7 30|ECU 18 120|PER 34 270|BOL 12.5 46|BRA 216 2200|PRY 7 43|URY 3.4 77|ARG 46 640|CHL 20 330|GBR 68 3300|IRL 5.3 550|ISL 0.4 30|FRA 68 3000|ESP 48 1600|PRT 10.4 290|BEL 11.8 630|NLD 18 1100|DEU 84 4500|CHE 8.8 900|ITA 59 2250|DNK 6 400|NOR 5.5 480|SWE 10.5 590|FIN 5.6 300|POL 37 850|CZE 10.5 340|AUT 9.1 520|HUN 9.6 210|HRV 10 170|SRB 9.5 100|ALB 4.5 35|GRC 10.3 240|BGR 6.4 105|ROU 19 350|UKR 37 180|BLR 9.2 72|BLT 6 150|RUS 144 2000|TRC 17 120|KAZ 20 260|TKM 7 80|UZB 53 135|AFG 42 17|TUR 86 1100|SYR 23 20|LEV 30 650|IRQ 45 250|IRN 90 400|PAK 240 375|SAU 37 1100|ARE 18 1000|OMN 5 105|YEM 34 20|MAR 38 140|DZA 46 240|TUN 12 50|LBY 7 45|EGY 113 400|SDN 60 40|ETH 135 160|SOM 18 11|KEN 55 110|UGA 75 70|TZA 67 80|COD 108 80|AGO 37 90|NAM 2.6 13|BWA 2.6 20|ZMB 41 40|ZWE 16.5 35|MOZ 34 20|MDG 30 16|ZAF 64 390|MRT 5 10|SEN 22 40|GIN 25 35|MLI 47 45|CIV 29 80|GHA 56 120|NGA 225 360|NER 27 18|TCD 18 13|CAF 5.7 3|GAB 33 70|IND 1430 3900|LKA 22 85|NPL 31 45|CHN 1410 18500|MNG 3.4 20|TWN 23.5 800|PRK 26 30|KOR 51.7 1700|JPN 124 4200|MMR 54 65|THA 72 520|LAO 7.6 15|VNM 99 430|KHM 17 32|MYS 41 950|IDN 278 1400|PNG 11 32|PHL 117 440|AUS 26.6 1700|NZL 5.2 250`;
for (const row of STATS.split('|')) { const [c, p, g] = row.split(' '); if (NATION[c]) { NATION[c].pop = +p; NATION[c].gdp = +g; } }
