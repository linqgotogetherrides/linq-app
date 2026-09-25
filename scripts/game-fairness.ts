/**
 * Headless fairness/beasibility test for the Fill the Ride engine.
 *
 * Verifies the two things the design promises:
 *   1. No row ever blocks all three lanes (so the level is never a dead end).
 *   2. A competent player can actually win, and a passive player cannot.
 *
 * Run: npx tsx scripts/game-fairness.ts   (or via the npm script)
 */
import { GAME_CONFIG } from '../frontend/src/lib/game/constants';
import { createInitialState, moveLane, tick, FIXED_STEP_MS } from '../frontend/src/lib/game/engine';
import { makeRandom } from '../frontend/src/lib/game/spawner';
import type { GameState, Lane } from '../frontend/src/lib/game/types';

const LANES: Lane[] = [0, 1, 2];
const BLOCKERS = new Set([
  'expensive_cab', 'expensive_auto', 'crowded_bus', 'barricade',
  'traffic_car', 'traffic_bike', 'finish',
]);

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { pass += 1; console.log(`  [PASS] ${name}`); }
  else { fail += 1; console.log(`  [FAIL] ${name}  -> ${detail}`); }
};

// ---------------------------------------------------------------------------
// 1. Structural fairness: no fully-blocked row, across many seeds
// ---------------------------------------------------------------------------
console.log('\n=== 1. no row ever blocks all 3 lanes (300 seeds) ===');
let worstSealedRun = 0;
let totalRows = 0;

for (let seed = 1; seed <= 300; seed += 1) {
  const { state, spawner } = createInitialState(seed, GAME_CONFIG.seatsRequired);
  let sim: GameState = { ...state, phase: 'running' };
  // Track by entity id: tick() recycles entities, so positional slicing is wrong.
  const seenIds = new Set<string>();
  const rowsByZ = new Map<number, Set<Lane>>();
  for (let i = 0; i < 60 * 40; i += 1) {
    const res = tick(sim, spawner, FIXED_STEP_MS);
    sim = res.state;
    for (const e of res.state.entities) {
      if (seenIds.has(e.id)) continue;
      seenIds.add(e.id);
      if (!BLOCKERS.has(e.kind)) continue;
      const k = Math.round(e.z / GAME_CONFIG.spawnInterval);
      if (!rowsByZ.has(k)) rowsByZ.set(k, new Set());
      rowsByZ.get(k)!.add(e.lane);
    }
    if (sim.phase !== 'running') break;
  }
  for (const [z, lanes] of rowsByZ) {
    totalRows += 1;
    if (lanes.size === 3) worstSealedRun = Math.max(worstSealedRun, z);
  }
}
check(`no sealed rows across ${totalRows} rows`, worstSealedRun === 0 && totalRows > 1000, `sealed at z=${worstSealedRun}, rows=${totalRows}`);

// ---------------------------------------------------------------------------
// 2. Passenger placement: always in a lane that is not blocked in its row
// ---------------------------------------------------------------------------
console.log('\n=== 2. passengers never spawn in a blocked lane (200 seeds) ===');
let badPassengers = 0;
for (let seed = 1; seed <= 200; seed += 1) {
  const { state, spawner } = createInitialState(seed, GAME_CONFIG.seatsRequired);
  let sim: GameState = { ...state, phase: 'running' };
  for (let i = 0; i < 60 * 40; i += 1) {
    const before = sim.entities.length;
    const res = tick(sim, spawner, FIXED_STEP_MS);
    sim = res.state;
    const fresh = res.state.entities.slice(before);
    for (const p of fresh.filter((e) => e.kind === 'passenger')) {
      const rowZ = Math.round(p.z / GAME_CONFIG.spawnInterval);
      const blockers = fresh
        .filter((e) => BLOCKERS.has(e.kind) && Math.round(e.z / GAME_CONFIG.spawnInterval) === rowZ)
        .map((e) => e.lane);
      if (blockers.includes(p.lane)) badPassengers += 1;
    }
    if (sim.phase !== 'running') break;
  }
}
check('all passengers reachable', badPassengers === 0, `${badPassengers} blocked passengers`);

