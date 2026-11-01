// The Second World War as it happened, and as it might have gone. The timeline offers the great decisions of the war
// to whoever has to take them on the day they were taken: the player, when it is their nation, or the AI government,
// which follows history unless the world has already changed too much. Then a deck of wartime dilemmas for the
// player: rationing, conscription, refugees, spies, strikes, resistance in occupied lands and what to do about it.
import { K, enterWar, joinFaction, factionPact, faction, usEntersWar, capitulate, lostShare, frontOne, conduct, canConduct, occupiedBy, CRIMES, atWarWithSide } from './ww2.js';
import { earn } from './pacts.js';
import { UNITS, bestOf } from './units.js';
import { TECH } from './tech.js';
import { computeMods, EVENTS } from './gov.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = a => a[(Math.random() * a.length) | 0];
const DAY = 24;
const MONTH0 = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const D = (y, m, d) => (y - 1939) * 365 + MONTH0[m - 1] + d - 1 - 243; // day of the war, 0 = 1 September 1939
const inc = N => Math.max(0.3, N.st?.prod?.wealth || 1);
const nmK = (sim, k) => { const c = sim.s.ww2.code[k]; return c ? sim.nm(c) : k; };
const at = (sim, a, b) => !!a && !!b && sim.atWar(a, b);
const free = (sim, c) => !!c && !sim.s.nations[c].occupied;
const neutral = (sim, c) => free(sim, c) && !sim.warsOf(c).length && !faction(sim, c);

const EV = [];
// a dated decision: who takes it, from which day (until when, if it may wait), and whether it still makes sense
const tl = (id, day, who, cond, title, text, options, extra = {}) => EV.push({ id: 'w_' + id, scen: 'ww2', timeline: true, day, who, cond, title, text, options, ai: 0, ...extra });
// a wartime dilemma for the player
const ev = (id, title, when, text, options) => EV.push({ id: 'w_' + id, scen: 'ww2', title, when, text, options });

// ------------------------------------------------------------------ 1939
tl('britain', D(1939, 9, 3), 'United Kingdom', sim => { const de = K(sim, 'Germany'), pl = K(sim, 'Poland'), uk = K(sim, 'United Kingdom'); return de && pl && at(sim, de, pl) && !at(sim, uk, de) && {}; },
  'The Ultimatum Expires',
  () => 'Eleven o\'clock, Sunday 3 September. Germany has not answered the ultimatum to withdraw its troops from Poland. Britain guaranteed Poland\'s independence in March and signed an alliance with Warsaw a week ago. The Prime Minister must go to the microphone.',
  [{ label: 'Declare war on Germany: honour the guarantee', fx: (sim, N) => { enterWar(sim, N.code, K(sim, 'Germany'), `This country is at war with Germany. The ${sim.nm(N.code)} and the Empire honour their guarantee to Poland.`); earn(sim, N.code, 'steadfast', 15); N.gov.approval = clamp(N.gov.approval + 0.04, 0, 1); return 'The sirens sound over London. The Empire goes to war.'; } },
   { label: 'Abandon Poland: no war over a far-away country', fx: (sim, N) => { earn(sim, N.code, 'oathbreaker', 45); const pl = K(sim, 'Poland'), fr = K(sim, 'France'), us = K(sim, 'United States'); if (pl) sim.addOpinion(pl, N.code, -80); if (fr) sim.addOpinion(fr, N.code, -35); if (us) sim.addOpinion(us, N.code, -15); N.gov.approval -= 0.1; N.gov.stability -= 0.05; return 'The House of Commons erupts. Poland fights alone, and the world learns what a British guarantee is worth.'; } }],
  { notify: ['Germany', 'Poland'] });
tl('france', D(1939, 9, 3), 'France', sim => { const de = K(sim, 'Germany'), pl = K(sim, 'Poland'), fr = K(sim, 'France'); return de && pl && at(sim, de, pl) && !at(sim, fr, de) && {}; },
  'France and the Alliance',
  (c, N, sim) => `Five in the afternoon. ${at(sim, K(sim, 'United Kingdom'), K(sim, 'Germany')) ? 'Britain has declared war on Germany this morning.' : 'Britain has not moved.'} France is bound to Poland by the alliance of 1921. The army is mobilised behind the Maginot Line.`,
  [{ label: 'Declare war on Germany', fx: (sim, N) => { enterWar(sim, N.code, K(sim, 'Germany'), `France declares war on Germany in defence of Poland.`); earn(sim, N.code, 'steadfast', 12); return 'France is at war. The poilus man the Maginot Line.'; } },
   { label: 'Stand aside', fx: (sim, N) => { earn(sim, N.code, 'oathbreaker', 40); const pl = K(sim, 'Poland'); if (pl) sim.addOpinion(pl, N.code, -80); N.gov.approval -= 0.06; return 'Paris stays silent. Poland is left to its fate.'; } }]);
for (const [k, day, text] of [['Australia', D(1939, 9, 3), 'Britain is at war, and so Australia is at war: the Prime Minister\'s broadcast is ready.'], ['New Zealand', D(1939, 9, 3), '"Where Britain goes, we go; where she stands, we stand."'],
  ['South Africa', D(1939, 9, 6), 'Parliament is split between those who would fight beside Britain and those who would stay neutral. The vote is close.'], ['Canada', D(1939, 9, 10), 'Parliament meets in Ottawa. Canada will decide for itself, as a free dominion, whether to go to war.']])
  tl('dom_' + k.replace(/\s/g, ''), day, k, sim => { const uk = K(sim, 'United Kingdom'), de = K(sim, 'Germany'), me = K(sim, k); return at(sim, uk, de) && !at(sim, me, de) && {}; },
    `${k} and the War`, () => text,
    [{ label: 'Stand with Britain', fx: (sim, N) => { enterWar(sim, N.code, K(sim, 'Germany'), `${sim.nm(N.code)} declares war on Germany.`); earn(sim, N.code, 'steadfast', 10); return 'The dominion goes to war beside the mother country.'; } },
     { label: 'Remain neutral', fx: (sim, N) => { const uk = K(sim, 'United Kingdom'); if (uk) sim.addOpinion(uk, N.code, -40); return 'The dominion keeps out of Europe\'s war, for now.'; } }]);
tl('soviet_poland', D(1939, 9, 17), 'Soviet Union', sim => { const pl = K(sim, 'Poland'), su = K(sim, 'Soviet Union'); return pl && at(sim, pl, K(sim, 'Germany')) && !at(sim, su, pl) && free(sim, pl) && {}; },
  'The Secret Protocol',
  () => 'The Polish army is collapsing before the Germans. The secret protocol of the pact signed in Moscow last month divides Poland between Germany and the Soviet Union along the Narew, the Vistula and the San. Berlin asks when the Red Army will march.',
  [{ label: 'Cross the border "to protect Ukrainians and Belorussians"', fx: (sim, N) => { const pl = K(sim, 'Poland'); enterWar(sim, N.code, pl, `The Red Army crosses into eastern Poland.`); frontOne(sim, N.code, pl); const de = K(sim, 'Germany'); if (de) sim.addOpinion(de, N.code, 10); earn(sim, N.code, 'warmonger', 10); for (const k of ['United Kingdom', 'France']) { const x = K(sim, k); if (x) sim.addOpinion(x, N.code, -15); } return 'Poland is stabbed in the back. The partition begins.'; } },
   { label: 'Keep out: honour the non-aggression treaty with Poland', fx: (sim, N) => { const de = K(sim, 'Germany'); if (de) sim.addOpinion(de, N.code, -30); return 'Stalin\'s share of Poland goes unclaimed. Berlin is displeased.'; } }],
  { notify: ['Poland'] });
