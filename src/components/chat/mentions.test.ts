// Tests for mentions.ts. Run with plain node:
//   node src/components/chat/mentions.test.ts
import assert from 'node:assert/strict';
import { insertMention, mentionQuery, mentionsIn, splitMentions } from './mentions.ts';

let passed = 0;
const test = (name: string, fn: () => void) => { try { fn(); passed++; } catch (err) { console.error(`FAIL ${name}`); throw err; } };

const members = [
  { user_id: 'owner', name: 'Subham Tewari' }, { user_id: 'rohan', name: 'Rohan Rajbanshi' },
  { user_id: 'saniya', name: 'Saniya Parvin' }, { user_id: 'vijay', name: 'Vijay Das' },
];

test('the @word being typed', () => {
  assert.deepEqual(mentionQuery('Please check @Ro', 16), { start: 13, query: 'Ro' });
  assert.deepEqual(mentionQuery('@', 1), { start: 0, query: '' });
  assert.equal(mentionQuery('mail me at a@b', 14), null); // not after a space
  assert.equal(mentionQuery('done @Rohan now', 15), null); // the caret is past it
});

test('picking a name', () => {
  assert.deepEqual(insertMention('Please check @Ro', 13, 16, 'Rohan Rajbanshi'), { text: 'Please check @Rohan Rajbanshi ', caret: 30 });
  assert.deepEqual(insertMention('@Sa the stock', 0, 3, 'Saniya Parvin'), { text: '@Saniya Parvin the stock', caret: 15 });
});

test('who a message mentions', () => {
  assert.deepEqual(mentionsIn('@Rohan Rajbanshi please count the freezer', members, 'owner'), ['rohan']);
  assert.deepEqual(mentionsIn('@rohan rajbanshi and @Vijay Das', members, 'owner').sort(), ['rohan', 'vijay']);
  assert.deepEqual(mentionsIn('@Everyone rush at 7', members, 'owner').sort(), ['rohan', 'saniya', 'vijay']);
  assert.deepEqual(mentionsIn('@Subham Tewari is me', members, 'owner'), []); // not yourself
  assert.deepEqual(mentionsIn('email@Rohan Rajbanshi', members, 'owner'), []); // not inside a word
  assert.deepEqual(mentionsIn('@Rohan Rajbanshis', members, 'owner'), []); // not a longer word
});

test('the body with the mentions marked', () => {
  assert.deepEqual(splitMentions('Hi @Rohan Rajbanshi, check @Everyone', members.map((m) => m.name)), [
    { text: 'Hi ', mention: false }, { text: '@Rohan Rajbanshi', mention: true }, { text: ', check ', mention: false }, { text: '@Everyone', mention: true },
  ]);
  assert.deepEqual(splitMentions('no mentions here', []), [{ text: 'no mentions here', mention: false }]);
});

console.log(`mentions: ${passed} tests passed`);
