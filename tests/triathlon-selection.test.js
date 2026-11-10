'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function node(attrs = {}) {
  const classes = new Set();
  return { attrs, checked: false, style: {}, getAttribute: k => attrs[k], setAttribute: (k,v) => { attrs[k]=v; },
    classList: { contains: c => classes.has(c), add: c => classes.add(c), remove: c => classes.delete(c),
      toggle(c, on = !classes.has(c)) { if (on) classes.add(c); else classes.delete(c); } } };
}
const cards = Object.fromEntries(['triathlon','run','bike','swim','strength','hyrox'].map(s => [s,node({'data-sport':s})]));
const inputs = ['run','bike','swim'].map(s => node({'data-tri-sport':s}));
const group=node(), equipment=node();
const document = {
  getElementById: id => id==='bp-v2-tri-note'?group:id==='bp-v2-equipment-section'?equipment:null,
  querySelector(selector) {
    const match=selector.match(/\[data-(sport|tri-sport)="([^"]+)"\]/);
    if (!match) throw Error('Unexpected selector: '+selector);
    const el=match[1]==='sport'?cards[match[2]]:inputs.find(i=>i.attrs['data-tri-sport']===match[2]);
    return selector.endsWith('.is-selected')&&!el?.classList.contains('is-selected')?null:el;
  },
  querySelectorAll(selector) {
    if(selector==='#bp-v2-sport-grid .is-selected')return Object.values(cards).filter(c=>c.classList.contains('is-selected'));
    if(selector==='[data-tri-sport]')return inputs;
    if(selector==='[data-tri-sport]:checked')return inputs.filter(i=>i.checked);
    throw Error('Unexpected selector: '+selector);
  }, addEventListener() {},
};
const context=vm.createContext({console:{warn(){},log(){},error(){}},document,localStorage:{getItem:()=>null,setItem(){}}});
context.window=context;
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/onboarding-v2.js'),'utf8'),context);
const ob=context.OnboardingV2;
const save=()=>{ob._saveSportsAndContinue();return Array.from(ob._state.selectedSports).sort();};
ob._toggleSport(cards.triathlon);
assert.ok(inputs.every(i=>i.checked));
assert.equal(group.style.display,'');
assert.equal(cards.triathlon.attrs['aria-expanded'],'true');
for(const s of ['run','bike','swim'])assert.equal(cards[s].classList.contains('is-selected'),false);
assert.deepEqual(save(),['bike','run','swim']);
inputs.find(i=>i.attrs['data-tri-sport']==='swim').checked=false;
ob._applySportSideEffects();
assert.ok(cards.triathlon.classList.contains('is-selected'),'Triathlon stays selected without swimming');
assert.deepEqual(save(),['bike','run']);
ob._toggleSport(cards.strength);
assert.deepEqual(save(),['bike','run','strength']);
assert.equal(equipment.style.display,'');
ob._toggleSport(cards.swim);
assert.deepEqual(save(),['bike','run','strength','swim']);
assert.equal(cards.swim.classList.contains('is-selected'),false,'individual card delegates to its checkbox');
ob._toggleSport(cards.triathlon);
assert.equal(group.style.display,'none');
assert.ok(inputs.every(i=>!i.checked));
assert.deepEqual(save(),['strength'],'turning Triathlon off drops its disciplines, preserves strength');
ob._toggleSport(cards.run);
assert.deepEqual(save(),['run','strength'],'standalone sport selection still works');
ob._toggleSport(cards.triathlon);
ob._toggleSport(cards.hyrox);
assert.deepEqual(save(),['bike','hyrox','run','strength','swim']);
assert.equal(cards.run.classList.contains('is-selected'),false,'Hyrox does not duplicate a grouped running highlight');
console.log('PASS: grouped Triathlon selection, unchecked disciplines, standalone sports, strength and Hyrox');
