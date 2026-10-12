# Ages of Command

Real-time grand strategy from the Stone Age to the Information Age, on a 3D Earth, served on localhost.

## Run

```
npm start        # or: node server.js, or double-click start.bat
```

Open http://localhost:8080. No dependencies are needed beyond Node.

The game is entirely static and runs in the browser (saves go to the browser's local storage), so it can be hosted anywhere. On Vercel, import the repository; `vercel.json` serves the `public/` folder with no build step.

## The game

- **An empty world.** The Earth is divided into 2,597 land tiles named after real places, grouped into historical provinces, plus 96 sea zones (54 are deep ocean). Games saved on the older 1,698-tile map still load on that map. Civilizations start as single tribes on random tiles. You choose how many rivals there are and click your own homeland on the globe.
- **Land.** Every tile has a terrain read from NASA imagery: river valleys, grassland, forest, jungle, hills, mountains, steppe, desert, taiga, tundra and ice. It also has fertility and resource deposits placed where they occur on the real Earth. Claim neighbouring land with settlers, cross coastal waters with Rafts and the deep ocean with Navigation, or subdue native peoples by force.
- **Resources.** Food, wood, stone, metal, wealth and oil are stockpiled. 59 deposit types are placed sparsely, where they occur on the real Earth: most land holds one or two notable resources and much holds none. Strategic resources (obsidian, horses, camels, elephants, copper, tin, iron, saltpeter, coal, oil, natural gas, rubber, aluminum, phosphate, uranium, rare earths, lithium, cobalt) gate units and boost industry. Luxuries raise approval. Hidden deposits reveal themselves as you research.
- **Settlements.** Camps grow into villages, towns, cities, metropolises and megalopolises. Tiles are worked with farms, pastures, hunting camps, fisheries, lumber mills, quarries, mines, plantations and oil wells, and each improvement level needs workers. Fourteen building lines evolve with the ages, plus 18 one-of-a-kind wonders.
- **Ten ages, 211 technologies.** Advance once you know about two thirds of an age's technologies and can pay the cost. Knowledge spreads between civilizations that know each other. The calendar runs from 10,000 BC and follows the most advanced civilization.
- **Units by line.** Infantry, ranged, mounted, siege, air defense, transports, warships, submarines, carriers, fighters and bombers each upgrade through the ages, from warbands and rafts to stealth bombers. Regional units such as war elephants, camel riders and obsidian warriors need the right resources. Units have physical positions, ranges and terrain effects. Refit old units to the newest equipment.
- **Rule.** Governments evolve from Tribal Council and Chiefdom through Theocracy, Monarchy, Classical Republic, Empire, Feudal Monarchy, Merchant Republic, Absolute and Constitutional Monarchy, Democracy and One-Party State, to Technocracy. Laws, counsellor titles and events change with the age.
- **Peoples and faiths.** Every land has a people and a faith. Conquered peoples keep their identity and slowly assimilate; folk beliefs give way to pantheons, philosophies and world religions founded by civilizations during play, each with a holy city. Faith spreads from land to land and shapes diplomacy and holy wars. Map lenses show culture, faith and unrest.
- **Provinces and officials.** Appoint governors to provinces and mayors to cities (democracies elect them). Skill and traits matter: corrupt officials skim, ambitious ones in a failing state may rebel. Grant a province autonomy to make it a self-ruling vassal state.
- **Unrest.** Famine, blackouts, unpopular rule, foreign peoples, other faiths and occupation breed unrest. It boils over into revolts that troops must crush, insurgencies that return occupied land to its old rulers, separatist, sectarian and revolutionary movements, revolutions that topple governments, and terror attacks in the modern age. Rivals can fund insurgents inside your realm.
- **Destinies.** Hold the right lands in the right age to proclaim Egypt, Akkad, Persia, Rome, Han China, the Caliphate, the Mongol, Inca, Aztec, Ottoman or British Empire, the USSR, the EU, or any modern nation.
- **Diplomacy.** You can only deal with peoples you have met. Options include pacts, alliances, war and peace, trade in goods and strategic-resource access, tribute, territorial demands, knowledge exchange, gifts, embargoes, guarantees and spies.
- **Delegation.** Convene the council (C) to approve proposals (including governors, revolt suppression and answers to movements), give standing orders, or raise armies in bulk with the war council (R).
- **Victory.** Win by dominion (a chosen share of the world's land), by science (launching the Interstellar Colony Ship), or by score when the year 2100 arrives.

## Tools

```
node tools/build-tiles.js [--png]      # rebuild public/data/tiles.json from Natural Earth data
node tools/era-sim.mjs [days] [civs]   # headless all-AI history for balancing
```

`public/data/tilegeo.json` holds per-tile terrain statistics sampled from the NASA textures. The previous modern-day version of the game is preserved in `archive/modern-v3`, and the original turn-based Diplomacy is in `archive/turn-based`.

## Credits

8K Earth day and night textures by [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0), based on NASA imagery. Map data from Natural Earth.