tl('winter_demands', D(1939, 10, 5), 'Finland', sim => { const fi = K(sim, 'Finland'), su = K(sim, 'Soviet Union'); return fi && su && !at(sim, fi, su) && {}; },
  'Moscow\'s Demands',
  () => 'Moscow demands that Finland move its border back from Leningrad, cede the Karelian Isthmus and islands in the Gulf, and lease the Hanko peninsula for a Soviet naval base. In return it offers a stretch of forest in East Karelia.',
  [{ label: 'Refuse: not one inch of Finnish soil', fx: (sim, N) => { sim.s.ww2.finRefused = true; N.gov.approval = clamp(N.gov.approval + 0.08, 0, 1); return 'The talks break down. Finland mobilises its reservists.'; } },
   { label: 'Cede the border provinces to keep the peace', fx: (sim, N) => { const su = K(sim, 'Soviet Union'); const border = sim.regionsOf(N.code).filter(r => sim.w.adj[r.i].some(j => sim.s.regions[j].owner === su)).slice(0, 2); for (const r of border) sim.transfer(r, su, true); N.gov.approval -= 0.12; return `Finland gives up ${border.length} provinces. There will be no war, for now.`; } }]);
tl('winter_war', D(1939, 11, 30), 'Soviet Union', sim => { const fi = K(sim, 'Finland'), su = K(sim, 'Soviet Union'); return fi && sim.s.ww2.finRefused && !at(sim, fi, su) && {}; },
  'Finland Refuses',
  () => 'The Finns will not move their border. A border incident at Mainila gives the pretext. The Leningrad Military District reports that it can be in Helsinki in two weeks.',
  [{ label: 'Invade Finland', fx: (sim, N) => { const fi = K(sim, 'Finland'); enterWar(sim, N.code, fi, 'The Red Army invades Finland. The Winter War begins.'); frontOne(sim, N.code, fi); for (const x of Object.values(sim.s.nations)) if (x.alive && x.code !== N.code && x.ideo === 'democratic') sim.addOpinion(x.code, N.code, -15); earn(sim, N.code, 'warmonger', 12); return 'The League of Nations expels the Soviet Union. The Finns dig in on the Mannerheim Line.'; } },
   { label: 'Let the matter rest', fx: () => 'The Kremlin decides that Finland is not worth a war.' }],
  { notify: ['Finland'] });
tl('moscow_peace', D(1940, 3, 12), 'Finland', sim => { const fi = K(sim, 'Finland'), su = K(sim, 'Soviet Union'); return at(sim, fi, su) && !at(sim, su, K(sim, 'Germany')) && {}; },
  'Terms from Moscow',
  (c, N, sim) => `The Winter War has cost both sides dearly. Moscow offers peace: the provinces the Red Army holds stay Soviet. ${Math.round(lostShare(sim, N.code) * 100)}% of Finland is in Soviet hands.`,
  [{ label: 'Sign the peace', fx: (sim, N) => { sim.makePeace(N.code, K(sim, 'Soviet Union')); N.gov.approval -= 0.05; return 'The guns fall silent in Karelia. Finland survives, smaller, and bitter.'; } },
   { label: 'Fight on', fx: (sim, N) => { N.gov.approval += 0.03; return 'Finland refuses to give up its land.'; } }],
  { until: D(1941, 6, 1), ai: (sim, N) => (lostShare(sim, N.code) > 0.03 || N.exhaustion > 0.3) ? 0 : -1 });

// ------------------------------------------------------------------ 1940
tl('weserubung', D(1940, 4, 9), 'Germany', sim => { const de = K(sim, 'Germany'); return de && at(sim, de, K(sim, 'United Kingdom')) && neutral(sim, K(sim, 'Norway')) && {}; },
  'The Iron Ore Route',
  () => 'Swedish iron ore reaches the Reich through the Norwegian port of Narvik. The British are mining Norwegian waters and preparing to land. The naval staff has a plan to seize Denmark and Norway in a single morning.',
  [{ label: 'Invade Denmark and Norway', fx: (sim, N) => { for (const k of ['Denmark', 'Norway']) { const x = K(sim, k); if (x && !at(sim, N.code, x)) { enterWar(sim, N.code, x, `German forces invade ${sim.nm(x)}.`); joinFaction(sim, x, 'Allies'); } } frontOne(sim, N.code, K(sim, 'Denmark')); return 'Copenhagen wakes to German soldiers in the streets. Norway fights.'; } },
   { label: 'Respect Scandinavian neutrality', fx: () => 'The ore keeps coming, for as long as the British allow it.' }],
  { notify: ['Denmark', 'Norway'] });
tl('fall_gelb', D(1940, 5, 10), 'Germany', sim => { const de = K(sim, 'Germany'), fr = K(sim, 'France'); return de && at(sim, de, fr) && free(sim, fr) && (neutral(sim, K(sim, 'Belgium')) || neutral(sim, K(sim, 'Netherlands'))) && {}; },
  'Case Yellow',
  () => 'The French have spent eight months behind the Maginot Line. The plan: strike through the Netherlands and Belgium while the panzers cross the Ardennes, where nobody expects them, and race for the Channel.',
  [{ label: 'Strike through the Low Countries and the Ardennes', fx: (sim, N) => { for (const k of ['Netherlands', 'Belgium']) { const x = K(sim, k); if (x && !at(sim, N.code, x)) { enterWar(sim, N.code, x, `German forces invade ${sim.nm(x)}.`); joinFaction(sim, x, 'Allies'); } } frontOne(sim, N.code, K(sim, 'France')); frontOne(sim, N.code, K(sim, 'Belgium')); surprise(sim, N.code, ['France', 'Belgium', 'Netherlands', 'United Kingdom'], 50); return 'Paratroopers drop on Rotterdam and the forts of the Meuse. The Blitzkrieg turns west.'; } },
   { label: 'Attack the Maginot Line head on', fx: (sim, N) => { frontOne(sim, N.code, K(sim, 'France')); return 'The neutrals are spared. The generals expect a bloodbath.'; } }],
  { notify: ['France', 'Belgium', 'Netherlands', 'United Kingdom'] });
tl('italy', D(1940, 6, 10), 'Italy', sim => { const it = K(sim, 'Italy'), fr = K(sim, 'France'), de = K(sim, 'Germany'); return it && free(sim, fr) && at(sim, de, fr) && !at(sim, it, fr) && (lostShare(sim, fr) >= 0.1 || it === sim.s.player) && {}; },
  'A Seat at the Peace Table',
  (c, N, sim) => `${lostShare(sim, K(sim, 'France')) >= 0.1 ? 'The French front is breaking: the Germans are across the Somme.' : 'The war in the west goes on.'} The Duce\'s generals warn the army is not ready, but if Italy waits, the spoils of the war will go to Germany alone.`,
  [{ label: 'Declare war on France and Britain', fx: (sim, N) => { for (const k of ['France', 'United Kingdom']) { const x = K(sim, k); if (x && !at(sim, N.code, x)) enterWar(sim, N.code, x, `Italy declares war on ${sim.nm(x)}.`); } frontOne(sim, N.code, K(sim, 'France')); const de = K(sim, 'Germany'); if (de) sim.addOpinion(de, N.code, 20); return '"The hand that held the dagger has struck it into the back of its neighbour."'; } },
   { label: 'Remain non-belligerent', fx: (sim, N) => { const de = K(sim, 'Germany'); if (de) sim.addOpinion(de, N.code, -20); return 'Italy watches from the sidelines.'; } }],
  { until: D(1941, 12, 31), notify: ['France', 'United Kingdom'] });
