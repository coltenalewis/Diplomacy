// The technology tree: ten ages, seven branches, ~175 technologies.
// fx: modifier deltas folded into the nation's mods (gov.js computeMods). Unlocks are discovered by scanning
// units, buildings, improvements, governments and resources for the technology id.
import { techCost, AGES } from './eras.js';

export const BRANCHES = [
  { id: 'food', name: 'Agriculture & Health', color: '#7ed957' },
  { id: 'craft', name: 'Industry & Materials', color: '#e8955a' },
  { id: 'war', name: 'Warfare', color: '#ff7a6b' },
  { id: 'sea', name: 'Seafaring', color: '#5aa2ff' },
  { id: 'lore', name: 'Knowledge & Science', color: '#57d2ff' },
  { id: 'civic', name: 'Government & Society', color: '#c49bff' },
  { id: 'econ', name: 'Commerce', color: '#ffd166' },
  { id: 'intel', name: 'Intelligence & Cyber', color: '#9fe870' },
];
// the modern names of the branches
export const MODERN_BRANCH = { food: 'Health & Agriculture', craft: 'Energy & Industry', war: 'Defence', sea: 'Space & Naval', lore: 'Science & Computing', civic: 'Governance & Society', econ: 'Economy & Finance', intel: 'Intelligence & Cyber' };

export const TECHS = [];
const t = (age, branch, id, name, req, fx, desc) => TECHS.push({ id, age, branch, name, req, fx: fx || {}, desc: desc || '' });

// ---------------------------------------------------------------- 0 Stone Age
t(0, 'craft', 'stone_tools', 'Stone Tools', [], { wood: 0.1 }, 'Knapped flint and obsidian blades.');
t(0, 'food', 'hunting', 'Hunting', [], { food: 0.08, atkLand: 0.03 }, 'Spears, traps and the communal hunt.');
t(0, 'food', 'fishing', 'Fishing', [], { food: 0.05 }, 'Hooks, nets and fish weirs along the shore.');
t(0, 'sea', 'rafts', 'Rafts', ['fishing'], {}, 'Lashed logs carry people across straits and along coasts.');
t(0, 'lore', 'mysticism', 'Mysticism', [], { stability: 0.004 }, 'Spirits, shamans and sacred places.');
t(0, 'lore', 'oral_tradition', 'Oral Tradition', ['mysticism'], { research: 0.1 }, 'Knowledge passed down in songs and stories.');
t(0, 'war', 'warrior_code', 'Warrior Code', ['stone_tools'], { atkLand: 0.05 }, 'A class of fighters with their own rites.');
t(0, 'war', 'palisades', 'Palisades', ['warrior_code'], { defLand: 0.05 }, 'Sharpened stakes ring the settlement.');
t(0, 'food', 'animal_husbandry', 'Animal Husbandry', ['hunting'], { food: 0.05 }, 'Goats, sheep, cattle and the first tame horses.');
t(0, 'food', 'agriculture', 'Agriculture', ['stone_tools'], { food: 0.12 }, 'Sowing wild grains. The first villages.');
t(0, 'craft', 'pottery', 'Pottery', ['agriculture'], { food: 0.05 }, 'Fired clay jars store grain through the winter.');
t(0, 'craft', 'weaving', 'Weaving', ['pottery'], { wealth: 0.05 }, 'Looms, cloth and dyed textiles.');
t(0, 'craft', 'masonry', 'Masonry', ['stone_tools'], { stone: 0.1 }, 'Dressed stone and the first walls.');
t(0, 'craft', 'mining', 'Mining', ['masonry'], {}, 'Shafts into the earth for flint, salt and stones.');
t(0, 'civic', 'leadership', 'Leadership', ['warrior_code'], { pc: 0.05 }, 'A chief speaks for the tribe.');
t(0, 'civic', 'tribal_law', 'Tribal Law', ['leadership', 'oral_tradition'], { stability: 0.004, pc: 0.05 }, 'Customs, taboos and the judgment of elders.');
t(0, 'econ', 'trade', 'Barter', ['pottery'], { wealth: 0.1, tradeBonus: 0.05 }, 'Exchange between tribes: obsidian for shells, grain for furs.');
t(0, 'food', 'herbalism', 'Herbalism', ['agriculture'], { popGrowth: 0.12 }, 'Healing plants and midwives.');

// ---------------------------------------------------------------- 1 Bronze Age
t(1, 'craft', 'copper_working', 'Copper Working', ['mining'], { metal: 0.1 }, 'Smelting copper. Gold and silver glitter in the hills.');
t(1, 'craft', 'bronze_working', 'Bronze Working', ['copper_working'], { metal: 0.2 }, 'Copper alloyed with tin: harder blades, better tools.');
t(1, 'craft', 'the_wheel', 'The Wheel', ['bronze_working', 'animal_husbandry'], { speedLand: 0.08 }, 'Carts, chariots and the potter\'s wheel.');
t(1, 'food', 'irrigation', 'Irrigation', ['agriculture'], { food: 0.18 }, 'Canals carry the river to the fields.');
t(1, 'food', 'plough', 'The Plough', ['irrigation', 'animal_husbandry'], { food: 0.15 }, 'Oxen draw furrows through heavy soil.');
t(1, 'food', 'horticulture', 'Horticulture', ['irrigation'], { food: 0.04 }, 'Orchards, vineyards and cash crops.');
t(1, 'civic', 'urbanism', 'Urbanism', ['pottery', 'masonry'], { housing: 0.05 }, 'Walled towns of mud brick and stone.');
t(1, 'lore', 'writing', 'Writing', ['oral_tradition'], { research: 0.12 }, 'Clay tablets, papyrus and scribes.');
t(1, 'lore', 'priesthood', 'Priesthood', ['mysticism', 'writing'], { stability: 0.004 }, 'Temples, priests and divine kings.');
t(1, 'civic', 'code_of_laws', 'Code of Laws', ['tribal_law', 'writing'], { pc: 0.1, lawCost: -0.05 }, 'Laws carved in stone for all to see.');
t(1, 'war', 'archery', 'Archery', ['warrior_code'], { atkLand: 0.03 }, 'Bows that kill at a distance.');
t(1, 'sea', 'sailing', 'Sailing', ['rafts'], { speedSea: 0.1 }, 'Sails catch the wind. Galleys and harbors.');
t(1, 'econ', 'currency', 'Currency', ['trade', 'copper_working'], { wealth: 0.15 }, 'Weighed silver and the first markets.');
t(1, 'craft', 'masonry_monuments', 'Monumental Architecture', ['masonry', 'urbanism'], { build: 0.08 }, 'Ziggurats, pyramids and palaces.');
t(1, 'lore', 'calendar', 'Calendar', ['mysticism', 'agriculture'], { food: 0.05, research: 0.05 }, 'Stars mark the seasons of sowing and flood.');
t(1, 'craft', 'bronze_casting', 'Bronze Casting', ['bronze_working'], { metal: 0.15 }, 'Lost-wax casting: statues, bells and armor.');
t(1, 'econ', 'record_keeping', 'Record Keeping', ['writing', 'currency'], { wealth: 0.08, claimCost: -0.1 }, 'Tax rolls, granary ledgers and land surveys.');

