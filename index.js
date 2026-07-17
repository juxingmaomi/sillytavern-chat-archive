'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_ID = 'chat-archive';
const JSONL_EXTENSION = '.jsonl';
const PNG_EXTENSION = '.png';
const READ_CHUNK_SIZE = 64 * 1024;

function isSafeName(value) {
  return typeof value === 'string'
    && value.length > 0
    && value === path.basename(value)
    && !value.includes('/')
    && !value.includes('\\')
    && value !== '.'
    && value !== '..';
}

function resolveUnder(parent, ...segments) {
  const parentPath = path.resolve(parent);
  const candidate = path.resolve(parentPath, ...segments);
  const relative = path.relative(parentPath, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Resolved path is outside the permitted directory.');
  }
  return candidate;
}

function normalizeAvatar(value) {
  if (!isSafeName(value)) throw new Error('Invalid avatar name.');
  const avatar = value.endsWith(PNG_EXTENSION) ? value : `${value}${PNG_EXTENSION}`;
  if (!isSafeName(avatar)) throw new Error('Invalid avatar name.');
  return avatar;
}

function normalizeChatFile(value) {
  if (!isSafeName(value)) throw new Error('Invalid chat file name.');
  const fileName = value.endsWith(JSONL_EXTENSION) ? value : `${value}${JSONL_EXTENSION}`;
  if (!isSafeName(fileName)) throw new Error('Invalid chat file name.');
  return fileName;
}

function getMessageText(message) {
  const value = message?.mes ?? message?.message ?? message?.content ?? message?.text;
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBoolean(value) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return null;
}

function normalizePreviewMessage(message) {
  if (!message || typeof message !== 'object') return null;
  const text = getMessageText(message);
  const isUser = normalizeBoolean(message.is_user);
  const isSystem = normalizeBoolean(message.is_system) === true;
  if (!text || isSystem || isUser === null) return null;
  return {
    name: typeof message.name === 'string' ? message.name : '',
    is_user: isUser,
    text,
    send_date: message.send_date ?? null,
  };
}

function parsePreviewLine(line) {
  if (!line || !line.trim()) return null;
  try {
    return normalizePreviewMessage(JSON.parse(line));
  } catch {
    return null;
  }
}

async function readLastMessages(filePath, limit = 2) {
  const count = Math.max(1, Math.min(10, Number(limit) || 2));
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const stats = await handle.stat();
    let position = stats.size;
    let carry = Buffer.alloc(0);
    const messages = [];

    while (position > 0 && messages.length < count) {
      const size = Math.min(READ_CHUNK_SIZE, position);
      const start = position - size;
      const buffer = Buffer.allocUnsafe(size);
      await handle.read(buffer, 0, size, start);
      position = start;

      const combined = Buffer.concat([buffer, carry]);
      const lines = [];
      let lineEnd = combined.length;
      for (let index = combined.length - 1; index >= 0; index -= 1) {
        if (combined[index] !== 0x0A) continue;
        lines.push(combined.subarray(index + 1, lineEnd));
        lineEnd = index;
      }
      carry = Buffer.from(combined.subarray(0, lineEnd));

      for (const line of lines) {
        if (messages.length >= count) break;
        const message = parsePreviewLine(line.toString('utf8').replace(/\r$/, ''));
        if (message) messages.push(message);
      }
    }

    if (position === 0 && messages.length < count && carry.length) {
      const message = parsePreviewLine(carry.toString('utf8').replace(/\r$/, ''));
      if (message) messages.push(message);
    }

    return messages.reverse();
  } finally {
    await handle.close();
  }
}

async function listJsonlFiles(directory) {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  return entries.filter(entry => entry.isFile() && entry.name.endsWith(JSONL_EXTENSION));
}

async function getCatalog(chatsRoot, charactersRoot) {
  const [chatEntries, characterEntries] = await Promise.all([
    fs.promises.readdir(chatsRoot, { withFileTypes: true }),
    fs.promises.readdir(charactersRoot, { withFileTypes: true }),
  ]);
  const avatars = new Set(
    characterEntries
      .filter(entry => entry.isFile() && entry.name.endsWith(PNG_EXTENSION))
      .map(entry => entry.name),
  );
  const catalog = [];

  for (const entry of chatEntries) {
    if (!entry.isDirectory()) continue;
    const avatar = `${entry.name}${PNG_EXTENSION}`;
    if (!avatars.has(avatar)) continue;
    const directory = resolveUnder(chatsRoot, entry.name);
    const files = await listJsonlFiles(directory);
    if (!files.length) continue;

    let latestMtime = 0;
    let latestFile = '';
    let totalBytes = 0;
    for (const file of files) {
      const stats = await fs.promises.stat(resolveUnder(directory, file.name));
      totalBytes += stats.size;
      if (stats.mtimeMs > latestMtime) {
        latestMtime = stats.mtimeMs;
        latestFile = file.name.slice(0, -JSONL_EXTENSION.length);
      }
    }

    catalog.push({
      avatar,
      chat_count: files.length,
      latest_mtime: latestMtime,
      latest_file: latestFile,
      total_bytes: totalBytes,
    });
  }

  return catalog.sort((a, b) => b.latest_mtime - a.latest_mtime);
}

async function getCharacterChats(chatsRoot, avatarValue) {
  const avatar = normalizeAvatar(avatarValue);
  const characterDirectory = avatar.slice(0, -PNG_EXTENSION.length);
  const directory = resolveUnder(chatsRoot, characterDirectory);
  const files = await listJsonlFiles(directory);
  const chats = [];

  for (const file of files) {
    const stats = await fs.promises.stat(resolveUnder(directory, file.name));
    chats.push({
      file_name: file.name.slice(0, -JSONL_EXTENSION.length),
      file_size: stats.size,
      modified_at: stats.mtimeMs,
    });
  }

  return chats.sort((a, b) => b.modified_at - a.modified_at);
}