tl('baltics', D(1940, 6, 15), 'Soviet Union', sim => { const su = K(sim, 'Soviet Union'); return su && ['Estonia', 'Latvia', 'Lithuania'].some(k => neutral(sim, K(sim, k))) && !at(sim, su, K(sim, 'Germany')) && {}; },
  'The Baltic Question',
  () => 'The pact with Germany placed Estonia, Latvia and Lithuania in the Soviet sphere. While the world watches France fall, the Red Army could take them with an ultimatum and a few divisions.',
  [{ label: 'Occupy and annex the Baltic states', fx: (sim, N) => { const out = []; for (const k of ['Estonia', 'Latvia', 'Lithuania']) { const x = K(sim, k); if (!x || !neutral(sim, x)) continue; if (x === sim.s.player) { enterWar(sim, N.code, x, `The Red Army crosses into ${sim.nm(x)}.`); continue; } for (const r of sim.regionsOf(x)) sim.transfer(r, N.code, true); out.push(k); } earn(sim, N.code, 'tyrant', 15); return out.length ? `${out.join(', ')} are annexed after rigged elections.` : 'The Red Army marches.'; } },
   { label: 'Leave them be', fx: () => 'The Baltic republics keep their fragile independence.' }],
  { notify: ['Estonia', 'Latvia', 'Lithuania'] });
tl('bessarabia', D(1940, 6, 26), 'Romania', sim => { const ro = K(sim, 'Romania'), su = K(sim, 'Soviet Union'); return ro && su && !at(sim, ro, su) && sim.regionsOf(ro).some(r => sim.w.adj[r.i].some(j => sim.s.regions[j].owner === su)) && {}; },
  'A Soviet Ultimatum',
  () => 'Moscow gives Romania twenty-four hours to hand over Bessarabia and northern Bukovina. France, Romania\'s guarantor, has just surrendered; Germany advises Bucharest to give way.',
  [{ label: 'Yield the provinces', fx: (sim, N) => { const su = K(sim, 'Soviet Union'); const land = sim.regionsOf(N.code).filter(r => sim.w.adj[r.i].some(j => sim.s.regions[j].owner === su)).slice(0, 3); for (const r of land) sim.transfer(r, su, true); N.gov.approval -= 0.12; N.gov.stability -= 0.05; return `Romania gives up ${land.length} provinces without a shot.`; } },
   { label: 'Refuse and fight', fx: (sim, N) => { enterWar(sim, K(sim, 'Soviet Union'), N.code, 'The Red Army invades Romania.'); return 'Romania mobilises. It stands alone.'; } }]);
tl('tripartite', D(1940, 9, 27), 'Japan', sim => { const jp = K(sim, 'Japan'), de = K(sim, 'Germany'); return jp && de && free(sim, de) && faction(sim, jp)?.faction !== 'Axis' && {}; },
  'The Tripartite Pact',
  () => 'Berlin and Rome propose a pact: each will come to the aid of the others if attacked by a power not yet in the war. Everyone understands which power that means: the United States.',
  [{ label: 'Sign the Tripartite Pact', fx: (sim, N) => { joinFaction(sim, N.code, 'Axis'); const P = factionPact(sim, 'Axis'); if (P) P.doctrines.defense = true; const us = K(sim, 'United States'); if (us) { sim.addOpinion(us, N.code, -25); sim.s.ww2.usTension += 10; } return 'The Axis spans the world from Berlin to Tokyo.'; } },
   { label: 'Keep Japan\'s hands free', fx: (sim, N) => { const de = K(sim, 'Germany'); if (de) sim.addOpinion(de, N.code, -15); return 'Tokyo keeps its own counsel.'; } }],
  { notify: ['United States'] });
for (const [k, day] of [['Hungary', D(1940, 11, 20)], ['Romania', D(1940, 11, 23)], ['Bulgaria', D(1941, 3, 1)]])
  tl('axis_' + k, day, k, sim => { const me = K(sim, k), de = K(sim, 'Germany'); return me && de && free(sim, me) && !faction(sim, me) && !at(sim, me, de) && {}; },
    `${k} and the Axis`, (c, N, sim) => `Germany dominates Europe from the Atlantic to the Bug. Berlin invites ${sim.nm(N.code)} to sign the Tripartite Pact: protection, arms, and a share of the spoils, at the price of marching when Germany marches.`,
    [{ label: 'Join the Axis', fx: (sim, N) => { joinFaction(sim, N.code, 'Axis'); return 'The Axis grows.'; } },
     { label: 'Stay neutral', fx: (sim, N) => { const de = K(sim, 'Germany'); if (de) sim.addOpinion(de, N.code, -25); return 'A dangerous neutrality, on Germany\'s doorstep.'; } }],
    { ai: (sim) => lostShare(sim, K(sim, 'Germany')) < 0.1 ? 0 : 1 });
tl('greece', D(1940, 10, 28), 'Italy', sim => { const it = K(sim, 'Italy'), gr = K(sim, 'Greece'); return it && at(sim, it, K(sim, 'United Kingdom')) && neutral(sim, gr) && {}; },
  'An Ultimatum to Athens',
  () => 'The Duce is furious that Germany conquers without consulting him. He will present Greece with an ultimatum at three in the morning, demanding free passage for Italian troops from Albania. The answer will be "no".',
  [{ label: 'Invade Greece', fx: (sim, N) => { const gr = K(sim, 'Greece'); enterWar(sim, N.code, gr, 'Italy invades Greece from Albania. Greece answers: "Ochi!"'); joinFaction(sim, gr, 'Allies'); frontOne(sim, N.code, gr); return 'The war comes to the Balkans.'; } },
   { label: 'Leave Greece alone', fx: () => 'The ultimatum stays in its drawer.' }],
  { notify: ['Greece'] });

// ------------------------------------------------------------------ 1941
tl('lend_lease', D(1941, 3, 11), 'United States', sim => { const uk = K(sim, 'United Kingdom'), de = K(sim, 'Germany'); return uk && de && at(sim, uk, de) && !sim.s.ww2.lendLease && {}; },
  'The Arsenal of Democracy',
  () => 'Britain cannot pay cash for American arms much longer. The President proposes to lend, lease or otherwise dispose of war materials to any nation whose defence is vital to the United States. The isolationists in Congress call it a road to war.',
  [{ label: 'Sign the Lend-Lease Act', fx: (sim, N) => { sim.s.ww2.lendLease = true; for (const k of ['Germany', 'Italy']) { const x = K(sim, k); if (x) sim.addOpinion(x, N.code, -20); } earn(sim, N.code, 'steadfast', 10); return 'Ships, tanks, aircraft and food will flow across the oceans to those who fight the Axis.'; } },
   { label: 'Cash and carry only', fx: (sim, N) => { const uk = K(sim, 'United Kingdom'); if (uk) sim.addOpinion(uk, N.code, -15); return 'America stays the arsenal of nobody.'; } }],
  { notify: ['United Kingdom'] });
tl('marita', D(1941, 4, 6), 'Germany', sim => { const de = K(sim, 'Germany'), yu = K(sim, 'Yugoslavia'); return de && yu && at(sim, de, K(sim, 'United Kingdom')) && free(sim, yu) && faction(sim, yu)?.faction !== 'Axis' && !at(sim, de, yu) && {}; },
  'Coup in Belgrade',
  () => 'Two days after signing the Tripartite Pact, Yugoslav officers have overthrown their government; crowds in Belgrade shout "better war than the pact". The British are landing in Greece. The southern flank of the coming campaign in the east is open.',
  [{ label: 'Invade Yugoslavia and Greece', fx: (sim, N) => { for (const k of ['Yugoslavia', 'Greece']) { const x = K(sim, k); if (x && free(sim, x) && !at(sim, N.code, x)) { enterWar(sim, N.code, x, `German forces invade ${sim.nm(x)}.`); joinFaction(sim, x, 'Allies'); } } for (const k of ['Hungary', 'Bulgaria', 'Italy']) { const x = K(sim, k), yu = K(sim, 'Yugoslavia'); if (x && yu && faction(sim, x)?.faction === 'Axis' && !at(sim, x, yu)) enterWar(sim, x, yu, `${sim.nm(x)} joins the attack on Yugoslavia.`); } frontOne(sim, N.code, K(sim, 'Yugoslavia')); return 'Belgrade is bombed on Palm Sunday. The Balkans are overrun.'; } },
   { label: 'Leave the Balkans to diplomacy', fx: () => 'Berlin swallows the insult, for now.' }],
  { notify: ['Yugoslavia', 'Greece'] });