// ---------------------------------------------------------------- 2 Iron Age
t(2, 'craft', 'iron_working', 'Iron Working', ['bronze_working'], { metal: 0.25 }, 'Bloomeries smelt iron, plentiful and cheap.');
t(2, 'war', 'horseback_riding', 'Horseback Riding', ['the_wheel'], { speedLand: 0.06 }, 'Riders who fight from the saddle.');
t(2, 'war', 'composite_bow', 'Composite Bow', ['archery'], { atkLand: 0.03 }, 'Horn, wood and sinew: a deadlier bow.');
t(2, 'lore', 'mathematics', 'Mathematics', ['writing', 'calendar'], { research: 0.08 }, 'Geometry, arithmetic and the catapult.');
t(2, 'lore', 'alphabet', 'Alphabet', ['writing'], { research: 0.12 }, 'A few dozen letters anyone can learn.');
t(2, 'sea', 'shipbuilding', 'Shipbuilding', ['sailing'], { speedSea: 0.1 }, 'Keels, planks and oared warships.');
t(2, 'civic', 'monarchy', 'Monarchy', ['code_of_laws'], { stability: 0.004, pc: 0.08 }, 'Kings rule by right of blood.');
t(2, 'econ', 'coinage', 'Coinage', ['currency'], { wealth: 0.2 }, 'Stamped coins of guaranteed weight.');
t(2, 'craft', 'roads', 'Roads', ['the_wheel', 'masonry'], { speedLand: 0.12, claimCost: -0.08 }, 'Paved roads bind distant provinces.');
t(2, 'food', 'iron_plough', 'Iron Plough', ['plough', 'iron_working'], { food: 0.2 }, 'Iron shares turn heavier, richer soils.');
t(2, 'lore', 'literature', 'Literature', ['alphabet'], { research: 0.08, approval: 0.02 }, 'Epics, histories and libraries.');
t(2, 'econ', 'caravans', 'Caravans', ['currency', 'horseback_riding'], { tradeBonus: 0.1, wealth: 0.08 }, 'Long-distance trade across deserts and steppes.');
t(2, 'lore', 'polytheism', 'Organized Religion', ['priesthood'], { stability: 0.006 }, 'Pantheons, festivals and state cults.');
t(2, 'craft', 'metallurgy', 'Metallurgy', ['iron_working', 'bronze_casting'], { metal: 0.2, atkLand: 0.04 }, 'Quenching and tempering: steel edges.');
t(2, 'war', 'siegecraft', 'Siegecraft', ['mathematics', 'the_wheel'], { siege: 0.25 }, 'Towers, rams and sapping under walls.');
t(2, 'civic', 'colonization', 'Colonization', ['monarchy', 'shipbuilding'], { claimCost: -0.12, claimSpeed: 0.2 }, 'Founding daughter cities on distant shores.');

// ---------------------------------------------------------------- 3 Classical Age
t(3, 'lore', 'philosophy', 'Philosophy', ['literature', 'polytheism'], { research: 0.12 }, 'Reason questions everything.');
t(3, 'civic', 'the_republic', 'The Republic', ['code_of_laws', 'literature'], { approval: 0.03 }, 'Citizens elect magistrates and senators.');
t(3, 'war', 'professional_army', 'Professional Army', ['iron_working', 'monarchy'], { xp: 0.2 }, 'Paid, drilled, permanent legions.');
t(3, 'war', 'tactics', 'Tactics', ['composite_bow', 'mathematics'], { atkLand: 0.05 }, 'Formations, flanks and reserves.');
t(3, 'war', 'stirrup', 'Stirrup', ['horseback_riding'], { atkLand: 0.03 }, 'Riders braced for the charge.');
t(3, 'craft', 'engineering', 'Engineering', ['mathematics', 'roads'], { build: 0.1 }, 'Arches, aqueducts and war machines.');
t(3, 'craft', 'construction', 'Construction', ['engineering', 'masonry_monuments'], { build: 0.1, stone: 0.15 }, 'Concrete, cranes and colossal works.');
t(3, 'civic', 'civil_engineering', 'Civil Engineering', ['engineering', 'urbanism'], { housing: 0.1 }, 'Planned cities with forums, baths and sewers.');
t(3, 'sea', 'navigation_stars', 'Celestial Navigation', ['shipbuilding', 'mathematics'], { speedSea: 0.1 }, 'Steering by the stars across open seas.');
t(3, 'food', 'medicine', 'Medicine', ['herbalism', 'philosophy'], { popGrowth: 0.15, housing: 0.05 }, 'Physicians, hygiene and surgery.');
t(3, 'food', 'agronomy', 'Agronomy', ['iron_plough', 'mathematics'], { food: 0.25 }, 'Treatises on soil, seed and rotation.');
t(3, 'civic', 'imperialism', 'Imperialism', ['monarchy', 'professional_army'], { claimCost: -0.1, garrison: 0.15 }, 'An empire of provinces and governors.');
t(3, 'econ', 'trade_networks', 'Trade Networks', ['caravans', 'coinage'], { wealth: 0.15, tradeBonus: 0.1 }, 'Merchant houses spanning the known world.');
t(3, 'civic', 'jurisprudence', 'Jurisprudence', ['the_republic'], { stability: 0.005, lawCost: -0.1 }, 'Written law, courts and advocates.');
t(3, 'lore', 'astronomy', 'Astronomy', ['mathematics', 'philosophy'], { research: 0.1 }, 'Orbits, eclipses and star charts.');
t(3, 'econ', 'silk_road', 'Silk Road', ['trade_networks', 'horseback_riding'], { wealth: 0.12, diplo: 0.05 }, 'Silk, spice and ideas flow between empires.');
t(3, 'lore', 'drama', 'Drama & Poetry', ['philosophy'], { approval: 0.03, stability: 0.003 }, 'Theaters and festivals for the citizens.');

