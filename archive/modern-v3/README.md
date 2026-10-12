# GLOBAL COMMAND

A real-time grand strategy and government simulator on a 3D Earth. Lead any of **113 nations**. Every other nation is governed by an AI.

## Run

```
npm start
```

Open http://localhost:8080. On Windows you can also double-click `start.bat`.

- Requires Node.js 18+ and a WebGL-capable browser.
- There are no npm dependencies. three.js and the NASA imagery are bundled in `public/`.

## The world
- **Globe:** NASA Blue Marble with relief shading from elevation data, drifting clouds with shadows, and an atmosphere. A real-time sun sweeps the day/night line across the planet.
- **City lights:** they grow with your cities and dim under blackouts, bombing and nuclear strikes.
- **Territory:** painted territories with two-tone national borders that redraw live as land changes hands.
- **Data:** real-world population and GDP per nation, spread across 280 land regions using the satellite imagery.

## Government (roleplay)
- **Regimes:** 7 types (parliamentary, presidential, constitutional or absolute monarchy, one-party, authoritarian, junta, technocracy). Each has its own politics. Democracies hold elections; low stability brings protests, plots and coups.
- **Cabinet:** 7 ministers (Defense, Finance, Industry, Science, Foreign, Interior, Intelligence) with skills and traits. Generals command army groups. You appoint people with political capital.
- **Laws:** 10 categories: conscription, tax, research funding, trade, industrial policy, civil liberties, military doctrine, nuclear posture, AI governance and welfare. You can also reform the constitution.
- **Cabinet meetings:** convene the cabinet weekly (top bar or the C key). Each minister tables concrete proposals from their portfolio: what to build and where, which units to raise at which factory or port, redeployments, training, research priorities, laws, trade deals, treaties, ultimatums and covert ops. You approve or deny each one. Advice quality follows skill: experts rank options correctly and estimate effects accurately, novices misjudge partners and costs, corrupt ministers pad budgets, and hawks and doves lean their own way.
- **Delegation:** give ministers standing directives within a spending limit, such as industrial expansion, a naval build-up, an AI research agenda, or securing supply lines. Generals carry out attack, defend, hold and train orders. You can take direct control of anything at any time.
- **Cabinet briefings:** narrative events with choices, such as strikes, scandals, coup plots, AI breakthroughs, disasters and refugee crises.

## Research
45 technologies across 9 branches: agriculture, energy, industry, society, computing and AI (up to AGI and superintelligence alignment), land, naval, aerospace (ICBMs, stealth, hypersonics) and nuclear (enrichment, weapons, thermonuclear, civil defense).

## Economy
- Food, energy, money, manpower and research.
- Buildings: cities, farms, power plants, oil fields, industry, ports, forts, research labs, AI datacenters, military academies and nuclear programs.
- Live trade lanes that enemy navies and submarines can blockade.
- Sanctions reduce the target's income.

## Physical warfare
- **Positions:** every unit has a real position, drawn as a glowing dot. Badges show group strength and experience.
- **Ranges:**

  | Unit | Range |
  |---|---|
  | Infantry | 45 km |
  | Armor | 60 km |
  | Artillery | 160 km |
  | Destroyer | 180 km |
  | Submarine | 110 km |
  | Cruiser | 320 km |
  | Carrier air wing | 700 km |

  Anything in range of an enemy fires, and you see the tracers, artillery arcs, torpedoes and impacts.
- **Aircraft:** they fly real sorties. Bombers fly out, bomb and return; fighters scramble to intercept within 1,100 km.
- **Experience:** units gain experience in combat and training.
- **Nuclear weapons:** delivered by bomber or ICBM. Strikes are interceptable by missile defense, bring retaliation, sanctions and world condemnation, and repeated use causes nuclear winter.

## Statecraft
Pacts, alliances, peace and trade deals. Guarantees of independence, military aid, mediation, sanctions, territorial ultimatums and technology sharing. Covert operations: steal technology, sabotage, incite unrest, and cyber attacks.

## Controls
| | |
|---|---|
| Rotate / zoom | Left-drag / scroll |
| Select | Click a region, unit dot or badge; Shift-drag to box-select |
| Move / attack | Right-click a region; right-click enemy land with aircraft selected to strike it |
| Time | `Space` pauses, `1`–`4` set the speed |
| Other | `Esc` clears the selection, `H` returns to your capital |

## Development
```
npm run sim         # one-year headless world simulation
npm run test:war    # army group offensive and nuclear strike test
npm run test:air    # bomber sortie and fighter interception test
npm run test:cabinet # compare advice from a skilled vs an incompetent cabinet
npm run build-map   # regenerate the region map
```
The turn-based Diplomacy version is kept in `archive/turn-based/`.