tl('jp_su', D(1941, 4, 13), 'Japan', sim => { const jp = K(sim, 'Japan'), su = K(sim, 'Soviet Union'); return jp && su && !at(sim, jp, su) && sim.rel(jp, su) !== 'nap' && {}; },
  'Neutrality with Moscow',
  () => 'The Soviet foreign minister offers a pact of neutrality: Japan would be free to strike south, the Soviet Union free to face Germany.',
  [{ label: 'Sign the neutrality pact', fx: (sim, N) => { sim.setRel(N.code, K(sim, 'Soviet Union'), 'nap'); return 'Japan and the Soviet Union promise each other peace.'; } },
   { label: 'Keep our hands free in the north', fx: () => 'The Kwantung Army keeps watching the Amur.' }]);
tl('barbarossa', D(1941, 6, 22), 'Germany', sim => { const de = K(sim, 'Germany'), su = K(sim, 'Soviet Union'); return de && su && free(sim, de) && !at(sim, de, su) && lostShare(sim, de) < 0.15 && {}; },
  'Operation Barbarossa',
  () => 'Three million men, three thousand tanks and two thousand aircraft stand on the Soviet frontier, from the Baltic to the Black Sea. The pact with Moscow is not yet two years old. The generals promise victory before the winter.',
  [{ label: 'Launch Barbarossa', fx: (sim, N) => { const su = K(sim, 'Soviet Union'); enterWar(sim, N.code, su, 'Germany invades the Soviet Union along a front of two thousand kilometres.'); for (const k of ['Romania', 'Hungary', 'Slovakia', 'Italy', 'Finland']) { const x = K(sim, k); if (x && free(sim, x) && !at(sim, x, su) && (faction(sim, x)?.faction === 'Axis' || (k === 'Finland' && sim.s.ww2.finRefused))) enterWar(sim, x, su, `${sim.nm(x)} joins the war on the Soviet Union.`); } frontOne(sim, N.code, su); for (const u of sim.s.units) if (u.nation === su && !sim.w.regions[u.loc].sea && sim.w.adj[u.loc].some(j => sim.s.regions[j].owner === N.code)) u.hp = Math.max(1, u.hp - u.mhp * 0.3); for (const k of ['United Kingdom', 'United States']) { const x = K(sim, k); if (x) { sim.addOpinion(x, su, 40); sim.addOpinion(su, x, 40); } } surprise(sim, N.code, ['Soviet Union'], 75); return 'The surprise is total. Whole Soviet armies are encircled in the first weeks.'; } },
   { label: 'Keep the pact with Stalin', fx: () => 'The trains of Soviet grain and oil keep rolling west.' }],
  { notify: ['Soviet Union', 'United Kingdom'] });
tl('embargo', D(1941, 7, 26), 'United States', sim => { const jp = K(sim, 'Japan'), us = K(sim, 'United States'); return jp && us && at(sim, jp, K(sim, 'China')) && !at(sim, jp, us) && !sim.s.nations[jp].embargo && {}; },
  'Japanese Troops in Indochina',
  () => 'Japanese troops have marched into southern French Indochina, within bombing range of Malaya, Singapore and the oil of the Indies. Japan buys four fifths of its oil from the United States.',
  [{ label: 'Freeze Japanese assets and embargo oil', fx: (sim, N) => { const jp = K(sim, 'Japan'); sim.s.nations[jp].embargo = true; sim.addOpinion(jp, N.code, -40); for (const k of ['United Kingdom', 'Netherlands']) { const x = K(sim, k); if (x) sim.addOpinion(jp, x, -20); } return 'Britain and the Dutch follow. Japan has oil for perhaps eighteen months.'; } },
   { label: 'Keep selling oil', fx: (sim, N) => { const cn = K(sim, 'China'); if (cn) sim.addOpinion(cn, N.code, -25); return 'Tankers keep sailing for Yokohama.'; } }],
  { notify: ['Japan'] });
tl('pearl_harbor', D(1941, 12, 7), 'Japan', sim => { const jp = K(sim, 'Japan'), us = K(sim, 'United States'); return jp && us && free(sim, jp) && !at(sim, jp, us) && (sim.s.nations[jp].embargo || jp === sim.s.player) && {}; },
  'Climb Mount Niitaka',
  () => 'The oil embargo is strangling the empire; the reserves are running down every day. The Combined Fleet\'s carriers are at sea, north of Hawaii, under radio silence. Negotiations in Washington have failed. The order to attack needs only to be sent.',
  [{ label: 'Strike Pearl Harbor and the southern resource areas', fx: (sim, N) => {
      const us = K(sim, 'United States');
      enterWar(sim, N.code, us, 'Japanese carrier aircraft strike the American fleet at Pearl Harbor. A date which will live in infamy.');
      for (const k of ['United Kingdom', 'Netherlands', 'Dutch East Indies']) { const x = K(sim, k); if (x && free(sim, x) && !at(sim, N.code, x)) enterWar(sim, N.code, x, `Japan attacks the ${sim.nm(x)} in the Pacific.`); }
      // the fleet at anchor
      for (const u of [...sim.s.units]) if (u.nation === us && UNITS[u.type].domain === 'sea' && sim.T[u.loc].lon < -140 && sim.T[u.loc].lon > -170) { u.hp -= u.mhp * 0.7; if (u.hp <= 0 || UNITS[u.type].line === 'NAV' && Math.random() < 0.5) sim.removeUnit(u); }
      const U = sim.s.nations[us]; U.gov.approval = clamp(U.gov.approval + 0.25, 0, 1); U.exhaustion = 0; U.budget = { defense: 0.5, social: 0.2, infra: 0.15, research: 0.15 };
      sim.s.ww2.usIn = true; if (!faction(sim, us)) joinFaction(sim, us, 'Allies');
      return 'Eight battleships are sunk or crippled at their moorings. The American carriers were at sea.'; } },
   { label: 'Seek terms with Washington: withdraw from Indochina', fx: (sim, N) => { N.embargo = false; N.gov.approval -= 0.12; N.gov.stability -= 0.06; const us = K(sim, 'United States'); if (us) sim.addOpinion(us, N.code, 15); return 'The army is furious; there is talk of a coup. The oil flows again.'; } }],
  { notify: ['United States', 'United Kingdom'] });
tl('germany_us', D(1941, 12, 11), 'Germany', sim => { const de = K(sim, 'Germany'), us = K(sim, 'United States'); return de && us && free(sim, de) && at(sim, us, K(sim, 'Japan')) && !at(sim, de, us) && {}; },
  'The Reichstag Meets',
  () => 'Japan has struck the Americans. The Tripartite Pact does not oblige Germany to join an attack Japan began, but American destroyers are already escorting convoys and firing on U-boats. The Leader will address the Reichstag this afternoon.',
  [{ label: 'Declare war on the United States', fx: (sim, N) => { const us = K(sim, 'United States'); enterWar(sim, N.code, us, 'Germany declares war on the United States.'); const it = K(sim, 'Italy'); if (it && free(sim, it) && faction(sim, it)?.faction === 'Axis' && !at(sim, it, us)) enterWar(sim, it, us, 'Italy declares war on the United States.'); return 'The war is now a world war in every sense.'; } },
   { label: 'Leave Japan to its own war', fx: (sim, N) => { const jp = K(sim, 'Japan'); if (jp) sim.addOpinion(jp, N.code, -30); return 'America\'s anger stays fixed on the Pacific, for now.'; } }]);