// ---------------------------------------------------------------- 4 Medieval Age
t(4, 'civic', 'feudalism', 'Feudalism', ['imperialism'], { garrison: 0.2, manpower: 0.2 }, 'Lords hold land in return for knights.');
t(4, 'lore', 'monotheism', 'Monotheism', ['philosophy', 'polytheism'], { stability: 0.006 }, 'One god, one faith, great cathedrals.');
t(4, 'lore', 'theology', 'Theology', ['monotheism'], { research: 0.05, approval: 0.03 }, 'Scholars reconcile faith and reason.');
t(4, 'war', 'chivalry', 'Chivalry', ['stirrup', 'feudalism'], { atkLand: 0.05 }, 'Armored knights and men-at-arms.');
t(4, 'war', 'castles', 'Castles', ['construction', 'feudalism'], { defLand: 0.08 }, 'Keeps, curtain walls and moats.');
t(4, 'craft', 'machinery', 'Machinery', ['engineering'], { prod: 0.1 }, 'Gears, cranks and the crossbow.');
t(4, 'lore', 'physics', 'Physics', ['astronomy', 'machinery'], { research: 0.08 }, 'Motion, levers and the counterweight trebuchet.');
t(4, 'econ', 'guilds', 'Guilds', ['trade_networks'], { wealth: 0.12, prod: 0.05 }, 'Masters, journeymen and apprentices.');
t(4, 'econ', 'banking', 'Banking', ['guilds'], { wealth: 0.2 }, 'Letters of credit and great banking houses.');
t(4, 'sea', 'compass', 'Magnetic Compass', ['navigation_stars'], { speedSea: 0.1 }, 'A needle that always points north.');
t(4, 'food', 'heavy_plough', 'Heavy Plough', ['agronomy'], { food: 0.3 }, 'Three-field rotation and horse collars.');
t(4, 'lore', 'education', 'Education', ['theology', 'philosophy'], { research: 0.15 }, 'Universities and learned doctors.');
t(4, 'craft', 'mills', 'Water & Wind Mills', ['machinery'], { food: 0.08, wood: 0.15, stone: 0.15, metal: 0.15 }, 'Harnessing rivers and winds.');
t(4, 'food', 'preservation', 'Food Preservation', ['heavy_plough', 'pottery'], { food: 0.06, popGrowth: 0.1 }, 'Salting, smoking and storehouses.');
t(4, 'sea', 'cartography', 'Cartography', ['compass'], { claimCost: -0.08 }, 'Portolan charts of every coast.');
t(4, 'lore', 'paper', 'Paper', ['education'], { research: 0.1 }, 'Cheap paper spreads learning.');

// ---------------------------------------------------------------- 5 Age of Discovery
t(5, 'war', 'gunpowder', 'Gunpowder', ['physics', 'machinery'], { atkLand: 0.05 }, 'Black powder changes war forever.');
t(5, 'craft', 'metal_casting', 'Metal Casting', ['gunpowder', 'mills'], { metal: 0.2 }, 'Cast cannon and bombards.');
t(5, 'sea', 'navigation', 'Navigation', ['cartography', 'astronomy'], { speedSea: 0.15 }, 'Carracks and frigates cross the open ocean.');
t(5, 'lore', 'printing_press', 'Printing Press', ['paper'], { research: 0.18 }, 'Books by the thousand.');
t(5, 'lore', 'humanism', 'Humanism', ['printing_press'], { approval: 0.04, research: 0.05 }, 'Art and learning reborn.');
t(5, 'civic', 'divine_right', 'Divine Right', ['feudalism', 'theology'], { pc: 0.1, stability: 0.004 }, 'The monarch answers only to God.');
t(5, 'war', 'fortification', 'Fortification', ['gunpowder', 'castles'], { defLand: 0.08 }, 'Angled bastions defeat cannon.');
t(5, 'war', 'cavalry_tactics', 'Cavalry Tactics', ['gunpowder', 'chivalry'], { atkLand: 0.03 }, 'Pistols and sabres from horseback.');
t(5, 'war', 'military_science', 'Military Science', ['gunpowder', 'education'], { xp: 0.2 }, 'War colleges and drill manuals.');
t(5, 'econ', 'mercantilism', 'Mercantilism', ['banking', 'navigation'], { wealth: 0.25 }, 'Colonies, monopolies and bullion.');
t(5, 'civic', 'colonial_charters', 'Colonial Charters', ['navigation'], { claimCost: -0.15, claimSpeed: 0.3 }, 'Chartered companies settle new worlds.');
t(5, 'food', 'columbian_exchange', 'Columbian Exchange', ['navigation', 'heavy_plough'], { food: 0.35 }, 'Potatoes, maize and new crops spread worldwide.');
t(5, 'lore', 'scientific_method', 'Scientific Method', ['printing_press', 'physics'], { research: 0.15 }, 'Hypothesis, experiment, proof.');
t(5, 'sea', 'optics', 'Optics', ['physics'], { research: 0.05, speedSea: 0.05 }, 'Lenses, spyglasses and telescopes.');
t(5, 'econ', 'joint_stock', 'Joint-Stock Companies', ['mercantilism'], { wealth: 0.2, tradeBonus: 0.1 }, 'Shared risk funds great voyages.');
t(5, 'civic', 'constitution', 'Constitutionalism', ['humanism', 'banking'], { stability: 0.004, approval: 0.03 }, 'Parliaments limit the crown.');

// ---------------------------------------------------------------- 6 Industrial Age
t(6, 'craft', 'steam_engine', 'Steam Engine', ['scientific_method', 'metal_casting'], { prod: 0.15 }, 'Steam drives pumps, mills and ships.');
t(6, 'craft', 'coal_mining', 'Coal Mining', ['steam_engine'], { energy: 0.1 }, 'Deep pits feed the furnaces.');
t(6, 'craft', 'industrialization', 'Industrialization', ['steam_engine'], { prod: 0.15, wealth: 0.2 }, 'Factories, mills and the working class.');
t(6, 'craft', 'railroad', 'Railroad', ['industrialization', 'coal_mining'], { speedLand: 0.25, claimCost: -0.1 }, 'Rails bind the nation together.');
t(6, 'war', 'rifling', 'Rifling', ['military_science'], { atkLand: 0.05 }, 'Accurate rifles and rifled cannon.');
t(6, 'war', 'conscription', 'Conscription', ['rifling'], { manpower: 0.4 }, 'The nation in arms.');
t(6, 'war', 'machine_gun', 'Machine Gun', ['rifling'], { defLand: 0.08 }, 'Six hundred rounds a minute.');
t(6, 'civic', 'democracy', 'Democracy', ['constitution'], { approval: 0.05 }, 'Universal suffrage and elected governments.');
t(6, 'civic', 'nationalism', 'Nationalism', ['divine_right', 'printing_press'], { manpower: 0.2, approval: 0.02 }, 'One people, one nation, one flag.');
t(6, 'food', 'sanitation', 'Sanitation', ['scientific_method'], { housing: 0.12, popGrowth: 0.1 }, 'Clean water and sewers end the plagues.');
t(6, 'food', 'seed_drill', 'Agricultural Revolution', ['columbian_exchange', 'industrialization'], { food: 0.6 }, 'Seed drills, enclosure and selective breeding.');
t(6, 'econ', 'economics', 'Economics', ['joint_stock'], { wealth: 0.3 }, 'The wealth of nations.');
t(6, 'econ', 'corporations', 'Corporations', ['economics', 'industrialization'], { wealth: 0.3 }, 'Limited companies and stock markets.');
t(6, 'craft', 'steel', 'Steel', ['industrialization'], { metal: 0.5 }, 'Bessemer converters pour cheap steel.');
t(6, 'craft', 'vulcanization', 'Vulcanization', ['industrialization'], {}, 'Rubber for tires, belts and seals.');
t(6, 'lore', 'electricity', 'Electricity', ['scientific_method'], { research: 0.12 }, 'Dynamos, wires and light.');
t(6, 'lore', 'telegraph', 'Telegraph', ['electricity'], { research: 0.08, pc: 0.05 }, 'Messages cross continents in minutes.');
t(6, 'craft', 'oil_drilling', 'Oil Drilling', ['steam_engine'], {}, 'Derricks strike black gold.');
t(6, 'food', 'refrigeration', 'Refrigeration', ['electricity', 'sanitation'], { food: 0.3 }, 'Cold storage and frozen shipping.');

