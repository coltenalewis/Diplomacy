// The world of 1 September 1939: the nations, empires and puppet states, with approximate 1938 figures (population in
// millions, GDP in billions of 1990 dollars after Maddison; rounded, for a game). The map is drawn with modern
// borders, so each modern country is assigned to its 1939 ruler, with region-level corrections where the borders differ.
//   k: key   s: short name   adj   f: formal name   cap: capital [name, lat, lon]   pop   gdp   gov   mil: strength 0-100
//   fa: faith   side: Axis / Allies / Comintern / (neutral)   col   lord: overlord (puppets and the Raj)
//   ideo: fascist / democratic / communist / authoritarian / monarchy   brut: inclination to brutality 0-1 (AI)
const W = (k, s, adj, f, cap, pop, gdp, gov, mil, fa, side, col, ideo, brut = 0.15, lord = null) => ({ k, s, adj, f, cap, pop, gdp, gov, mil, fa, side, col, ideo, brut, lord });
export const WW2_NATIONS = [
  W('Germany', 'Germany', 'German', 'German Reich', ['Berlin', 52.5, 13.4], 79, 375, 'autocracy', 85, 'prot', 'Axis', '#6b6b6b', 'fascist', 0.85),
  W('Italy', 'Italy', 'Italian', 'Kingdom of Italy', ['Rome', 41.9, 12.5], 44, 141, 'autocracy', 42, 'cat', 'Axis', '#3f8f4a', 'fascist', 0.6),
  W('Japan', 'Japan', 'Japanese', 'Empire of Japan', ['Tokyo', 35.7, 139.7], 72, 169, 'empire', 65, 'sec', null, '#d8b23a', 'fascist', 0.85),
  W('Manchukuo', 'Manchukuo', 'Manchurian', 'Empire of Manchukuo', ['Hsinking', 43.9, 125.3], 40, 40, 'monarchy', 8, 'sec', null, '#c9a44a', 'authoritarian', 0.4, 'Japan'),
  W('United Kingdom', 'United Kingdom', 'British', 'United Kingdom', ['London', 51.5, -0.1], 48, 285, 'constmon', 60, 'prot', 'Allies', '#c8323f', 'democratic', 0.12),
  W('British India', 'British Raj', 'Indian', 'British Raj', ['New Delhi', 28.6, 77.2], 380, 190, 'monarchy', 25, 'hin', 'Allies', '#e8925a', 'monarchy', 0.1, 'United Kingdom'),
  W('France', 'France', 'French', 'French Republic', ['Paris', 48.9, 2.35], 42, 186, 'parliamentary', 62, 'cat', 'Allies', '#3a52c4', 'democratic', 0.15),
  W('Poland', 'Poland', 'Polish', 'Republic of Poland', ['Warsaw', 52.2, 21.0], 35, 76, 'presidential', 30, 'cat', 'Allies', '#d4505e', 'authoritarian', 0.1),
  W('Canada', 'Canada', 'Canadian', 'Dominion of Canada', ['Ottawa', 45.4, -75.7], 11, 60, 'constmon', 8, 'cat', 'Allies', '#d86a4a', 'democratic', 0.05),
  W('Australia', 'Australia', 'Australian', 'Commonwealth of Australia', ['Canberra', -35.3, 149.1], 7, 35, 'constmon', 8, 'prot', 'Allies', '#e8a53a', 'democratic', 0.05),
  W('New Zealand', 'New Zealand', 'New Zealand', 'Dominion of New Zealand', ['Wellington', -41.3, 174.8], 1.6, 9, 'constmon', 3, 'prot', 'Allies', '#5aa0c9', 'democratic', 0.05),
  W('South Africa', 'South Africa', 'South African', 'Union of South Africa', ['Pretoria', -25.75, 28.2], 10, 17, 'constmon', 5, 'prot', 'Allies', '#3f9a7a', 'democratic', 0.1),
  W('Soviet Union', 'Soviet Union', 'Soviet', 'Union of Soviet Socialist Republics', ['Moscow', 55.75, 37.6], 170, 359, 'oneparty', 75, 'sec', 'Comintern', '#b8302a', 'communist', 0.7),
  W('Mongolia', 'Mongolia', 'Mongolian', "Mongolian People's Republic", ['Ulaanbaatar', 47.9, 106.9], 0.8, 1, 'oneparty', 3, 'bud', 'Comintern', '#a8423a', 'communist', 0.3, 'Soviet Union'),
  W('United States', 'United States', 'American', 'United States of America', ['Washington', 38.9, -77.0], 131, 800, 'presidential', 28, 'prot', null, '#3b6fd8', 'democratic', 0.1),
  W('China', 'China', 'Chinese', 'Republic of China', ['Chongqing', 29.56, 106.55], 410, 289, 'oneparty', 32, 'sec', null, '#3a7fbf', 'authoritarian', 0.3),
  W('Netherlands', 'Netherlands', 'Dutch', 'Kingdom of the Netherlands', ['Amsterdam', 52.4, 4.9], 9, 45, 'constmon', 10, 'prot', null, '#f08a3a', 'democratic', 0.1),
  W('Dutch East Indies', 'Dutch East Indies', 'East Indies', 'Dutch East Indies', ['Batavia', -6.2, 106.8], 70, 66, 'monarchy', 6, 'sun', null, '#e8a25a', 'monarchy', 0.1, 'Netherlands'),
  W('Belgium', 'Belgium', 'Belgian', 'Kingdom of Belgium', ['Brussels', 50.85, 4.35], 8.4, 40, 'constmon', 12, 'cat', null, '#c9b23a', 'democratic', 0.15),
  W('Spain', 'Spain', 'Spanish', 'Spanish State', ['Madrid', 40.4, -3.7], 26, 80, 'autocracy', 18, 'cat', null, '#e0a33a', 'fascist', 0.5),
  W('Portugal', 'Portugal', 'Portuguese', 'Portuguese Republic', ['Lisbon', 38.7, -9.1], 7.5, 16, 'autocracy', 5, 'cat', null, '#3f8f6a', 'authoritarian', 0.2),
  W('Turkey', 'Turkey', 'Turkish', 'Republic of Turkey', ['Ankara', 39.9, 32.9], 17, 25, 'oneparty', 18, 'sun', null, '#c9403a', 'authoritarian', 0.3),
  W('Sweden', 'Sweden', 'Swedish', 'Kingdom of Sweden', ['Stockholm', 59.3, 18.1], 6.3, 30, 'constmon', 10, 'prot', null, '#3f7fc9', 'democratic', 0.05),
  W('Norway', 'Norway', 'Norwegian', 'Kingdom of Norway', ['Oslo', 59.9, 10.75], 2.9, 13, 'constmon', 3, 'prot', null, '#4a6fb0', 'democratic', 0.05),
  W('Denmark', 'Denmark', 'Danish', 'Kingdom of Denmark', ['Copenhagen', 55.7, 12.6], 3.8, 21, 'constmon', 3, 'prot', null, '#c2504a', 'democratic', 0.05),
  W('Finland', 'Finland', 'Finnish', 'Republic of Finland', ['Helsinki', 60.2, 24.9], 3.7, 13, 'parliamentary', 10, 'prot', null, '#e8e8f0', 'democratic', 0.1),
  W('Estonia', 'Estonia', 'Estonian', 'Republic of Estonia', ['Tallinn', 59.4, 24.75], 1.1, 3, 'autocracy', 2, 'prot', null, '#5a8fd6', 'authoritarian', 0.1),
  W('Latvia', 'Latvia', 'Latvian', 'Republic of Latvia', ['Riga', 56.95, 24.1], 2, 4, 'autocracy', 2, 'prot', null, '#9a3f4a', 'authoritarian', 0.1),
  W('Lithuania', 'Lithuania', 'Lithuanian', 'Republic of Lithuania', ['Kaunas', 54.9, 23.9], 2.6, 4, 'autocracy', 2, 'cat', null, '#d6c23a', 'authoritarian', 0.1),
  W('Hungary', 'Hungary', 'Hungarian', 'Kingdom of Hungary', ['Budapest', 47.5, 19.0], 9.2, 24, 'autocracy', 10, 'cat', null, '#8f6f4a', 'authoritarian', 0.5),
  W('Romania', 'Romania', 'Romanian', 'Kingdom of Romania', ['Bucharest', 44.4, 26.1], 19.5, 30, 'absolute', 14, 'orth', null, '#d8c03a', 'authoritarian', 0.5),
  W('Bulgaria', 'Bulgaria', 'Bulgarian', 'Kingdom of Bulgaria', ['Sofia', 42.7, 23.3], 6.3, 10, 'absolute', 8, 'orth', null, '#4f9a5a', 'authoritarian', 0.3),
  W('Yugoslavia', 'Yugoslavia', 'Yugoslav', 'Kingdom of Yugoslavia', ['Belgrade', 44.8, 20.5], 15.6, 23, 'absolute', 14, 'orth', null, '#4a6fd8', 'authoritarian', 0.3),
  W('Greece', 'Greece', 'Greek', 'Kingdom of Greece', ['Athens', 37.98, 23.7], 7.1, 20, 'autocracy', 10, 'orth', null, '#5aa0e8', 'authoritarian', 0.15),
  W('Ireland', 'Ireland', 'Irish', 'Ireland', ['Dublin', 53.3, -6.3], 2.9, 10, 'parliamentary', 2, 'cat', null, '#4aa860', 'democratic', 0.05),
  W('Switzerland', 'Switzerland', 'Swiss', 'Swiss Confederation', ['Bern', 46.9, 7.4], 4.2, 23, 'parliamentary', 6, 'prot', null, '#d8504a', 'democratic', 0.02),
  W('Egypt', 'Egypt', 'Egyptian', 'Kingdom of Egypt', ['Cairo', 30.05, 31.25], 16, 19, 'constmon', 4, 'sun', null, '#c9a33a', 'monarchy', 0.1),
  W('Slovakia', 'Slovakia', 'Slovak', 'Slovak Republic', ['Bratislava', 48.15, 17.1], 2.7, 6, 'oneparty', 3, 'cat', 'Axis', '#5a7ab8', 'fascist', 0.45, 'Germany'),
  W('Iraq', 'Iraq', 'Iraqi', 'Kingdom of Iraq', ['Baghdad', 33.3, 44.4], 3.7, 3, 'constmon', 3, 'shi', null, '#6a9a3a', 'monarchy', 0.2),
  W('Iran', 'Iran', 'Iranian', 'Imperial State of Iran', ['Tehran', 35.7, 51.4], 15, 16, 'absolute', 6, 'shi', null, '#3a9a6a', 'authoritarian', 0.2),
  W('Saudi Arabia', 'Saudi Arabia', 'Saudi', 'Kingdom of Saudi Arabia', ['Riyadh', 24.7, 46.7], 3, 2, 'absolute', 2, 'sun', null, '#2f8a4a', 'monarchy', 0.2),
  W('Afghanistan', 'Afghanistan', 'Afghan', 'Kingdom of Afghanistan', ['Kabul', 34.5, 69.2], 11, 9, 'absolute', 3, 'sun', null, '#7a6a3a', 'monarchy', 0.2),
  W('Thailand', 'Siam', 'Siamese', 'Kingdom of Siam', ['Bangkok', 13.75, 100.5], 15, 14, 'autocracy', 5, 'bud', null, '#d6735a', 'authoritarian', 0.2),
  W('Mexico', 'Mexico', 'Mexican', 'United Mexican States', ['Mexico City', 19.4, -99.1], 19, 30, 'presidential', 4, 'cat', null, '#3f9a5c', 'democratic', 0.1),
  W('Brazil', 'Brazil', 'Brazilian', 'United States of Brazil', ['Rio de Janeiro', -22.9, -43.2], 40, 60, 'autocracy', 8, 'cat', null, '#3faa52', 'authoritarian', 0.15),
  W('Argentina', 'Argentina', 'Argentine', 'Argentine Nation', ['Buenos Aires', -34.6, -58.4], 14, 55, 'presidential', 6, 'cat', null, '#76b8e8', 'authoritarian', 0.1),
];
// the rest of the world, by modern country: who ruled it on 1 September 1939 (key from WW2_NATIONS), or a small
// independent state of its own (its modern name)
const UK = 'United Kingdom', FR = 'France', IT = 'Italy', JP = 'Japan', SU = 'Soviet Union', BE = 'Belgium', NL = 'Netherlands', PT = 'Portugal', ES = 'Spain', RAJ = 'British India';
export const OWNER_1939 = {
  'United States of America': 'United States', Philippines: 'United States', Canada: 'Canada', Greenland: 'Denmark', Iceland: 'Denmark',
  Germany: 'Germany', Austria: 'Germany', Czechia: 'Germany', Slovakia: 'Slovakia', Poland: 'Poland', Italy: 'Italy', Albania: IT, Libya: IT, Eritrea: IT, Ethiopia: IT, Somalia: IT,
  Russia: SU, Ukraine: SU, Belarus: SU, Kazakhstan: SU, Uzbekistan: SU, Turkmenistan: SU, Kyrgyzstan: SU, Tajikistan: SU, Georgia: SU, Armenia: SU, Azerbaijan: SU, Moldova: 'Romania', Mongolia: 'Mongolia',
  'United Kingdom': UK, 'Falkland Is.': UK, India: RAJ, Pakistan: RAJ, Bangladesh: RAJ, 'Sri Lanka': UK, Myanmar: UK, Malaysia: UK, Singapore: UK, Bhutan: RAJ, Nepal: 'Nepal',
  Kenya: UK, Uganda: UK, Tanzania: UK, Zambia: UK, Zimbabwe: UK, Malawi: UK, Botswana: UK, Nigeria: UK, Ghana: UK, 'Sierra Leone': UK, Sudan: UK, 'S. Sudan': UK, Somaliland: UK,
  Jordan: UK, Israel: UK, Kuwait: UK, Qatar: UK, 'United Arab Emirates': UK, Oman: UK, Yemen: 'Yemen', Guyana: UK, Belize: UK, Jamaica: UK, Egypt: 'Egypt', 'Papua New Guinea': 'Australia', Namibia: 'South Africa',
  France: FR, Algeria: FR, Tunisia: FR, Morocco: FR, Mauritania: FR, Mali: FR, Niger: FR, Chad: FR, Senegal: FR, Guinea: FR, "Côte d'Ivoire": FR, 'Burkina Faso': FR, Benin: FR, Togo: FR, Cameroon: FR,
  Gabon: FR, Congo: FR, 'Central African Rep.': FR, Madagascar: FR, Vietnam: FR, Laos: FR, Cambodia: FR, Syria: FR,
  'Dem. Rep. Congo': BE, Rwanda: BE, Burundi: BE, Belgium: BE, Netherlands: NL, Indonesia: 'Dutch East Indies', Suriname: NL, Angola: PT, Mozambique: PT, Portugal: PT, Spain: ES, 'W. Sahara': ES,
  Japan: JP, 'South Korea': JP, 'North Korea': JP, Taiwan: JP, China: 'China', Thailand: 'Thailand',
  Serbia: 'Yugoslavia', Croatia: 'Yugoslavia', 'Bosnia and Herz.': 'Yugoslavia', Montenegro: 'Yugoslavia', Macedonia: 'Yugoslavia',
};
// regions whose 1939 ruler differs from their modern country's
export const REGION_1939 = {
  // the Reich: East Prussia, Danzig, Pomerania, Silesia, Austria and Bohemia-Moravia
  'Gdańsk': 'Germany', 'West Pomeranian': 'Germany', 'Wrocław': 'Germany', 'Olsztyn': 'Germany', 'Ełk': 'Germany', 'Kaliningrad': 'Germany', 'Vienna': 'Germany',
  // eastern Poland, Lithuanian and Romanian lands that are Ukrainian or Belarusian today
  'Lviv': 'Poland', 'Kovel': 'Poland', 'Ivano-Frankivsk': 'Poland', 'Rivne': 'Poland', 'Hrodna': 'Poland', 'Pinsk': 'Poland',
  'Chernivtsi': 'Romania', 'Baia Mare': 'Romania', 'Oradea': 'Romania', 'Transnistria': SU,
  // Hungary after the Vienna Award
  'Budapest': 'Hungary', 'Miskolc': 'Hungary', 'Košice': 'Hungary',
  // Manchukuo and Mengjiang
  'Harbin': 'Manchukuo', 'Changchun': 'Manchukuo', 'Shenyeng': 'Manchukuo', 'Mudangiang': 'Manchukuo', 'Hailar': 'Manchukuo', 'Tongliao': 'Manchukuo', 'Amur': 'Manchukuo', 'Fushun': 'Manchukuo',
  'Jinzhou': 'Manchukuo', 'Jixi': 'Manchukuo', 'Fujin': 'Manchukuo', "Bei'an": 'Manchukuo', 'Chongjin': 'Manchukuo', 'Jinxi': 'Manchukuo', 'Chifeng': 'Manchukuo', 'Bairin Zuoqi': 'Manchukuo', 'Xilinhot': 'Manchukuo', 'Hebei': 'Manchukuo',
  // China occupied by Japan since 1937-38
  'Beijing': JP, 'Tangshan': JP, 'Zhuozhou': JP, 'Buizhou': JP, 'Jinan': JP, 'Qingdao': JP, 'Zibo': JP, 'Zhucheng': JP, 'Xuzhou': JP, 'Nanjing': JP, 'Shanghai': JP, 'Hangzhou': JP, 'Suzhou': JP,
  'Changzhou': JP, 'Wuhan': JP, 'Zhuhai': JP, 'Jiujiang': JP, 'Yancheng': JP, 'Shuyang': JP, 'Handan': JP, 'Heze': JP, 'Zaozhuang': JP, 'Huainan': JP, 'Xuanzhou': JP, 'Taiyuan': JP,
  'Hong Kong': UK,
};
export const FACTIONS = {
  Axis: { name: 'Axis', preset: 'league', doctrines: ['defense', 'nonaggression'], col: '#7a7a7a' },
  Allies: { name: 'Allies', preset: 'league', doctrines: ['defense', 'nonaggression', 'council'], col: '#3d7be0' },
  Comintern: { name: 'Comintern', preset: 'league', doctrines: ['defense', 'nonaggression'], col: '#c0473f' },
};
// the wars under way on 1 September 1939
export const WARS_1939 = [['Germany', 'Poland'], ['Japan', 'China'], ['Manchukuo', 'China']];
export const OPINIONS_1939 = [
  ['Germany', 'Italy', 60], ['Germany', 'Japan', 35], ['Italy', 'Japan', 25], ['Germany', 'Soviet Union', 10], ['Germany', 'Poland', -90], ['Germany', 'France', -60], ['Germany', 'United Kingdom', -55],
  ['Germany', 'Hungary', 35], ['Germany', 'Spain', 45], ['Germany', 'Romania', 10], ['Germany', 'Bulgaria', 20], ['Germany', 'Finland', 15], ['Germany', 'Czechoslovakia', -60],
  ['United Kingdom', 'France', 70], ['United Kingdom', 'Poland', 45], ['France', 'Poland', 45], ['United Kingdom', 'United States', 45], ['United States', 'France', 30], ['United States', 'Japan', -35], ['United States', 'China', 35],
  ['Soviet Union', 'Poland', -45], ['Soviet Union', 'Finland', -40], ['Soviet Union', 'Japan', -50], ['Soviet Union', 'United Kingdom', -20], ['Soviet Union', 'France', -15], ['Soviet Union', 'Estonia', -20], ['Soviet Union', 'Latvia', -20], ['Soviet Union', 'Lithuania', -20], ['Soviet Union', 'Romania', -30],
  ['Japan', 'China', -90], ['Japan', 'United Kingdom', -25], ['Japan', 'Netherlands', -10], ['Italy', 'France', -35], ['Italy', 'Greece', -25], ['Italy', 'Yugoslavia', -20], ['Italy', 'Ethiopia', -60], ['Italy', 'United Kingdom', -20],
  ['Hungary', 'Romania', -45], ['Hungary', 'Yugoslavia', -20], ['Bulgaria', 'Greece', -20], ['Bulgaria', 'Romania', -20], ['Finland', 'Sweden', 55], ['Norway', 'Sweden', 50], ['Denmark', 'Norway', 40], ['Canada', 'United Kingdom', 80], ['Australia', 'United Kingdom', 80],
  ['New Zealand', 'United Kingdom', 85], ['South Africa', 'United Kingdom', 45], ['Turkey', 'Soviet Union', -10], ['Spain', 'Italy', 45], ['Thailand', 'France', -30], ['Thailand', 'Japan', 25], ['Iran', 'Germany', 25], ['Iraq', 'United Kingdom', 10],
];
// leaders by title only: this is a game about states, not a portrait of the men who led them
export const RULER_1939 = { fascist: 'Leader', communist: 'General Secretary', democratic: null, authoritarian: null, monarchy: null };