// ------------------------------------------------------------------ 1942-1945
tl('united_nations', D(1942, 1, 1), null, sim => ({}), 'The Declaration by United Nations',
  () => 'In Washington, the nations at war with the Axis pledge to employ their full resources against it and to make no separate peace. Will you sign?',
  [{ label: 'Sign the Declaration', fx: (sim, N) => { joinFaction(sim, N.code, 'Allies'); return 'One more name on the roll of the United Nations.'; } },
   { label: 'Fight our own war', fx: () => 'You keep your freedom of action.' }],
  { each: sim => Object.values(sim.s.nations).filter(N => N.alive && free(sim, N.code) && faction(sim, N.code)?.faction !== 'Allies' && ['Germany', 'Japan', 'Italy'].some(k => at(sim, N.code, K(sim, k)))).map(N => N.code) });
tl('manhattan', D(1942, 6, 17), 'United States', sim => { const us = K(sim, 'United States'); return us && ['Germany', 'Japan'].some(k => at(sim, us, K(sim, k))) && !sim.s.ww2.bomb?.[us] && {}; },
  'A Letter from Einstein',
  () => 'Physicists warn that an atomic bomb is possible, that Germany may be building one, and that uranium fission could destroy a city with a single weapon. The Army proposes a secret programme on a scale never seen: new cities, new factories, the best scientists of the free world.',
  [{ label: 'Authorise the Manhattan Project', fx: (sim, N) => { startBomb(sim, N.code, 1); return 'The programme is born in secrecy at Los Alamos, Oak Ridge and Hanford.'; } },
   { label: 'Too costly, too uncertain', fx: () => 'The physicists go back to radar and proximity fuzes.' }]);
tl('italy_armistice', D(1943, 7, 25), 'Italy', sim => { const it = K(sim, 'Italy'); return it && free(sim, it) && faction(sim, it)?.faction === 'Axis' && ['United Kingdom', 'United States'].some(k => at(sim, it, K(sim, k))) && (lostShare(sim, it) >= 0.08 || sim.s.nations[it].exhaustion > 0.5) && {}; },
  'The Grand Council Votes',
  () => 'Allied armies stand on Italian soil and the cities are bombed nightly. The Fascist Grand Council has voted against the Duce, and the King is ready to dismiss him. The new government could seek an armistice with the Allies.',
  [{ label: 'Depose the Duce and sign an armistice', fx: (sim, N) => { for (const e of sim.warsOf(N.code)) sim.makePeace(N.code, e, true); const ax = factionPact(sim, 'Axis'); if (ax) ax.members = ax.members.filter(m => m !== N.code); N.ideo = 'monarchy'; N.gov.title = 'Marshal'; joinFaction(sim, N.code, 'Allies'); const de = K(sim, 'Germany'); if (de && de !== sim.s.player) enterWar(sim, de, N.code, 'German forces disarm the Italian army and occupy Italy.'); return 'Italy changes sides. The Germans pour in from the Alps.'; } },
   { label: 'Fight on beside Germany', fx: (sim, N) => { N.gov.stability -= 0.08; return 'The regime clings on.'; } }],
  { until: D(1945, 5, 1), notify: ['Germany', 'United Kingdom', 'United States'] });
tl('overlord', D(1944, 6, 6), 'United Kingdom', sim => { const beach = beachhead(sim); return beach != null && { b: beach }; },
  'Operation Overlord',
  (c, N, sim) => `The greatest invasion fleet in history is assembled in the ports of southern England: five thousand ships, a hundred and fifty thousand men. The meteorologists see a break in the weather. The landing grounds: ${sim.w.regions[c.b].name}.`,
  [{ label: 'Launch the invasion of Europe', fx: (sim, N, c) => { const n = landInvasion(sim, c.b); return `D-Day: ${n} Allied divisions land in ${sim.w.regions[c.b].name}. The second front is open.`; } },
   { label: 'Postpone it another year', fx: () => 'The Soviets will fight on alone in the east. Stalin is furious.' }],
  { until: D(1945, 3, 1), notify: ['Germany', 'United States', 'Soviet Union'] });
tl('august_storm', D(1945, 8, 8), 'Soviet Union', sim => { const su = K(sim, 'Soviet Union'), jp = K(sim, 'Japan'), de = K(sim, 'Germany'); return su && jp && free(sim, su) && !at(sim, su, jp) && (!de || sim.s.nations[de].occupied) && at(sim, jp, K(sim, 'United States')) && {}; },
  'The Promise of Yalta',
  () => 'Germany is beaten. At Yalta, the Soviet Union promised to enter the war against Japan three months after victory in Europe. A million and a half men stand on the Manchurian border.',
  [{ label: 'Declare war on Japan', fx: (sim, N) => { const jp = K(sim, 'Japan'); enterWar(sim, N.code, jp, 'The Soviet Union declares war on Japan and storms into Manchuria.'); const mk = K(sim, 'Manchukuo'); if (mk && !at(sim, N.code, mk)) enterWar(sim, N.code, mk, null); frontOne(sim, N.code, mk || jp); return 'The Kwantung Army collapses.'; } },
   { label: 'Keep the neutrality pact', fx: () => 'The Soviet Union stays out of the Pacific war.' }],
  { until: D(1946, 12, 31), notify: ['Japan'] });
tl('surrender', D(1945, 1, 1), 'Japan', sim => { const jp = K(sim, 'Japan'); return jp && free(sim, jp) && sim.warsOf(jp).length && ((sim.s.ww2.bombed?.[jp] || 0) >= 2 || (sim.s.ww2.bombed?.[jp] && sim.s.nations[jp].exhaustion > 0.5)) && {}; },
  'The Sacred Decision',
  (c, N, sim) => `${sim.s.ww2.bombed?.[N.code] || 0} cities have been destroyed by atomic bombs. The cabinet is deadlocked between accepting the Allied terms and a last battle on the home islands.`,
  [{ label: 'Accept the Allied terms: endure the unendurable', fx: (sim, N) => { capitulate(sim, N.code); return 'The Emperor\'s voice is heard on the radio for the first time.'; } },
   { label: 'Fight on to the last', fx: (sim, N) => { N.gov.stability -= 0.1; return 'The army prepares to defend every beach and every village.'; } }],
  { until: D(1947, 12, 31), notify: ['United States', 'United Kingdom', 'China', 'Soviet Union'] });