// ---------------------------------------------------------------- 7 Modern Age
t(7, 'craft', 'combustion', 'Combustion Engine', ['oil_drilling', 'steel'], { speedLand: 0.1 }, 'Trucks, tanks and tractors.');
t(7, 'lore', 'flight', 'Flight', ['combustion'], {}, 'Powered aircraft.');
t(7, 'craft', 'refining', 'Refining', ['oil_drilling', 'electricity'], { oil: 0.3 }, 'Cracking crude into fuels.');
t(7, 'sea', 'dreadnought', 'Dreadnoughts', ['steel', 'steam_engine'], { atkSea: 0.05 }, 'All-big-gun battleships.');
t(7, 'sea', 'submarine_warfare', 'Submarine Warfare', ['combustion'], {}, 'Wolf packs under the waves.');
t(7, 'sea', 'naval_aviation', 'Naval Aviation', ['flight', 'dreadnought'], {}, 'Aircraft carriers rule the seas.');
t(7, 'war', 'trench_warfare', 'Trench Warfare', ['machine_gun', 'conscription'], { defLand: 0.06 }, 'Barbed wire, trenches and bunkers.');
t(7, 'war', 'ballistics', 'Ballistics', ['trench_warfare'], { atkLand: 0.04 }, 'Indirect fire by map and calculation.');
t(7, 'war', 'combined_arms', 'Combined Arms', ['trench_warfare', 'combustion'], { atkLand: 0.06 }, 'Infantry, armor, artillery and aircraft together.');
t(7, 'craft', 'mass_production', 'Mass Production', ['corporations', 'electricity'], { prod: 0.2, wealth: 0.2 }, 'Assembly lines and interchangeable parts.');
t(7, 'civic', 'ideology', 'Revolutionary Ideology', ['industrialization', 'nationalism'], {}, 'Workers of the world unite: the one-party state.');
t(7, 'civic', 'totalitarianism', 'Totalitarianism', ['nationalism', 'telegraph'], { covert: 0.1 }, 'The state controls everything.');
t(7, 'lore', 'radio', 'Radio', ['electricity', 'telegraph'], { research: 0.08, approval: 0.02 }, 'Broadcasts into every home.');
t(7, 'food', 'antibiotics', 'Antibiotics', ['sanitation'], { popGrowth: 0.2, housing: 0.12 }, 'Penicillin and modern medicine.');
t(7, 'food', 'mechanized_agriculture', 'Mechanized Agriculture', ['combustion', 'seed_drill'], { food: 0.9 }, 'Tractors and combine harvesters.');
t(7, 'lore', 'electronics', 'Electronics', ['radio'], { research: 0.15 }, 'Vacuum tubes and circuits.');
t(7, 'lore', 'atomic_theory', 'Atomic Theory', ['electronics'], { research: 0.08 }, 'The structure of the atom.');
t(7, 'sea', 'radar', 'Radar', ['radio', 'flight'], { defAir: 0.1 }, 'Seeing aircraft and ships beyond the horizon.');
t(7, 'econ', 'consumerism', 'Consumerism', ['mass_production'], { wealth: 0.3, approval: 0.02 }, 'Department stores and advertising.');

// ---------------------------------------------------------------- 8 Atomic Age
t(8, 'lore', 'nuclear_fission', 'Nuclear Fission', ['atomic_theory'], {}, 'Splitting the atom.');
t(8, 'war', 'nuclear_weapons', 'Nuclear Weapons', ['nuclear_fission'], {}, 'The bomb.');
t(8, 'craft', 'nuclear_power', 'Nuclear Power', ['nuclear_fission'], { energy: 0.15 }, 'Reactors for cities and warships.');
t(8, 'war', 'jet_propulsion', 'Jet Propulsion', ['flight', 'radar'], { speedAir: 0.15 }, 'Jet fighters and strategic bombers.');
t(8, 'lore', 'rocketry', 'Rocketry', ['jet_propulsion', 'ballistics'], {}, 'Rockets that leave the atmosphere.');
t(8, 'war', 'icbm', 'Ballistic Missiles', ['rocketry', 'nuclear_weapons'], {}, 'Warheads that reach any city on Earth.');
t(8, 'lore', 'space_flight', 'Space Flight', ['rocketry', 'computers'], { research: 0.1 }, 'Satellites and astronauts.');
t(8, 'lore', 'computers', 'Computers', ['electronics'], { research: 0.18 }, 'Transistors and mainframes.');
t(8, 'war', 'guided_missiles', 'Guided Missiles', ['rocketry', 'computers'], { atkAir: 0.05 }, 'Missiles that steer themselves.');
t(8, 'war', 'mechanization', 'Mechanization', ['combined_arms', 'mass_production'], { speedLand: 0.1 }, 'Every soldier rides.');
t(8, 'craft', 'composites', 'Composites', ['mass_production'], { metal: 0.5 }, 'Plastics, alloys and composite armor.');
t(8, 'food', 'green_revolution', 'Green Revolution', ['mechanized_agriculture'], { food: 1.4 }, 'High-yield crops and fertilizers.');
t(8, 'civic', 'mass_media', 'Mass Media', ['radio'], { approval: 0.03, pc: 0.08 }, 'Television shapes public opinion.');
t(8, 'civic', 'mass_transit', 'Mass Transit', ['mass_production', 'electricity'], { housing: 0.1 }, 'Subways, highways and suburbs.');
t(8, 'war', 'thermonuclear', 'Thermonuclear Weapons', ['nuclear_weapons'], { yield: 0.5 }, 'Hydrogen bombs of megaton yield.');
t(8, 'sea', 'amphibious_warfare', 'Amphibious Warfare', ['naval_aviation', 'combined_arms'], {}, 'Landing craft and beachheads.');
t(8, 'food', 'vaccines', 'Vaccines', ['antibiotics'], { popGrowth: 0.15, housing: 0.1 }, 'Polio, smallpox and measles defeated.');
t(8, 'econ', 'international_trade', 'International Trade', ['corporations', 'consumerism'], { wealth: 0.6, tradeBonus: 0.15 }, 'Bretton Woods and shipping containers.');
t(8, 'lore', 'semiconductors', 'Semiconductors', ['computers'], { research: 0.12 }, 'Silicon chips. Rare earths become vital.');

