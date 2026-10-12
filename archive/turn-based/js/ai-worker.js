// Runs AI planning off the main thread.
import { WorldMap } from './engine.js';
import { valueMaps, heuristicOrders, planOrders } from './ai.js';

let map = null;

self.onmessage = e => {
  const m = e.data;
  if (m.type === 'init') { map = new WorldMap(m.map); self.postMessage({ type: 'ready' }); return; }
  if (m.type === 'plan') {
    const { state, ctxs, level, aiPowers, playerOrders, player } = m;
    const t0 = performance.now();
    const vms = {}, predicted = {}, byPower = {};
    for (const p of Object.keys(ctxs)) {
      vms[p] = valueMaps(map, state, ctxs[p]);
      byPower[p] = heuristicOrders(map, state, ctxs[p], vms[p], 1);
      Object.assign(predicted, byPower[p]);
    }
    const orders = {};
    aiPowers.forEach((p, k) => {
      const ctx = ctxs[p];
      let allyPlans = null;
      for (const a of ctx.allies) {
        const plan = a === player ? playerOrders : byPower[a];
        if (plan) allyPlans = { ...(allyPlans || {}), ...plan };
      }
      orders[p] = planOrders(map, state, ctx, vms[p], predicted, { ...level, allyPlans });
      self.postMessage({ type: 'progress', done: k + 1, total: aiPowers.length, power: p });
    });
    self.postMessage({ type: 'plan', orders, forecast: byPower, ms: performance.now() - t0 });
  }
};