// the bomb: a programme that takes years and a fortune
export function startBomb(sim, c, k = 1) {
  const W = sim.s.ww2; W.bomb ||= {};
  if (W.bomb[c]) return;
  W.bomb[c] = { prog: 0, need: 160000 / k, since: sim.s.t };
  if (c === sim.s.player) sim.emit('info', 'The atomic programme begins. Progress is shown under War in the Rule tab.', [c]);
}
function bombDaily(sim) {
  const s = sim.s, W = s.ww2;
  for (const [c, B] of Object.entries(W.bomb || {})) {
    const N = s.nations[c];
    if (!N?.alive || N.occupied || B.done) continue;
    B.prog += (N.st.rp || 0) * 0.3; N.wealth -= inc(N) * 0.03;
    if (B.prog >= B.need) {
      B.done = true; N.techs.nuclear_fission = 1; N.techs.nuclear_weapons = 1; N.warheads = (N.warheads || 0) + 2; computeMods(s, N);
      sim.emit('nuke', `In the desert, the ${sim.nm(c)} detonate the first atomic bomb. "Now I am become Death, the destroyer of worlds."`, [c], { major: true });
      W.bombReady = W.bombReady || c;
      if (c === s.player) sim.emit('info', 'Two atomic bombs are ready. Bring a bomber within range of an enemy city, select the city, and the strike is yours to order.', [c], { major: true });
    }
  }
  // an AI power with the bomb uses it on the enemy that will not surrender
  for (const [c, B] of Object.entries(W.bomb || {})) {
    const N = s.nations[c];
    if (!B.done || !N?.alive || !N.ai || !N.warheads || s.t % (DAY * 3)) continue;
    const foe = sim.warsOf(c).map(e => s.nations[e]).filter(E => E.alive && !E.occupied).sort((a, b) => b.gdp - a.gdp)[0];
    if (!foe) continue;
    const cities = sim.regionsOf(foe.code).filter(r => r.lvl >= 3).sort((a, b) => b.pop - a.pop);
    const r = cities.find(x => sim.nukeCheck(c, x.i).ok);
    if (r) sim.nuke(c, r.i);
  }
}
// a German-held stretch of the French Channel coast, as close to England as can be found
function beachhead(sim) {
  const s = sim.s, de = K(sim, 'Germany'), fr = s.ww2.code.France, uk = K(sim, 'United Kingdom'), us = K(sim, 'United States');
  if (!de || !uk || !at(sim, uk, de) || (us && !at(sim, us, de))) return null;
  const c = s.regions.filter(r => !r.sea && r.owner === de && r.core === fr && sim.T[r.i].coastal && sim.T[r.i].lat > 46 && sim.T[r.i].lon < 3);
  if (!c.length) return null;
  return c.sort((a, b) => Math.hypot(sim.T[a.i].lat - 50.5, sim.T[a.i].lon + 0.5) - Math.hypot(sim.T[b.i].lat - 50.5, sim.T[b.i].lon + 0.5))[0].i;
}
function landInvasion(sim, i) {
  let n = 0;
  for (const [k, count] of [['United States', 7], ['United Kingdom', 5], ['Canada', 2]]) {
    const c = K(sim, k); if (!c || sim.s.nations[c].occupied || (c === sim.s.player && k !== 'United Kingdom' && k !== 'United States')) continue;
    const N = sim.s.nations[c];
    for (let j = 0; j < count; j++) { const t = bestOf(N, j % 4 === 1 ? 'CAV' : j % 4 === 3 ? 'SGE' : 'INF'); if (t) { sim.spawn(c, t, i); n++; } }
  }
  return n;
}

// ------------------------------------------------------------------ the timeline engine
const TIMELINE = EV.filter(e => e.timeline);
export function ww2Timeline(sim) {
  const s = sim.s, W = s.ww2; if (!W) return;
  W.fired ||= {}; W.queue ||= [];
  const d = Math.floor(s.t / DAY);
  if (!s.pendingEvent && W.queue.length) present(sim, W.queue.shift());
  for (const E of TIMELINE) {
    if (W.fired[E.id] !== undefined || d < E.day) continue;
    if (E.until != null && d > E.until) { W.fired[E.id] = 'lapsed'; continue; }
    // events that go to every nation in a position to answer
    if (E.each) {
      W.fired[E.id] = d;
      for (const c of E.each(sim)) { if (c === s.player) offer(sim, E, c, {}); else { const N = s.nations[c]; E.options[0].fx(sim, N, {}); } }
      continue;
    }
    const who = K(sim, E.who);
    if (!who) { W.fired[E.id] = 'gone'; continue; }
    const ctx = E.cond(sim, who);
    if (!ctx) { if (E.until == null) W.fired[E.id] = 'void'; continue; }
    if (who === s.player) { W.fired[E.id] = d; offer(sim, E, who, ctx); continue; }
    const N = s.nations[who];
    const k = typeof E.ai === 'function' ? E.ai(sim, N, ctx) : E.ai;
    if (k < 0) continue; // the AI waits (it is asked again tomorrow, until the window closes)
    W.fired[E.id] = d;
    const out = E.options[k].fx(sim, N, ctx);
    computeMods(s, N);
    const P = s.nations[s.player];
    if (P?.alive && E.notify?.includes(P.key)) offer(sim, NEWS, s.player, { title: E.title, text: out, who: sim.nm(who) });
  }
  bombDaily(sim);
}
function offer(sim, E, c, ctx) { const s = sim.s; const item = { id: E.id, ctx }; if (s.pendingEvent) s.ww2.queue.push(item); else present(sim, item); }
function present(sim, item) {
  const s = sim.s, N = s.nations[s.player], E = EVENTS_BY_ID.get(item.id);
  if (!E || !N?.alive) return;
  item.ctx.cap = sim.w.regions[N.capital].name;
  s.pendingEvent = { id: E.id, ctx: item.ctx, title: E.id === NEWS.id ? item.ctx.title : E.title, text: E.text(item.ctx, N, sim), options: E.options.map(o => o.label) };
  for (const f of sim.listeners) f({ kind: 'rp', ev: s.pendingEvent });
}
// news of a decision taken elsewhere that touches you
const NEWS = { id: 'w_news', scen: 'ww2', timeline: true, day: 1e9, title: 'News', text: c => `${c.who}: ${c.text}`, options: [{ label: 'We must prepare', fx: (sim, N) => { N.gov.stability = clamp(N.gov.stability + 0.01, 0, 1); return 'The cabinet meets through the night.'; } }] };
EV.push(NEWS);

// ------------------------------------------------------------------ the wartime deck
const atWar = (sim, N) => sim.warsOf(N.code).length > 0;
// a strategic surprise: the attacker's momentum and the defenders' confusion, for the first weeks (AI governments only:
// a player is never handicapped by the script, and a player who attacks earns their own momentum)
function surprise(sim, attacker, victims, days) {
  const s = sim.s, A = s.nations[attacker];
  boost(sim, A, days, { atkLand: 0.2, speedLand: 0.1 });
  for (const k of victims) { const c = K(sim, k); if (c && c !== s.player) boost(sim, s.nations[c], days, { atkLand: -0.25, defLand: -0.3 }); }
}
// a temporary edge (folded into the nation's modifiers by gov.js computeMods until it runs out)
export const boost = (sim, N, days, fx) => { if (!N) return; N.boosts = (N.boosts || []).filter(b => b.until > sim.s.t); N.boosts.push({ fx, until: sim.s.t + DAY * days }); computeMods(sim.s, N); };
const enemy = (sim, N) => { const w = sim.warsOf(N.code); return w.length ? pick(w) : null; };
const occProv = (sim, N, f = () => true) => { const r = occupiedBy(sim, N.code).filter(f); return r.length ? pick(r) : null; };
ev('rationing', 'Rationing', (sim, N) => atWar(sim, N) && (N.food < (N.st.foodCons || 1) * 40 || N.blockade > 0.2) && {},
  () => 'U-boats and blockade have cut the imports of food. The Ministry of Food proposes ration books for every household: so many ounces of meat, butter, sugar and tea a week.',
  [{ label: 'Introduce rationing (food use −, approval −)', fx: (sim, N) => { N.rationing = true; N.food += (N.st.foodCons || 1) * 15; N.gov.approval -= 0.03; return 'Queues and ration books. Nobody starves; nobody eats well.'; } },
   { label: 'Trust the market', fx: (sim, N) => { N.gov.stability -= 0.03; return 'Prices soar. The black market thrives.'; } }]);