// ---------------------------------------------------------------- 9 Information Age
t(9, 'lore', 'internet', 'The Internet', ['computers', 'semiconductors'], { research: 0.15, wealth: 0.2 }, 'Every computer connected.');
t(9, 'lore', 'machine_learning', 'Machine Learning', ['internet'], { research: 0.2 }, 'Systems that learn from data.');
t(9, 'lore', 'artificial_intelligence', 'Artificial Intelligence', ['machine_learning'], { research: 0.3, prod: 0.15 }, 'Minds that rival our own.');
t(9, 'craft', 'robotics', 'Robotics', ['computers', 'composites'], { prod: 0.2 }, 'Automated factories and machines.');
t(9, 'war', 'stealth_tech', 'Stealth Technology', ['jet_propulsion', 'composites'], { defAir: 0.1 }, 'Invisible to radar.');
t(9, 'war', 'network_warfare', 'Network-Centric Warfare', ['internet'], { atk: 0.05, covert: 0.1 }, 'Every soldier, sensor and shooter connected.');
t(9, 'war', 'precision_munitions', 'Precision Munitions', ['guided_missiles', 'semiconductors'], { atk: 0.05 }, 'Every shell a guided weapon.');
t(9, 'war', 'autonomous_systems', 'Autonomous Systems', ['robotics', 'machine_learning'], { atk: 0.05 }, 'Drone swarms and robot vehicles.');
t(9, 'war', 'directed_energy', 'Directed Energy', ['precision_munitions'], { intercept: 0.2 }, 'Lasers that swat missiles from the sky.');
t(9, 'craft', 'renewables', 'Renewable Energy', ['semiconductors'], { energy: 0.15 }, 'Solar, wind and batteries.');
t(9, 'craft', 'fusion', 'Fusion Power', ['renewables', 'nuclear_power', 'artificial_intelligence'], { energy: 0.5 }, 'A star in a bottle.');
t(9, 'food', 'genetic_engineering', 'Genetic Engineering', ['green_revolution', 'computers'], { food: 1.6, popGrowth: 0.1 }, 'Designed crops and gene therapy.');
t(9, 'food', 'vertical_farming', 'Vertical Farming', ['genetic_engineering', 'robotics'], { food: 1.2 }, 'Food towers in every city.');
t(9, 'econ', 'globalization', 'Globalization', ['international_trade', 'internet'], { wealth: 0.8, tradeBonus: 0.2 }, 'One world market.');
t(9, 'war', 'cyber_warfare', 'Cyber Warfare', ['internet'], { covert: 0.15 }, 'Attacks on grids, banks and governments.');
t(9, 'war', 'missile_defense', 'Missile Defense', ['guided_missiles', 'space_flight'], { intercept: 0.25 }, 'Interceptors against ballistic missiles.');
t(9, 'civic', 'technocracy', 'Technocracy', ['artificial_intelligence'], {}, 'Government by experts and algorithms.');
t(9, 'craft', 'orbital_industry', 'Orbital Industry', ['space_flight', 'robotics'], { metal: 0.6, wealth: 0.3 }, 'Factories and mines in orbit.');
t(9, 'lore', 'interstellar_travel', 'Interstellar Travel', ['fusion', 'orbital_industry', 'artificial_intelligence'], {}, 'The great leap to the stars.');