// ---------------------------------------------------------------------------
// 3. Beatable: a simple reactive bot should win most runs
// ---------------------------------------------------------------------------
console.log('\n=== 3. a competent bot can win (200 seeds) ===');
let wins = 0;
const SEEDS = 200;
/** Models a competent player: reads the road, dodges, detours for passengers. */
for (let seed = 1; seed <= SEEDS; seed += 1) {
  const { state, spawner } = createInitialState(seed, GAME_CONFIG.seatsRequired);
  let sim: GameState = { ...state, phase: 'running' };
  for (let i = 0; i < 60 * 40; i += 1) {
    // Look ~1.2s ahead and pick a lane that is clear for the whole window.
    const horizon = sim.distance + 700;
    const inWindow = sim.entities.filter((e) => !e.cleared && e.z > sim.distance && e.z < horizon);

    // Score each lane: clear of blockers, and a bonus for containing a passenger.
    const score = [0, 1, 2].map((lane) => {
      let value = 0;
      for (const e of inWindow) {
        if (e.lane !== lane) continue;
        if (BLOCKERS.has(e.kind)) value -= 100;
        if (e.kind === 'passenger') value += 40;
      }
      // Mild preference for the current lane to avoid dithering.
      if (lane === Math.round(sim.lanePosition)) value += 6;
      return value;
    });

    let best = score.indexOf(Math.max(...score));
    // Stay put if the current lane is as good as the best.
    const current = Math.round(sim.lanePosition);
    if (score[current] >= Math.max(...score) - 2) best = current;

    if (best > sim.lanePosition) sim = moveLane(sim, 1);
    else if (best < sim.lanePosition) sim = moveLane(sim, -1);

    const res = tick(sim, spawner, FIXED_STEP_MS);
    sim = res.state;
    if (sim.phase !== 'running') break;
  }
  if (sim.phase === 'won') wins += 1;
}
const winRate = wins / SEEDS;
check(`competent bot win rate ${(winRate * 100).toFixed(0)}% is in the 60-100% band`, winRate >= 0.6, `${wins}/${SEEDS}`);

// ---------------------------------------------------------------------------
// 4. Not trivial: a passive bot must NOT win
// ---------------------------------------------------------------------------
console.log('\n=== 4. a passive player cannot just cruise (200 seeds) ===');
let idleWins = 0;
for (let seed = 1; seed <= SEEDS; seed += 1) {
  const { state, spawner } = createInitialState(seed, GAME_CONFIG.seatsRequired);
  let sim: GameState = { ...state, phase: 'running' };
  for (let i = 0; i < 60 * 40; i += 1) {
    const res = tick(sim, spawner, FIXED_STEP_MS); // never moves
    sim = res.state;
    if (sim.phase !== 'running') break;
  }
  if (sim.phase === 'won') idleWins += 1;
}
check('idle player does not win', idleWins === 0, `${idleWins} idle wins`);

// ---------------------------------------------------------------------------
// 5. Determinism: same seed + same inputs = same outcome
// ---------------------------------------------------------------------------
console.log('\n=== 5. determinism ===');
const runSeed = (seed: number) => {
  const { state, spawner } = createInitialState(seed, GAME_CONFIG.seatsRequired);
  let sim: GameState = { ...state, phase: 'running' };
  for (let i = 0; i < 60 * 40; i += 1) {
    const res = tick(sim, spawner, FIXED_STEP_MS);
    sim = res.state;
    if (sim.phase !== 'running') break;
  }
  return `${sim.phase}:${sim.seats}:${Math.round(sim.distance)}`;
};
check('same seed reproduces identical run', runSeed(42) === runSeed(42), `${runSeed(42)} vs ${runSeed(42)}`);
check('different seeds differ', runSeed(42) !== runSeed(43), `${runSeed(42)} vs ${runSeed(43)}`);

// ---------------------------------------------------------------------------
// 6. Timing: a full run fits inside the 30s clock
// ---------------------------------------------------------------------------
console.log('\n=== 6. level length fits the clock ===');
let maxDuration = 0;
for (let seed = 1; seed <= 50; seed += 1) {
  const { state, spawner } = createInitialState(seed, GAME_CONFIG.seatsRequired);
  let sim: GameState = { ...state, phase: 'running' };
  let t = 0;
  for (let i = 0; i < 60 * 60; i += 1) {
    const res = tick(sim, spawner, FIXED_STEP_MS);
    sim = res.state;
    t += FIXED_STEP_MS;
    if (sim.phase !== 'running') break;
  }
  maxDuration = Math.max(maxDuration, t);
}
check(`max run ${(maxDuration / 1000).toFixed(1)}s <= 30s clock`, maxDuration <= 30_500, `${maxDuration}ms`);

console.log(`\n${'='.repeat(50)}\nPASSED ${pass}  FAILED ${fail}`);
if (fail > 0) process.exit(1);