ev('bonds', 'War Bonds', (sim, N) => atWar(sim, N) && {},
  () => 'The treasury proposes a great war bond drive: film stars, parades, posters on every wall. "Buy a bomber!"',
  [{ label: 'Launch the drive (wealth +, approval +)', fx: (sim, N) => { const v = inc(N) * 15; N.wealth += v; N.gov.approval += 0.02; return `The people lend ${Math.round(v)} to the war.`; } },
   { label: 'Raise taxes instead (wealth ++, approval −)', fx: (sim, N) => { const v = inc(N) * 25; N.wealth += v; N.gov.approval -= 0.04; return `A war tax raises ${Math.round(v)}.`; } }]);
ev('conscription', 'Call-Up', (sim, N) => atWar(sim, N) && N.exhaustion < 0.6 && {},
  () => 'The General Staff asks for another class of conscripts: older men, students, workers from reserved trades.',
  [{ label: 'Call them up (troops +, production −, approval −)', fx: (sim, N) => { const t = bestOf(N, 'INF'); for (let k = 0; k < 3; k++) if (t) sim.spawn(N.code, t, N.capital); N.gov.approval -= 0.03; N.exhaustion = clamp(N.exhaustion + 0.03, 0, 1); return 'Three new divisions form in the capital.'; } },
   { label: 'Keep them in the factories', fx: () => 'Production holds; the generals grumble.' }]);
ev('refugees', 'Refugees at the Border', (sim, N) => !atWar(sim, N) || N.ideo === 'democratic' ? (Object.values(sim.s.nations).some(x => x.occupied) || sim.s.ww2.exiles.length) && {} : null,
  () => 'Tens of thousands of people fleeing the war and the occupiers are at the frontier: families, scholars, soldiers who escaped. Others want the border closed.',
  [{ label: 'Open the border (food −, approval −, reputation +)', fx: (sim, N) => { N.food = Math.max(0, N.food - (N.st.foodCons || 1) * 5); N.gov.approval -= 0.02; earn(sim, N.code, 'peacemaker', 10); sim.regionsOf(N.code).forEach((r, k) => { if (k < 3) r.pop *= 1.01; }); return 'The refugees are taken in. Some will build new lives; some will join the fight.'; } },
   { label: 'Close it', fx: (sim, N) => { N.gov.stability += 0.01; return 'The gates close. What happens to them now is on the other side of the wire.'; } }]);
ev('spies', 'A Spy Ring', (sim, N) => atWar(sim, N) && { x: enemy(sim, N) },
  (c, N, sim) => `Counter-intelligence has uncovered a ring of agents working for the ${sim.nm(c.x)}, with a radio set in a flat near the docks of ${c.cap}.`,
  [{ label: 'Turn them: feed the enemy false reports', fx: (sim, N) => { boost(sim, N, 120, { covert: 0.1 }); N.research.prog += (N.st.rp || 1) * 3; return 'The double-cross begins. The enemy will believe what we want him to.'; } },
   { label: 'Try them publicly', fx: (sim, N) => { N.gov.approval += 0.02; return 'The trial fills the newspapers for a week.'; } }]);
ev('strike', 'Strike in the War Factories', (sim, N) => atWar(sim, N) && N.ideo === 'democratic' && N.gov.approval < 0.6 && {},
  () => 'Munitions workers have walked out over wages and twelve-hour shifts. Shell production has stopped at three plants.',
  [{ label: 'Meet their demands (wealth −, approval +)', fx: (sim, N) => { N.wealth -= inc(N) * 8; N.gov.approval += 0.03; return 'The workers go back. The unions remember who listened.'; } },
   { label: 'Send in the troops (stability +, approval −)', fx: (sim, N) => { N.gov.approval -= 0.06; N.gov.stability += 0.02; return 'The strike is broken. Bitterness lingers on the factory floor.'; } }]);
ev('general', 'A General\'s Gamble', (sim, N) => atWar(sim, N) && { x: enemy(sim, N) },
  (c, N, sim) => `One of your boldest generals proposes a daring offensive against the ${sim.nm(c.x)}: a deep thrust that could break their front or lose an army.`,
  [{ label: 'Back the plan (attack + for 40 days)', fx: (sim, N) => { boost(sim, N, 40, { atkLand: 0.1 }); return 'The orders go out. Fortune favours the bold, sometimes.'; } },
   { label: 'Overrule him', fx: (sim, N) => { N.gov.stability += 0.01; return 'Caution prevails. The general sulks.'; } }]);
ev('propaganda', 'The Ministry of Truth', (sim, N) => atWar(sim, N) && N.exhaustion > 0.2 && {},
  () => 'The propaganda ministry wants to announce great victories that have not happened, to lift spirits at home.',
  [{ label: 'Print the victories (approval + now)', fx: (sim, N) => { N.gov.approval += 0.05; N.lies = (N.lies || 0) + 1; return 'Church bells ring for a victory that never was.'; } },
   { label: 'Tell the people the truth', fx: (sim, N) => { N.gov.stability += 0.03; N.gov.approval -= 0.01; return '"I have nothing to offer but blood, toil, tears and sweat."'; } }]);
ev('resistance', 'An Attack on the Garrison', (sim, N) => occupiedBy(sim, N.code).length > 0 && { r: occProv(sim, N) },
  (c, N, sim) => `Partisans have ambushed a supply convoy outside ${c.rn}, killing a dozen of our soldiers. The garrison commander requests authority for reprisals against the nearest village. This would be a war crime: ${CRIMES.reprisals.law}.`,
  [{ label: 'Hunt the attackers with police and informers', fx: (sim, N, c) => { if (c.r) c.r.unrest = Math.max(0, c.r.unrest - 0.05); return 'Arrests follow. The partisans melt into the woods.'; } },
   { label: 'Offer an amnesty to those who lay down arms', fx: (sim, N, c) => { if (c.r) { c.r.resent = Math.max(0, (c.r.resent || 0) - 0.15); c.r.unrest = Math.max(0, c.r.unrest - 0.03); } N.gov.pc = Math.max(0, N.gov.pc - 10); return 'A few come in from the forests. Hearts are not won in a day.'; } },
   { label: 'Authorise reprisals (a war crime)', fx: (sim, N, c) => { if (!N.conduct.reprisals) conduct(sim, N.code, 'reprisals'); if (c.r) c.r.unrest = Math.max(0, c.r.unrest - 0.15); return 'The order is given. It will be remembered, by the village and by the tribunal.'; } }]);
ev('pows', 'Prisoners of War', (sim, N) => atWar(sim, N) && { x: enemy(sim, N) },
  (c, N, sim) => `The camps hold tens of thousands of prisoners of the ${sim.nm(c.x)}. The Geneva Convention requires that they be fed, housed and not made to work for the war. The armaments ministry wants them in the mines.`,
  [{ label: 'Treat them by the Geneva Convention (food −)', fx: (sim, N, c) => { N.food = Math.max(0, N.food - (N.st.foodCons || 1) * 3); if (c.x) sim.addOpinion(c.x, N.code, 5); return 'The Red Cross inspects the camps and finds them in order.'; } },
   { label: 'Put them to work in the mines (a war crime)', fx: (sim, N, c) => { N.metal += (N.st.prod?.metal || 1) * 10; N.crimes.pows = (N.crimes.pows || 0) + 1; N.guilt += 5; earn(sim, N.code, 'criminal', 6); if (c.x) { sim.addOpinion(c.x, N.code, -20); sim.s.nations[c.x].exhaustion = Math.max(0, sim.s.nations[c.x].exhaustion - 0.03); } sim.s.ww2.log.push({ t: sim.s.t, c: N.code, kind: 'pows', victim: c.x, text: `The ${sim.nm(N.code)} work prisoners of war in their mines.` }); return 'Ore output rises. So does the death rate in the camps.'; } }]);
