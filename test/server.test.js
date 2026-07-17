'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { _test } = require('../index.js');

test('readLastMessages returns the last two non-system conversation messages', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'st-chat-archive-'));
  const filePath = path.join(directory, 'chat.jsonl');
  const lines = [
    { chat_metadata: {}, user_name: 'User', character_name: 'Character' },
    { name: 'Character', is_user: false, is_system: false, mes: 'Earlier reply' },
    { name: 'System', is_user: false, is_system: true, mes: 'Hidden system line' },
    { name: 'User', is_user: true, is_system: false, mes: 'Latest question' },
    { name: 'Character', is_user: false, is_system: false, mes: 'Latest answer' },
  ];
  await fs.promises.writeFile(filePath, lines.map(line => JSON.stringify(line)).join('\n'), 'utf8');

  const messages = await _test.readLastMessages(filePath, 2);
  assert.deepEqual(messages.map(message => message.text), ['Latest question', 'Latest answer']);
});

test('readLastMessages handles messages larger than one read chunk', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'st-chat-archive-large-'));
  const filePath = path.join(directory, 'chat.jsonl');
  const largeText = 'x'.repeat(90 * 1024);
  const lines = [
    { chat_metadata: {} },
    { name: 'User', is_user: true, mes: 'Question' },
    { name: 'Character', is_user: false, mes: largeText },
  ];
  await fs.promises.writeFile(filePath, lines.map(line => JSON.stringify(line)).join('\n'), 'utf8');

  const messages = await _test.readLastMessages(filePath, 2);
  assert.equal(messages[0].text, 'Question');
  assert.equal(messages[1].text.length, largeText.length);
});

test('readLastMessages preserves UTF-8 text across chunk boundaries', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'st-chat-archive-utf8-'));
  const filePath = path.join(directory, 'chat.jsonl');
  const largeText = `开头${'镜花水月'.repeat(24000)}结尾`;
  const lines = [
    { chat_metadata: {} },
    { name: '小薇', is_user: true, mes: '你什么时候回来？' },
    { name: '镜花水月', is_user: false, mes: largeText },
  ];
  await fs.promises.writeFile(filePath, lines.map(line => JSON.stringify(line)).join('\n'), 'utf8');

  const messages = await _test.readLastMessages(filePath, 2);
  assert.equal(messages[0].text, '你什么时候回来？');
  assert.equal(messages[1].text, largeText);
});

test('resolveUnder rejects traversal outside the chat directory', () => {
  assert.throws(() => _test.resolveUnder('C:/safe/chats', '..', 'secret.txt'));
});

test('deleteCharacterChat removes an empty character chat directory', async () => {
  const chatsRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'st-chat-archive-delete-'));
  const characterDirectory = path.join(chatsRoot, 'TestCharacter');
  await fs.promises.mkdir(characterDirectory);
  await fs.promises.writeFile(path.join(characterDirectory, 'Only Chat.jsonl'), '{}\n', 'utf8');

  const result = await _test.deleteCharacterChat(chatsRoot, 'TestCharacter.png', 'Only Chat');
  assert.equal(result.remaining_count, 0);
  assert.equal(result.removed_directory, true);
  assert.equal(fs.existsSync(characterDirectory), false);
});
