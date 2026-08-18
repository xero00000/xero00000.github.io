import assert from 'node:assert/strict';
import { DEFAULT_STATE, PRESETS } from './presets.js';
import './profile-normalizer.js';

const byId = id => {
  const preset = PRESETS.find(item => item.id === id);
  assert.ok(preset, `Missing preset ${id}`);
  return preset;
};

function apply(state, id) {
  Object.assign(state, byId(id).patch);
  return state;
}

// Reproduce the reported bug directly: green terminal -> PVM must become color again.
{
  const state = { ...DEFAULT_STATE };
  apply(state, 'green-terminal');
  assert.equal(state.phosphorType, 1);
  assert.equal(state.saturation, 0);
  apply(state, 'pvm-rgb');
  assert.equal(state.phosphorType, DEFAULT_STATE.phosphorType, 'P31 phosphor leaked into PVM');
  assert.equal(state.saturation, DEFAULT_STATE.saturation, 'monochrome saturation leaked into PVM');
  assert.equal(state.persistenceStrength, DEFAULT_STATE.persistenceStrength, 'terminal persistence leaked into PVM');
  assert.equal(state.phosphorDecayG, DEFAULT_STATE.phosphorDecayG, 'green decay leaked into PVM');
}

// Fault/aging profiles must not contaminate a clean profile either.
{
  const state = { ...DEFAULT_STATE };
  apply(state, 'worn-tube');
  assert.ok(state.burnIn > 0);
  assert.ok(state.weakBlue > 0);
  apply(state, 'bvm-master');
  assert.equal(state.burnIn, DEFAULT_STATE.burnIn, 'burn-in leaked out of Worn Tube');
  assert.equal(state.weakRed, DEFAULT_STATE.weakRed, 'red gun fault leaked out of Worn Tube');
  assert.equal(state.weakGreen, DEFAULT_STATE.weakGreen, 'green gun fault leaked out of Worn Tube');
  assert.equal(state.weakBlue, DEFAULT_STATE.weakBlue, 'blue gun fault leaked out of Worn Tube');
}

// Session/source/performance preferences intentionally survive profile changes.
{
  const state = {
    ...DEFAULT_STATE,
    sourceZoom: 1.73,
    sourcePanX: 0.22,
    renderScale: 0.65,
    maxDPR: 1,
    recordFPS: 30,
    glare: 0.42
  };
  apply(state, 'vhs-ep');
  apply(state, 'pvm-rgb');
  assert.equal(state.sourceZoom, 1.73);
  assert.equal(state.sourcePanX, 0.22);
  assert.equal(state.renderScale, 0.65);
  assert.equal(state.maxDPR, 1);
  assert.equal(state.recordFPS, 30);
  assert.equal(state.glare, 0.42);
}

console.log('CRT profile regression checks passed.');