// ---------------------------------------------------------------- society, faith, culture and the new resources
// fx keys used by society.js: assim (assimilation speed), convert (spread of the state faith), suppress (crushing revolts),
// terror (counter-terrorism), govSkill (governors count as more skilled), unrestMin (lower unrest everywhere), faithUnrest, cultureUnrest
t(0, 'lore', 'ancestor_worship', 'Ancestor Worship', ['mysticism'], { stability: 0.003, faithUnrest: -0.1 }, 'Shrines to the honored dead bind the clans together.');
t(0, 'lore', 'rock_art', 'Rock Art', ['mysticism'], { assim: 0.15, approval: 0.02 }, 'Painted caves and carved stones: a shared story.');
t(0, 'food', 'foraging', 'Foraging Lore', ['hunting'], { food: 0.06 }, 'Which roots, nuts and berries feed the band in each season.');
t(1, 'lore', 'divination', 'Divination', ['priesthood'], { stability: 0.003, convert: 0.1 }, 'Oracles read the will of the gods.');
t(1, 'food', 'camel_domestication', 'Camel Domestication', ['animal_husbandry', 'horticulture'], { tradeBonus: 0.03 }, 'Ships of the desert: camel herds, caravans and camel riders.');
t(1, 'civic', 'census', 'Census', ['record_keeping'], { claimCost: -0.05, unrestMin: -0.02 }, 'Counting every household: taxes, levies and governors.');
t(2, 'war', 'war_elephants', 'War Elephants', ['horseback_riding'], { atkLand: 0.02 }, 'Tamed elephants that trample the enemy line.');
t(2, 'civic', 'satrapies', 'Satrapies', ['monarchy', 'census'], { govSkill: 1 }, 'Provinces ruled by royal governors who answer to the king.');
t(2, 'lore', 'mystery_cults', 'Mystery Cults', ['polytheism'], { convert: 0.15, approval: 0.02 }, 'Secret rites that promise salvation to initiates.');
t(3, 'econ', 'pilgrimage', 'Pilgrimage', ['polytheism', 'roads'], { wealth: 0.04 }, 'The faithful travel to holy sites: holy cities grow rich.');
t(3, 'civic', 'citizenship', 'Citizenship', ['the_republic', 'jurisprudence'], { assim: 0.35, cultureUnrest: -0.2 }, 'Conquered peoples can become citizens.');
t(3, 'civic', 'bureaucracy', 'Bureaucracy', ['imperialism', 'census'], { govSkill: 1, wealth: 0.04 }, 'Salaried officials, archives and provincial administration.');
t(4, 'lore', 'missionaries', 'Missionaries', ['monotheism'], { convert: 0.3 }, 'Preachers carry the faith to every land.');
t(4, 'war', 'holy_war', 'Holy War', ['monotheism', 'chivalry'], { atkLand: 0.04 }, 'Crusade and jihad: wars for the faith and its holy places.');
t(4, 'lore', 'monasticism', 'Monasticism', ['theology'], { research: 0.06, convert: 0.1 }, 'Monasteries copy books and keep the faith.');
t(4, 'civic', 'inquisition', 'Inquisition', ['theology', 'feudalism'], { convert: 0.35, approval: -0.02, faithUnrest: -0.15 }, 'Tribunals root out heresy by force.');
t(5, 'lore', 'reformation', 'Reformation', ['printing_press', 'theology'], { research: 0.04 }, 'Scripture in the common tongue splits the church.');
t(5, 'civic', 'absolutism', 'Absolutism', ['divine_right'], { pc: 0.12, suppress: 0.25 }, 'The sovereign\'s will is law: standing armies and intendants.');
t(5, 'civic', 'colonial_administration', 'Colonial Administration', ['colonial_charters', 'bureaucracy'], { govSkill: 1, assim: 0.1 }, 'Viceroys and colonial councils govern distant provinces.');
t(6, 'food', 'fertilizer', 'Fertilizer', ['seed_drill'], { food: 0.25 }, 'Guano, phosphate and nitrates feed the fields.');
t(6, 'craft', 'chemistry', 'Chemistry', ['scientific_method', 'metal_casting'], { prod: 0.06, research: 0.05 }, 'Acids, dyes and explosives from the laboratory.');
t(6, 'civic', 'policing', 'Modern Policing', ['nationalism', 'sanitation'], { unrestMin: -0.05, suppress: 0.3 }, 'Constables, detectives and police stations in every town.');
t(6, 'civic', 'public_education', 'Public Education', ['nationalism', 'printing_press'], { assim: 0.5, research: 0.06 }, 'Schools in every village teach one language and one history.');
t(7, 'civic', 'propaganda', 'Propaganda', ['radio', 'nationalism'], { assim: 0.25, approval: 0.03, pc: 0.06 }, 'Posters, newsreels and broadcasts shape what people believe.');
t(7, 'war', 'intelligence_agencies', 'Intelligence Agencies', ['telegraph', 'military_science'], { covert: 0.12, terror: 0.25 }, 'Spies, codebreakers and counter-intelligence.');
t(7, 'war', 'guerrilla_warfare', 'Guerrilla Warfare', ['combined_arms'], { defLand: 0.04 }, 'Hit and run: occupiers bleed in hostile land.');
t(7, 'civic', 'self_determination', 'Self-Determination', ['democracy', 'nationalism'], { approval: 0.02, diplo: 0.05 }, 'Every people has the right to govern itself. Autonomy calms separatists.');
t(8, 'war', 'counter_insurgency', 'Counter-Insurgency', ['guerrilla_warfare', 'mechanization'], { suppress: 0.6 }, 'Hearts and minds, patrols and informants.');
t(8, 'civic', 'decolonization', 'Decolonization', ['self_determination'], { cultureUnrest: -0.15, diplo: 0.05 }, 'Empires release their colonies; nations are born.');
t(8, 'craft', 'batteries', 'Lithium Batteries', ['semiconductors', 'chemistry'], { energy: 0.05 }, 'Lithium and cobalt store power for devices, drones and the grid.');
t(8, 'civic', 'human_rights', 'Human Rights', ['decolonization', 'mass_media'], { approval: 0.03, faithUnrest: -0.2, cultureUnrest: -0.1 }, 'Universal rights, international courts and observers.');
t(9, 'war', 'counter_terrorism', 'Counter-Terrorism', ['intelligence_agencies', 'internet'], { terror: 0.4 }, 'Watch lists, special forces and fusion centers.');
t(9, 'civic', 'mass_surveillance', 'Mass Surveillance', ['internet', 'machine_learning'], { terror: 0.3, suppress: 0.3, approval: -0.03 }, 'Every phone and camera watched by algorithms.');
t(9, 'lore', 'social_media', 'Social Media', ['internet'], { approval: 0.02, pc: 0.08, unrestMin: 0.03 }, 'Everyone has a voice, and outrage spreads at the speed of light.');
t(9, 'craft', 'electric_vehicles', 'Electric Vehicles', ['batteries', 'renewables'], { oil: 0.2, energy: 0.05 }, 'Batteries replace petrol in cars and trucks.');

