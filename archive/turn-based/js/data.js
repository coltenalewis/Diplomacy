// Great powers. Leaders are fictional.
export const POWERS = {
  USA: { name: 'United States', adj: 'American', color: '#3d8bff', leader: 'President Marcus Hale', codename: 'EAGLE', capital: 'NYK',
    traits: { aggression: 0.6, loyalty: 0.6, caution: 0.45 } },
  BRA: { name: 'Brazil', adj: 'Brazilian', color: '#27d86c', leader: 'President Lucia Andrade', codename: 'JAGUAR', capital: 'RIO',
    traits: { aggression: 0.45, loyalty: 0.7, caution: 0.5 } },
  GBR: { name: 'United Kingdom', adj: 'British', color: '#ff4fa3', leader: 'Prime Minister Edmund Gray', codename: 'LION', capital: 'LON',
    traits: { aggression: 0.5, loyalty: 0.6, caution: 0.6 } },
  FRA: { name: 'France', adj: 'French', color: '#a26bff', leader: 'President Celine Moreau', codename: 'ROOSTER', capital: 'PAR',
    traits: { aggression: 0.5, loyalty: 0.5, caution: 0.5 } },
  GER: { name: 'Germany', adj: 'German', color: '#c8a46a', leader: 'Chancellor Dieter Brandt', codename: 'IRON', capital: 'BER',
    traits: { aggression: 0.65, loyalty: 0.5, caution: 0.4 } },
  RUS: { name: 'Russia', adj: 'Russian', color: '#eef3f8', leader: 'President Anatoly Volkov', codename: 'BEAR', capital: 'MOS',
    traits: { aggression: 0.8, loyalty: 0.3, caution: 0.3 } },
  TUR: { name: 'Turkey', adj: 'Turkish', color: '#ff8a1f', leader: 'President Kemal Arslan', codename: 'CRESCENT', capital: 'CON',
    traits: { aggression: 0.6, loyalty: 0.45, caution: 0.5 } },
  RSA: { name: 'South Africa', adj: 'South African', color: '#b8f23c', leader: 'President Thabo Nkosi', codename: 'SPRINGBOK', capital: 'JOH',
    traits: { aggression: 0.45, loyalty: 0.7, caution: 0.5 } },
  IND: { name: 'India', adj: 'Indian', color: '#ffc933', leader: 'Prime Minister Ravi Mehta', codename: 'TIGER', capital: 'DEL',
    traits: { aggression: 0.5, loyalty: 0.6, caution: 0.55 } },
  CHN: { name: 'China', adj: 'Chinese', color: '#ff3344', leader: 'Chairman Wei Zhang', codename: 'DRAGON', capital: 'BEJ',
    traits: { aggression: 0.75, loyalty: 0.4, caution: 0.35 } },
  JPN: { name: 'Japan', adj: 'Japanese', color: '#1fe0d0', leader: 'Prime Minister Haruto Sato', codename: 'SUN', capital: 'TOK',
    traits: { aggression: 0.6, loyalty: 0.55, caution: 0.4 } },
  AUS: { name: 'Australia', adj: 'Australian', color: '#e07a5f', leader: 'Prime Minister Fiona McRae', codename: 'KANGAROO', capital: 'SYD',
    traits: { aggression: 0.4, loyalty: 0.75, caution: 0.6 } },
};
export const POWER_IDS = Object.keys(POWERS);

export const DIFFICULTY = {
  recruit: { label: 'RECRUIT', search: 0, noise: 2.5, scenarios: 1, desc: 'Greedy commanders. Predictable, forgiving.' },
  veteran: { label: 'VETERAN', search: 40, noise: 1.0, scenarios: 2, desc: 'Simulates outcomes and coordinates supports.' },
  elite: { label: 'ELITE', search: 110, noise: 0.4, scenarios: 3, desc: 'Deep war-gaming against worst-case enemy moves.' },
};
