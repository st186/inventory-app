// Tests for itemNames.ts. Run with plain node:
//   node supabase/functions/make-server-c2dd9b9d/itemNames.test.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { englishKey, matchName, nameKey, type KnownItem } from './itemNames.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

// Names on the list on 31 Oct 2026 (after the merge), with a few that look alike but aren't.
const known: KnownItem[] = ['Paneer', 'Rapido', 'Duster', 'Makhani Gravy', 'Labour Charge', 'Evening Snacks', 'Tea', 'Toto', 'Onion', 'Tomato', 'Tomato Sauce',
  'Butter', 'Butter brush', 'Carrot', 'Chicken', 'Red Chilli', 'Red Chilli Sauce', 'Coca-Cola', 'Breakfast', 'Garbage Bag', 'Egg', 'Water Jar', 'Corn Flakes']
  .map((name) => ({ name }));
const m = (typed: string) => matchName(typed, known);

test('the app copy and the server copy are the same rules', () => {
  const body = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').split('\n').slice(1).join('\n');
  assert.equal(body('./itemNames.ts'), body('../../../src/utils/itemNames.ts'));
});

test('capitals, spacing, counts and "cost" are the same name', () => {
  assert.equal(nameKey('  Toto '), 'toto');
  assert.equal(nameKey('Breakfast Cost'), 'breakfast');
  assert.equal(nameKey('Cornflakes (10 pcs)'), 'cornflakes');
  assert.equal(nameKey('Dabba 1 ta'), 'dabba');
  assert.equal(nameKey('Paneer 2 kg'), 'paneer');
  assert.deepEqual(m('TOTO'), { item: { name: 'Toto' }, how: 'same' });
  assert.equal(m('breakfast cost')?.item.name, 'Breakfast');
  assert.equal(m('Garbage bag')?.how, 'same');
});

test('the misspellings found in the past data', () => {
  for (const [typed, want] of [['Panner', 'Paneer'], ['Ripido', 'Rapido'], ['Repido', 'Rapido'], ['Dastar', 'Duster'], ['Makhni Gravy', 'Makhani Gravy'],
    ['Lebar charge', 'Labour Charge'], ['Evining snackes', 'Evening Snacks'], ['Cornflakes', 'Corn Flakes']]) {
    assert.equal(m(typed)?.item.name, want, typed);
  }
});

test('Bengali and Hindi words', () => {
  assert.equal(englishKey('Cha'), 'tea');
  assert.deepEqual(m('Cha'), { item: { name: 'Tea' }, how: 'word' });
  assert.equal(m('Chaa')?.item.name, 'Tea');
  assert.equal(m('dim')?.item.name, 'Egg');
  assert.equal(m('Peyaj')?.item.name, 'Onion');
});

test('different things that share words are not matched', () => {
  assert.equal(m('Tomato Sauce')?.item.name, 'Tomato Sauce'); // its own, not Tomato
  assert.equal(m('Crate'), null);          // not Carrot
  assert.equal(m('Chakni'), null);         // not Chicken
  assert.equal(m('Unun'), null);           // a clay stove, not Onion
  assert.equal(m('Butter paper'), null);   // not Butter
  assert.equal(m('Red Chilli Powder'), null);
  assert.equal(m('Coke'), null);           // short: only exact
  assert.equal(m('Hata'), null);           // a new word: Bunny judges it
  assert.equal(m(''), null);
});

console.log(`itemNames: ${passed} passed`);