// ---------------------------------------------------------------- the modern frontier (2025 onwards)
// tier: 1 fielded by leading nations in 2025 ... 5 speculative breakthroughs. Cost rises with the tier.
const m = (tier, branch, id, name, req, fx, desc) => { t(9, branch, id, name, req, fx, desc); TECHS[TECHS.length - 1].tier = tier; };
// defence
m(1, 'war', 'drone_warfare', 'Drone Warfare', ['precision_munitions'], { atk: 0.04 }, 'Cheap quadcopters and FPV drones dominate the front line.');
m(1, 'war', 'special_operations', 'Special Operations Command', ['counter_terrorism'], { covert: 0.08, xp: 0.1 }, 'Elite units for raids, rescues and covert war.');
m(2, 'war', 'loitering_munitions', 'Loitering Munitions', ['drone_warfare', 'precision_munitions'], { atk: 0.05 }, 'Kamikaze drones that circle until a target appears.');
m(2, 'war', 'electronic_warfare', 'Electronic Warfare', ['network_warfare'], { defLand: 0.05, defAir: 0.05 }, 'Jam, spoof and blind the enemy\'s sensors and drones.');
m(2, 'war', 'battlefield_medicine', 'Battlefield Medicine', ['genetic_engineering'], { xp: 0.1, manpower: 0.1 }, 'Golden-hour evacuation and field surgery save soldiers.');
m(3, 'war', 'hypersonic_missiles', 'Hypersonic Missiles', ['loitering_munitions', 'missile_defense'], { atk: 0.06, atkSea: 0.08 }, 'Mach 5+ weapons that outrun most defences.');
m(3, 'war', 'layered_air_defense', 'Layered Air & Missile Defence', ['missile_defense', 'electronic_warfare'], { intercept: 0.2, defAir: 0.08 }, 'Interceptors, lasers and guns in overlapping shields.');
m(3, 'war', 'exoskeletons', 'Powered Exoskeletons', ['robotics', 'battlefield_medicine'], { atkLand: 0.05 }, 'Soldiers who carry more and march further.');
m(3, 'war', 'anti_satellite', 'Anti-Satellite Weapons', ['hypersonic_missiles', 'satellite_constellations'], { covert: 0.05, atk: 0.03 }, 'Blind an enemy by destroying its eyes in orbit.');
m(4, 'war', 'sixth_gen_fighters', 'Sixth-Generation Air Power', ['stealth_tech', 'military_ai'], { atkAir: 0.1, defAir: 0.08 }, 'Crewed fighters leading swarms of loyal-wingman drones.');
m(4, 'war', 'military_ai', 'Military AI', ['artificial_intelligence', 'electronic_warfare'], { atk: 0.06, xp: 0.15 }, 'AI that plans, targets and commands at machine speed.');
m(4, 'war', 'railguns', 'Railguns', ['advanced_materials', 'hypersonic_missiles'], { atkSea: 0.1 }, 'Electromagnetic guns firing projectiles at Mach 7.');
m(5, 'war', 'autonomous_armies', 'Autonomous Armies', ['military_ai', 'swarm_robotics'], { atk: 0.1, manpower: 0.3 }, 'Whole formations without a single soldier.');
m(4, 'war', 'swarm_robotics', 'Swarm Robotics', ['loitering_munitions', 'robotics'], { atk: 0.05 }, 'Thousands of small robots acting as one.');
// intelligence & cyber
m(1, 'intel', 'signals_intelligence', 'Signals Intelligence', ['cyber_warfare'], { covert: 0.08 }, 'Intercepts, satellites and the great listening stations.');
m(2, 'intel', 'offensive_cyber', 'Offensive Cyber Operations', ['signals_intelligence'], { covert: 0.1 }, 'Malware that can switch off a power grid or a pipeline.');
m(2, 'intel', 'disinformation', 'Information Warfare', ['social_media', 'signals_intelligence'], { covert: 0.08, pc: 0.05 }, 'Bot farms, troll factories and narrative campaigns.');
m(2, 'intel', 'election_security', 'Election Security', ['cyber_warfare'], { stability: 0.004, terror: 0.1 }, 'Hardened voting systems and counter-interference units.');
m(3, 'intel', 'zero_day_arsenal', 'Zero-Day Arsenal', ['offensive_cyber'], { covert: 0.12 }, 'Stockpiled unknown vulnerabilities, ready for war.');
m(3, 'intel', 'deepfake_detection', 'Synthetic Media Forensics', ['disinformation', 'machine_learning'], { approval: 0.02, terror: 0.1 }, 'Tell real speeches from fabricated ones.');
m(4, 'intel', 'quantum_cryptography', 'Quantum Cryptography', ['quantum_computing', 'zero_day_arsenal'], { covert: 0.1, terror: 0.15 }, 'Unbreakable communications, and broken enemy codes.');
// science & computing
m(1, 'lore', 'cloud_computing', 'Cloud Computing', ['internet'], { research: 0.05, wealth: 0.04 }, 'Computing as a utility, from hyperscale datacentres.');
m(1, 'lore', 'five_g', '5G Networks', ['internet'], { wealth: 0.04, research: 0.03 }, 'Fast mobile networks for phones, factories and cars.');
m(2, 'lore', 'advanced_chips', 'Advanced Semiconductors', ['semiconductors', 'cloud_computing'], { research: 0.08, prod: 0.05 }, 'Leading-edge chips: the most valuable factories on Earth.');
m(2, 'lore', 'exascale', 'Exascale Supercomputing', ['advanced_chips'], { research: 0.08 }, 'A billion billion calculations a second.');
m(3, 'lore', 'large_language_models', 'Large Language Models', ['machine_learning', 'advanced_chips'], { research: 0.1, wealth: 0.06 }, 'Machines that read, write and reason in every language.');
m(3, 'lore', 'quantum_computing', 'Quantum Computing', ['exascale'], { research: 0.12 }, 'Qubits that solve what classical machines cannot.');
m(4, 'lore', 'brain_interfaces', 'Brain-Computer Interfaces', ['large_language_models', 'crispr'], { research: 0.08, approval: 0.02 }, 'Thought becomes command.');
m(5, 'lore', 'general_ai', 'Artificial General Intelligence', ['artificial_intelligence', 'quantum_computing', 'large_language_models'], { research: 0.4, prod: 0.2, wealth: 0.15 }, 'A mind as capable as ours, and then more so.');
// space & naval
m(1, 'sea', 'reusable_rockets', 'Reusable Rockets', ['space_flight'], { research: 0.03 }, 'Boosters that land and fly again: space becomes cheap.');
m(2, 'sea', 'satellite_constellations', 'Satellite Constellations', ['reusable_rockets', 'five_g'], { research: 0.05, wealth: 0.05 }, 'Thousands of satellites: internet, imaging and targeting everywhere.');
m(2, 'sea', 'unmanned_naval', 'Unmanned Naval Vessels', ['autonomous_systems'], { atkSea: 0.06 }, 'Sea drones that sink warships.');
m(2, 'sea', 'space_station', 'Orbital Station', ['reusable_rockets'], { research: 0.06 }, 'A permanent laboratory in orbit.');
m(3, 'sea', 'space_force', 'Space Command', ['satellite_constellations', 'missile_defense'], { intercept: 0.1, defAir: 0.05 }, 'A military service for the high frontier.');
m(4, 'sea', 'lunar_base', 'Lunar Base', ['space_station', 'small_modular_reactors'], { research: 0.1, pc: 0.08 }, 'A permanent settlement on the Moon.');
m(5, 'sea', 'mars_mission', 'Crewed Mission to Mars', ['lunar_base', 'orbital_industry'], { research: 0.12, approval: 0.06, pc: 0.12 }, 'Humans walk on another planet.');
// energy & industry
m(1, 'craft', 'shale', 'Shale Extraction', ['renewables'], { oil: 0.3, energy: 0.05 }, 'Fracking unlocks oil and gas from tight rock.');
m(1, 'craft', 'lng', 'LNG Infrastructure', ['shale'], { energy: 0.08, tradeBonus: 0.03 }, 'Liquefied gas shipped across oceans.');
m(1, 'craft', 'additive_manufacturing', '3D Printing', ['internet'], { prod: 0.06, build: 0.05 }, 'Print parts, homes and engines on demand.');
m(2, 'craft', 'grid_storage', 'Grid-Scale Storage', ['renewables', 'batteries'], { energy: 0.12 }, 'Giant batteries smooth the sun and wind.');
m(2, 'craft', 'rare_earth_refining', 'Rare Earth Refining', ['advanced_chips'], { metal: 0.15, prod: 0.04 }, 'Break a near-monopoly on the elements of modern industry.');
m(2, 'craft', 'smart_factories', 'Smart Factories', ['additive_manufacturing', 'five_g'], { prod: 0.1, wealth: 0.05 }, 'Industry 4.0: sensors, robots and AI on every line.');
m(3, 'craft', 'small_modular_reactors', 'Small Modular Reactors', ['nuclear_power', 'grid_storage'], { energy: 0.2 }, 'Factory-built reactors for every city and port.');
m(3, 'craft', 'green_hydrogen', 'Green Hydrogen', ['grid_storage'], { energy: 0.08, oil: 0.1, approval: 0.02 }, 'Clean fuel for steel, ships and planes.');
m(3, 'craft', 'carbon_capture', 'Carbon Capture', ['green_hydrogen'], { approval: 0.03, diplo: 0.05 }, 'Pull carbon back out of the air.');
m(4, 'craft', 'advanced_materials', 'Advanced Materials', ['smart_factories', 'quantum_computing'], { metal: 0.25, prod: 0.08 }, 'Graphene, metamaterials and self-healing alloys.');
m(5, 'craft', 'superconductors', 'Room-Temperature Superconductors', ['advanced_materials', 'fusion'], { energy: 0.4, prod: 0.15 }, 'Lossless power lines and levitating trains.');
// health & agriculture
m(1, 'food', 'mrna_vaccines', 'mRNA Vaccines', ['vaccines', 'genetic_engineering'], { popGrowth: 0.05, stability: 0.003 }, 'Vaccines designed in days, made in weeks.');
m(1, 'food', 'precision_agriculture', 'Precision Agriculture', ['genetic_engineering', 'internet'], { food: 0.25 }, 'Satellites and sensors tell every field what it needs.');
m(1, 'food', 'telemedicine', 'Telemedicine', ['internet'], { approval: 0.02, popGrowth: 0.03 }, 'A doctor in every phone.');
m(2, 'food', 'crispr', 'CRISPR Medicine', ['mrna_vaccines'], { popGrowth: 0.05, approval: 0.02 }, 'Gene editing cures inherited disease.');
m(2, 'food', 'pandemic_preparedness', 'Pandemic Preparedness', ['mrna_vaccines'], { stability: 0.005 }, 'Stockpiles, surveillance and surge capacity for the next plague.');
m(2, 'food', 'desalination', 'Large-Scale Desalination', ['renewables'], { food: 0.15, housing: 0.05 }, 'Fresh water from the sea for deserts and cities.');
m(3, 'food', 'lab_grown_food', 'Cultivated Protein', ['crispr', 'vertical_farming'], { food: 0.3 }, 'Meat without animals, at scale.');
m(4, 'food', 'longevity', 'Longevity Medicine', ['crispr', 'large_language_models'], { popGrowth: 0.08, approval: 0.04 }, 'Slowing ageing itself.');
// governance & society
m(1, 'civic', 'e_government', 'E-Government', ['internet'], { pc: 0.06, lawCost: -0.05 }, 'Online services, digital records and smart bureaucracy.');
m(2, 'civic', 'digital_identity', 'Digital Identity', ['e_government'], { pc: 0.05, unrestMin: -0.02 }, 'Every citizen known to the state, for better or worse.');
m(2, 'civic', 'smart_cities', 'Smart Cities', ['five_g', 'e_government'], { housing: 0.1, approval: 0.02 }, 'Sensors, autonomous transit and efficient utilities.');
m(2, 'civic', 'soft_power', 'Soft Power', ['social_media'], { diplo: 0.1, approval: 0.02 }, 'Culture, universities and media that win hearts abroad.');
m(3, 'civic', 'climate_accords', 'Climate Leadership', ['carbon_capture', 'soft_power'], { diplo: 0.1, approval: 0.03 }, 'Lead the world\'s response to a warming planet.');
m(3, 'civic', 'basic_income', 'Universal Basic Income', ['smart_factories', 'digital_identity'], { approval: 0.06, stability: 0.004, wealth: -0.05 }, 'A cheque for every citizen as automation spreads.');
m(4, 'civic', 'algorithmic_governance', 'Algorithmic Governance', ['large_language_models', 'digital_identity'], { pc: 0.1, lawCost: -0.1 }, 'AI drafts the laws and runs the ministries.');
// economy & finance
m(1, 'econ', 'fintech', 'Fintech', ['internet'], { wealth: 0.05 }, 'Mobile banking reaches the unbanked billions.');
m(1, 'econ', 'free_trade_agreements', 'Free Trade Agreements', ['globalization'], { tradeBonus: 0.08, wealth: 0.03 }, 'Lower tariffs and common rules with partners.');
m(2, 'econ', 'sovereign_wealth', 'Sovereign Wealth Fund', ['fintech'], { wealth: 0.06 }, 'Invest the nation\'s savings across the world.');
m(2, 'econ', 'digital_currency', 'Central Bank Digital Currency', ['fintech', 'digital_identity'], { wealth: 0.05, covert: 0.03 }, 'Programmable state money, and a way around foreign payment systems.');
m(2, 'econ', 'reshoring', 'Strategic Reshoring', ['smart_factories'], { prod: 0.06, metal: 0.08 }, 'Bring critical supply chains home.');
m(3, 'econ', 'platform_economy', 'Platform Economy', ['large_language_models', 'fintech'], { wealth: 0.1 }, 'Digital giants that broker the whole economy.');
m(3, 'econ', 'sanctions_resilience', 'Sanctions Resilience', ['digital_currency', 'reshoring'], { wealth: 0.04, tradeBonus: 0.05 }, 'Alternative payment rails, barter and shadow fleets.');
m(4, 'econ', 'automation_dividend', 'Automation Dividend', ['platform_economy', 'military_ai'], { wealth: 0.15, prod: 0.1 }, 'Robots and AI do most of the work: the gains are vast.');