async function getPinnedChats(directories, pinnedItems) {
  const items = Array.isArray(pinnedItems) ? pinnedItems : [];
  const results = [];
  for (const item of items) {
    try {
      const fileName = normalizeChatFile(item?.file_name);
      let filePath;
      let avatar = '';
      let group = '';
      if (item?.avatar) {
        avatar = normalizeAvatar(item.avatar);
        filePath = resolveUnder(directories.chats, avatar.slice(0, -PNG_EXTENSION.length), fileName);
      } else if (item?.group && directories.groupChats) {
        group = String(item.group);
        filePath = resolveUnder(directories.groupChats, fileName);
      } else {
        continue;
      }
      const [stats, messages] = await Promise.all([
        fs.promises.stat(filePath),
        readLastMessages(filePath, 1),
      ]);
      const lastMessage = messages[0] ?? null;
      results.push({
        avatar,
        group,
        file_name: fileName,
        file_size: stats.size,
        last_mes: lastMessage?.send_date ?? stats.mtimeMs,
        mes: lastMessage?.text ?? '',
      });
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn('[Chat Archive] Skipped invalid pinned chat:', error.message);
    }
  }
  return results;
}

async function deleteCharacterChat(chatsRoot, avatarValue, chatFileValue) {
  const avatar = normalizeAvatar(avatarValue);
  const fileName = normalizeChatFile(chatFileValue);
  const characterDirectory = avatar.slice(0, -PNG_EXTENSION.length);
  const directory = resolveUnder(chatsRoot, characterDirectory);
  const filePath = resolveUnder(directory, fileName);
  await fs.promises.unlink(filePath);

  const remainingFiles = await listJsonlFiles(directory);
  let removedDirectory = false;
  if (remainingFiles.length === 0) {
    const remainingEntries = await fs.promises.readdir(directory);
    if (remainingEntries.length === 0) {
      await fs.promises.rmdir(directory);
      removedDirectory = true;
    }
  }

  return {
    ok: true,
    remaining_count: remainingFiles.length,
    removed_directory: removedDirectory,
  };
}

function getUserDirectories(request) {
  const directories = request?.user?.directories;
  if (!directories?.chats || !directories?.characters) {
    throw new Error('SillyTavern user directories are unavailable.');
  }
  return directories;
}

async function init(router) {
  router.get('/health', (_request, response) => {
    response.json({ ok: true, version: '0.5.1' });
  });

  router.post('/catalog', async (request, response) => {
    try {
      const directories = getUserDirectories(request);
      const catalog = await getCatalog(directories.chats, directories.characters);
      response.json({ characters: catalog });
    } catch (error) {
      console.error('[Chat Archive] Catalog failed:', error);
      response.status(500).json({ error: 'Unable to read the chat catalog.' });
    }
  });

  router.post('/chats', async (request, response) => {
    try {
      const directories = getUserDirectories(request);
      const chats = await getCharacterChats(directories.chats, request.body?.avatar);
      response.json({ chats });
    } catch (error) {
      const status = error?.code === 'ENOENT' ? 404 : 400;
      response.status(status).json({ error: error.message || 'Unable to read character chats.' });
    }
  });

  router.post('/pinned', async (request, response) => {
    try {
      const directories = getUserDirectories(request);
      const chats = await getPinnedChats(directories, request.body?.pinned);
      response.json({ chats });
    } catch (error) {
      response.status(400).json({ error: error.message || 'Unable to read pinned chats.' });
    }
  });

  router.post('/preview', async (request, response) => {
    try {
      const directories = getUserDirectories(request);
      const fileName = normalizeChatFile(request.body?.file_name);
      let filePath;
      if (request.body?.avatar) {
        const avatar = normalizeAvatar(request.body.avatar);
        const characterDirectory = avatar.slice(0, -PNG_EXTENSION.length);
        filePath = resolveUnder(directories.chats, characterDirectory, fileName);
      } else if (request.body?.group && directories.groupChats) {
        filePath = resolveUnder(directories.groupChats, fileName);
      } else {
        throw new Error('Chat preview requires a character or group.');
      }
      const messages = await readLastMessages(filePath, 2);
      response.json({ messages });
    } catch (error) {
      const status = error?.code === 'ENOENT' ? 404 : 400;
      response.status(status).json({ error: error.message || 'Unable to read chat preview.' });
    }
  });

  router.post('/delete', async (request, response) => {
    try {
      const directories = getUserDirectories(request);
      const result = await deleteCharacterChat(directories.chats, request.body?.avatar, request.body?.file_name);
      response.json(result);
    } catch (error) {
      const status = error?.code === 'ENOENT' ? 404 : 400;
      response.status(status).json({ error: error.message || 'Unable to delete the chat file.' });
    }
  });

  console.log('[Chat Archive] Server plugin loaded.');
}

async function exit() {
  return Promise.resolve();
}

module.exports = {
  init,
  exit,
  info: {
    id: PLUGIN_ID,
    name: 'Chat Archive',
    description: 'Fast character chat archive and tail previews.',
  },
  _test: {
    getCatalog,
    getCharacterChats,
    getPinnedChats,
    deleteCharacterChat,
    normalizeChatFile,
    normalizePreviewMessage,
    readLastMessages,
    resolveUnder,
  },
};
