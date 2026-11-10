'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Minimal card DOM: render the real markup and exercise the exported UI handlers.
function setup() {
  let cards = [];
  const host = {
    set innerHTML(html) {
      cards = Array.from(html.matchAll(/<button[^>]*data-(goal|role)="([^"]+)"/g), match => {
        const classes = new Set();
        return { kind: match[1], id: match[2],
          getAttribute: name => name === 'data-' + match[1] ? match[2] : null,
          classList: { add: c => classes.add(c), contains: c => classes.has(c),
            toggle(c) { if (classes.has(c)) classes.delete(c); else classes.add(c); } } };
      });
    },
    querySelector(selector) {
      const match = selector.match(/\[data-(goal|role)="([^"]+)"\]/);
      return match ? cards.find(c => c.kind === match[1] && c.id === match[2]) : null;
    },
    querySelectorAll: () => [], // No icon nodes needed for selection behavior.
  };
  const context = vm.createContext({ console, localStorage: { getItem: () => null, setItem() {} },
    document: { createElement: () => ({ textContent: '', get innerHTML() { return this.textContent; } }),
      getElementById: id => id === 'bp-v2-goal-cards' ? host : null,
      querySelectorAll(selector) {
        assert.equal(selector, '#bp-v2-2 [data-goal].is-selected');
        return cards.filter(c => c.kind === 'goal' && c.classList.contains('is-selected'));
      }, addEventListener() {} } });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/onboarding-v2.js'), 'utf8'), context);
  const ob = context.OnboardingV2;
  ob._state.selectedSports = ['swim', 'bike', 'run'];
  ob._renderGoalCards();
  const click = id => ob._toggleGoal(host.querySelector('[data-goal="' + id + '"]'));
  const selected = () => cards.filter(c => c.kind === 'goal' && c.classList.contains('is-selected')).map(c => c.id);
  return { ob, click, selected, host };
}

const h = setup();
h.click('race');
h.click('speed');
h.click('general');
h.click('general'); // A removed goal must stay removed after the rebuild.
h.ob._addStrengthFromRecommendation();
assert.deepEqual(h.selected(), ['race', 'speed']);
assert.deepEqual(Array.from(h.ob._state.selectedSports), ['swim', 'bike', 'run', 'strength']);
assert.ok(h.host.querySelector('[data-role="race_performance"]'), 'strength choices appear');
assert.equal(h.ob._state.strengthRole, null, 'adding strength does not choose its role');
h.ob._addStrengthFromRecommendation();
assert.deepEqual(h.selected(), ['race', 'speed']);
assert.equal(h.ob._state.selectedSports.filter(s => s === 'strength').length, 1);

const empty = setup();
empty.click('race');
empty.click('race');
empty.ob._addStrengthFromRecommendation();
assert.deepEqual(empty.selected(), [], 'deselecting the last goal survives the rebuild');
console.log('PASS: adding strength preserves selected and deselected Build Plan goals');
