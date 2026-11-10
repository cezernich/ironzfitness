'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync(require.resolve('../js/db.js'), 'utf8');
const start = source.indexOf('  async function saveDayRestrictionRange(');
const end = source.indexOf('\n  // ── Public API', start);
let stored = JSON.stringify({ '2028-01-01': { action: 'remove' } });
let flushes = 0;
const context = {
  localStorage: { getItem: () => stored, setItem: (key, value) => { stored = value; } },
  flushKey: async key => { assert.strictEqual(key, 'dayRestrictions'); flushes++; },
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
(async () => {
  await context.saveDayRestrictionRange('2028-02-27', '2028-03-04', { type: 'rest', action: 'remove' });
  let result = JSON.parse(stored);
  assert.strictEqual(Object.keys(result).length, 8);
  assert.strictEqual(result['2028-02-29'].action, 'remove');
  await context.saveDayRestrictionRange('2028-03-05', '2028-03-11', { type: 'fatigue', action: 'reduce' });
  result = JSON.parse(stored);
  assert.strictEqual(Object.keys(result).length, 15);
  assert.strictEqual(result['2028-03-04'].action, 'remove');
  assert.strictEqual(result['2028-03-11'].action, 'reduce');
  const before = stored;
  for (const range of [['2028-03-11','2028-03-05'], ['2027-02-29','2027-03-01'], ['2028-01-01','2030-01-01']]) {
    await assert.rejects(context.saveDayRestrictionRange(...range, { action: 'remove' }));
    assert.strictEqual(stored, before);
  }
  assert.strictEqual(flushes, 2);
  console.log('Restriction ranges preserve unrelated dates and reject invalid ranges atomically');
})().catch(error => { console.error(error); process.exitCode = 1; });