const TIERS = { internet: 1, social_media: 1, globalization: 1, renewables: 1, cyber_warfare: 1, counter_terrorism: 1, precision_munitions: 1, genetic_engineering: 1, electric_vehicles: 2,
  machine_learning: 2, robotics: 2, network_warfare: 2, stealth_tech: 2, missile_defense: 2, mass_surveillance: 2, autonomous_systems: 2, artificial_intelligence: 3, directed_energy: 3,
  vertical_farming: 3, technocracy: 4, fusion: 4, orbital_industry: 4, interstellar_travel: 5 };
for (const x of TECHS) if (x.age === 9 && !x.tier) x.tier = TIERS[x.id] || 2;
// modern technologies cost by tier: weeks for a superpower's laboratories, years for a small state
export const tierCost = k => Math.round(26000 * Math.pow(1.38, k));
export const TECH = {}; for (const x of TECHS) { x.cost = x.tier ? tierCost(x.tier) : Math.round(techCost(x.age) * (0.85 + 0.3 * (x.req.length ? 1 : 0) + (x.req.length > 1 ? 0.1 : 0))); TECH[x.id] = x; }
export const AGE_TECHS = AGES.map((_, a) => TECHS.filter(x => x.age === a));

export function canResearch(N, id) { const x = TECH[id]; return !!x && !N.techs[id] && x.age <= N.age && x.req.every(r => N.techs[r]); }
export function available(N) { return TECHS.filter(x => canResearch(N, x.id)); }
export function has(N, id) { return !!N.techs[id]; }
// share of the current age's technologies known
export function ageProgress(N, a = N.age) { const L = AGE_TECHS[a]; return L.filter(x => N.techs[x.id]).length / L.length; }
export const ADVANCE_SHARE = 0.6;
// all techs of earlier ages (used when starting in a later age)
export function techsBefore(a) { const out = {}; for (const x of TECHS) if (x.age < a) out[x.id] = 1; return out; }
