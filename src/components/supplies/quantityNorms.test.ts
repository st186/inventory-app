// Tests for how shopping-list quantities are written (quantityNorms.ts). Run:
//   npx esbuild src/components/supplies/quantityNorms.test.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/norms-test.mjs && node node_modules/.cache/norms-test.mjs
import assert from 'node:assert/strict';
import { baseQty, normIssue, qtyLabel } from './quantityNorms';

let n = 0;
const test = (name: string, fn: () => void) => { fn(); n++; };
const L = (item: string, qty: number, unit: string, packSize?: number, packUnit?: string) => ({ item, qty, unit, packSize, packUnit });

test('labels say the packs and the size of each', () => {
  assert.equal(qtyLabel(L('Oil', 2, 'packet', 1, 'L')), '2 packets × 1 L');
  assert.equal(qtyLabel(L('Mayonnaise', 1, 'packet', 1, 'kg')), '1 packet × 1 kg');
  assert.equal(qtyLabel(L('Ginger', 400, 'g')), '400 g');
  assert.equal(qtyLabel(L('Coriander Leaves', 2, 'bundle')), '2 bundles');
  assert.equal(qtyLabel(L('Burger buns', 3, 'box', 6, 'pcs')), '3 boxes × 6 pcs');
  assert.equal(qtyLabel(L('Lemon', 6, 'pcs')), '6 pcs');
});

test('packs come to a weight or volume for the expense', () => {
  assert.deepEqual(baseQty(L('Oil', 2, 'packet', 1, 'L')), { qty: 2, unit: 'L' });
  assert.deepEqual(baseQty(L('Chat Masala', 4, 'packet', 250, 'g')), { qty: 1, unit: 'kg' });
  assert.deepEqual(baseQty(L('Peri Peri Masala', 2, 'packet', 100, 'g')), { qty: 200, unit: 'g' });
  assert.deepEqual(baseQty(L('Oil', 2, 'packet', 1, 'L'), 3), { qty: 3, unit: 'L' });
  assert.deepEqual(baseQty(L('Ginger', 400, 'g')), { qty: 400, unit: 'g' });
});

test('the owner\'s rules', () => {
  // Packed goods: "Oil 2 pcs" and a masala by weight alone are not clear enough.
  assert.match(normIssue(L('Oil', 2, 'pcs'), 'grocery') || '', /not counted in pieces/);
  assert.match(normIssue(L('Chat Masala', 200, 'g'), 'grocery') || '', /how many packs/);
  assert.match(normIssue(L('Oil', 2, 'packet'), 'grocery') || '', /size of each packet/);
  assert.equal(normIssue(L('Oil', 2, 'packet', 1, 'L'), 'grocery'), null);
  assert.equal(normIssue(L('Chat Masala', 2, 'packet', 100, 'g'), 'grocery'), null);
  // Loose staples by weight are fine.
  assert.equal(normIssue(L('Maida', 10, 'kg'), 'grocery'), null);
  // Vegetables by weight; leafy herbs by the bundle only; lemons may be counted.
  assert.equal(normIssue(L('Ginger', 400, 'g'), 'vegetables'), null);
  assert.match(normIssue(L('Carrot', 2, 'pcs'), 'vegetables') || '', /by weight/);
  assert.match(normIssue(L('Coriander Leaves', 500, 'g'), 'vegetables') || '', /by the bundle/);
  assert.equal(normIssue(L('Pudina', 2, 'bundle'), 'vegetables'), null);
  assert.match(normIssue(L('Cabbage', 2, 'bundle'), 'vegetables') || '', /Only leafy herbs/);
  assert.equal(normIssue(L('Lemon', 6, 'pcs'), 'vegetables'), null);
  assert.equal(normIssue(L('Chicken', 8, 'kg'), 'meat'), null);
  assert.match(normIssue(L('Ginger', 0, 'g'), 'vegetables') || '', /How much/);
  // Butter is packed: "Butter 5 pcs" needs the pack size.
  assert.match(normIssue(L('Butter', 5, 'pcs'), 'dairy') || '', /not counted in pieces/);
});

console.log(`quantityNorms: ${n} tests passed`);