ev('scientists', 'Scientists in Flight', (sim, N) => N.ideo === 'democratic' && Object.values(sim.s.nations).some(x => x.alive && x.ideo === 'fascist' && x.gdp > 100) && {},
  () => 'Physicists, chemists and engineers fleeing persecution in Europe ask for refuge and work.',
  [{ label: 'Welcome them (research +)', fx: (sim, N) => { N.research.prog += (N.st.rp || 1) * 25; earn(sim, N.code, 'scholar', 6); return 'The laboratories gain some of the finest minds in the world.'; } },
   { label: 'Quotas are quotas', fx: () => 'They look for another country.' }]);
ev('neutral_ore', 'Strategic Minerals', (sim, N) => { const x = ['Sweden', 'Switzerland', 'Turkey', 'Spain', 'Portugal'].map(k => K(sim, k)).filter(c => c && c !== N.code && !sim.warsOf(c).length)[0]; return atWar(sim, N) && x && { x }; },
  (c, N, sim) => `Neutral ${sim.nm(c.x)} offers iron ore, tungsten and chrome, at a price, and in hard currency.`,
  [{ label: 'Buy (wealth −, metal +)', fx: (sim, N, c) => { N.wealth -= inc(N) * 10; N.metal += (N.st.prod?.metal || 1) * 12; if (c.x) sim.addOpinion(c.x, N.code, 6); return 'The ore trains cross the border.'; } },
   { label: 'Outbid the enemy just to deny it to him (wealth −−)', fx: (sim, N, c) => { N.wealth -= inc(N) * 18; for (const e of sim.warsOf(N.code)) sim.s.nations[e].metal *= 0.92; return 'Pre-emptive buying: the enemy gets less, and you pay for it.'; } },
   { label: 'Decline', fx: () => 'The ore goes elsewhere.' }]);
ev('air_raids', 'The Blitz', (sim, N) => atWar(sim, N) && sim.s.regions[N.capital].damage > 0.1 && {},
  (c) => `Night after night, enemy bombers come over ${c.cap}. Whole streets burn; families sleep in the underground stations.`,
  [{ label: 'Build shelters (wealth −, approval +)', fx: (sim, N) => { N.wealth -= inc(N) * 10; N.gov.approval += 0.04; return 'Shelters in every street. The city can take it.'; } },
   { label: 'Evacuate the children to the countryside', fx: (sim, N) => { N.gov.approval += 0.02; boost(sim, N, 180, { prod: -0.03 }); return 'Trains full of children with labels on their coats leave the capital.'; } },
   { label: 'Answer with our own bombers', fx: (sim, N) => { const k = canConduct(sim, N.code, 'terror'); if (k.ok) { conduct(sim, N.code, 'terror'); return 'The bombers go out. An eye for an eye.'; } return 'We have nothing that can reach them.'; } }]);
ev('codebreak', 'The Enemy\'s Cipher', (sim, N) => atWar(sim, N) && N.techs.codebreaking && {},
  () => 'The codebreakers have broken the enemy\'s main cipher. Every order to his armies and fleets can be read, for as long as he does not suspect.',
  [{ label: 'Use it everywhere (attack ++ for 20 days, then lost)', fx: (sim, N) => { boost(sim, N, 20, { atk: 0.15 }); return 'Victory follows victory. The enemy will soon wonder why.'; } },
   { label: 'Use it sparingly and protect the secret', fx: (sim, N) => { boost(sim, N, 150, { atk: 0.04, covert: 0.05 }); return 'Ultra stays secret. A small, steady edge.'; } }]);
ev('collaborators', 'Collaborators', (sim, N) => occupiedBy(sim, N.code).length >= 2 && { r: occProv(sim, N) },
  (c) => `Local notables in ${c.rn} offer to administer the province for us: their police, their courts, their officials, under our authority.`,
  [{ label: 'Accept: indirect rule (unrest −)', fx: (sim, N) => { for (const r of occupiedBy(sim, N.code)) r.unrest = Math.max(0, r.unrest - 0.06); return 'A quieter occupation. The resistance calls them traitors.'; } },
   { label: 'Direct military government', fx: (sim, N) => { N.gov.pc += 5; return 'Our officers rule directly.'; } }]);
ev('exiles', 'A Government in Exile', (sim, N) => N.ideo === 'democratic' && atWar(sim, N) && sim.s.ww2.exiles.some(x => !x.host) && { x: sim.s.ww2.exiles.find(x => !x.host) },
  (c) => `The government of ${c.x.name} has escaped the fall of its country and asks to set up in exile in ${c.cap}, with its gold, its fleet remnants and its soldiers.`,
  [{ label: 'Host them (soldiers +, partisans +)', fx: (sim, N, c) => { const x = sim.s.ww2.exiles.find(e => e.c === c.x.c); if (x) x.host = N.code; const t = bestOf(N, 'INF'); for (let k = 0; k < 2; k++) if (t) sim.spawn(N.code, t, N.capital); for (const r of sim.s.regions) if (r.core === c.x.c) r.resent = clamp((r.resent || 0) + 0.15, 0, 1); earn(sim, N.code, 'liberator', 8); return 'Exiled soldiers join your army; their radio calls their people to resist.'; } },
   { label: 'Decline politely', fx: () => 'They go elsewhere.' }]);
ev('weariness', 'War Weariness', (sim, N) => atWar(sim, N) && N.exhaustion > 0.35 && {},
  () => 'Casualty lists fill the newspapers. Mothers ask what it is all for; the opposition whispers about a negotiated peace.',
  [{ label: 'A great speech to the nation (political capital −, approval +)', fx: (sim, N) => { N.gov.pc = Math.max(0, N.gov.pc - 20); N.gov.approval += 0.05; N.exhaustion = Math.max(0, N.exhaustion - 0.04); return '"We shall fight on the beaches..."'; } },
   { label: 'Censor the casualty lists', fx: (sim, N) => { N.gov.stability += 0.02; N.gov.approval -= 0.02; return 'The lists shrink in the papers, not at the front.'; } }]);
ev('gas_proposal', 'The Chemical Option', (sim, N) => atWar(sim, N) && N.techs.chemistry && N.exhaustion > 0.25 && canConduct(sim, N.code, 'gas').ok && { x: enemy(sim, N) },
  (c, N, sim) => `The front against the ${sim.nm(c.x)} is stuck. The chemical warfare staff say the stockpiles of mustard gas and phosgene could break it. Using them would breach the Geneva Protocol of 1925: ${CRIMES.gas.law}.`,
  [{ label: 'Forbid it absolutely', fx: (sim, N) => { earn(sim, N.code, 'peacemaker', 4); return 'The shells stay in their bunkers.'; } },
   { label: 'Release the gas (a war crime)', fx: (sim, N, c) => { const r = conduct(sim, N.code, 'gas', c.x); return r.ok ? 'Yellow clouds drift across no man\'s land.' : r.why; } }]);
ev('bomb_program', 'The Uranium Club', (sim, N) => (N.gdp || 0) > 120 && N.techs.atomic_theory && !sim.s.ww2.bomb?.[N.code] && sim.s.t > DAY * 300 && {},
  () => 'Your physicists report that uranium fission might yield a bomb of unimaginable power. It would take years, vast factories and a large share of the nation\'s scientists.',
  [{ label: 'Start an atomic bomb programme (research −, wealth −)', fx: (sim, N) => { startBomb(sim, N.code, N.key === 'United States' ? 1 : 0.8); return 'A secret programme begins.'; } },
   { label: 'Put the physicists on radar', fx: (sim, N) => { N.research.prog += (N.st.rp || 1) * 8; return 'Radar and fuzes improve. The bomb remains a theory.'; } }]);

export const WW2_EVENTS = EV;
EVENTS.push(...EV);
const EVENTS_BY_ID = new Map(EV.map(e => [e.id, e]));
void TECH; void atWarWithSide;
