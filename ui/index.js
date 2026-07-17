(() => {
  'use strict';

  const MODULE_NAME = 'chat_archive';
  const API_ROOT = '/api/plugins/chat-archive';
  const PINNED_STORAGE_KEY = 'pinnedChats';
  const RECENT_OPENED_STORAGE_KEY = 'chatArchiveLastOpened';
  const RECENT_LOGIC_VERSION_KEY = 'chatArchiveRecentLogicVersion';
  const ENABLED_STORAGE_KEY = 'chatArchiveEnabled';
  const SETTINGS_STORAGE_KEY = 'chatArchiveSettings';
  const DEFAULT_SETTINGS = Object.freeze({
    showPinned: true,
    showRecent: true,
    showArchive: true,
    characterSort: 'recent',
    chatSort: 'recent',
    deleteEnabled: true,
    requireDeleteName: false,
  });
  let scriptModulePromise = null;
  const state = {
    context: null,
    catalog: null,
    observer: null,
    modal: null,
    selectedAvatar: '',
    openingChat: false,
  };

  function getContext() {
    return globalThis.SillyTavern?.getContext?.() ?? null;
  }

  function isEnabled() {
    return state.context?.accountStorage?.getItem(ENABLED_STORAGE_KEY) !== 'false';
  }

  function getSettings() {
    const raw = state.context?.accountStorage?.getItem(SETTINGS_STORAGE_KEY);
    try {
      const parsed = raw ? JSON.parse(raw) : {};
      return { ...DEFAULT_SETTINGS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function updateSettings(patch) {
    const settings = { ...getSettings(), ...patch };
    state.context.accountStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    state.catalog = null;
    restoreNativeWelcome();
    if (isEnabled()) scanWelcomePanels();
  }

  function getScriptModule() {
    scriptModulePromise ??= import('/script.js');
    return scriptModulePromise;
  }

  async function requestApi(route, body = null) {
    const context = state.context ?? getContext();
    if (!context) throw new Error('SillyTavern context is unavailable.');
    const options = {
      method: body === null ? 'GET' : 'POST',
      headers: context.getRequestHeaders(),
      cache: 'no-cache',
    };
    if (body !== null) options.body = JSON.stringify(body);
    const response = await fetch(`${API_ROOT}/${route}`, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function getPinnedState() {
    const raw = state.context?.accountStorage?.getItem(PINNED_STORAGE_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function getPinnedKey(item) {
    const group = item.group ? `group_${item.group}` : '';
    const avatar = item.avatar ? `char_${item.avatar}` : '';
    const fileName = item.file_name.endsWith('.jsonl') ? item.file_name : `${item.file_name}.jsonl`;
    return `${group}${avatar}_${fileName}`;
  }

  function isPinned(item) {
    return Object.hasOwn(getPinnedState(), getPinnedKey(item));
  }

  function setPinned(item, pinned) {
    const pinnedState = getPinnedState();
    const key = getPinnedKey(item);
    if (pinned) {
      pinnedState[key] = {
        group: item.group || '',
        avatar: item.avatar || '',
        file_name: item.file_name.endsWith('.jsonl') ? item.file_name : `${item.file_name}.jsonl`,
      };
    } else {
      delete pinnedState[key];
    }
    state.context.accountStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(pinnedState));
    return true;
  }

  function getRecentOpened() {
    const raw = state.context?.accountStorage?.getItem(RECENT_OPENED_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && parsed.file_name ? parsed : null;
    } catch {
      return null;
    }
  }

  function setRecentOpened(item) {
    if (!item?.file_name || (!item.avatar && !item.group)) return;
    state.context.accountStorage.setItem(RECENT_OPENED_STORAGE_KEY, JSON.stringify({
      avatar: item.avatar || '',
      group: item.group || '',
      file_name: item.file_name.endsWith('.jsonl') ? item.file_name : `${item.file_name}.jsonl`,
      opened_at: Date.now(),
    }));
  }

  function removeChatReferences(item) {
    const pinnedState = getPinnedState();
    const key = getPinnedKey(item);
    if (Object.hasOwn(pinnedState, key)) {
      delete pinnedState[key];
      state.context.accountStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(pinnedState));
    }
    const recent = getRecentOpened();
    if (recent && getPinnedKey(recent) === key) {
      state.context.accountStorage.removeItem(RECENT_OPENED_STORAGE_KEY);
    }
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    const units = ['KB', 'MB', 'GB'];
    let size = value / 1024;
    let unit = units[0];
    for (let index = 1; index < units.length && size >= 1024; index += 1) {
      size /= 1024;
      unit = units[index];
    }
    return `${size >= 100 ? size.toFixed(0) : size.toFixed(1)} ${unit}`;
  }

  function formatDate(value) {
    const date = new Date(Number(value) || value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  function createIconButton(icon, title, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stca-icon-button menu_button';
    button.title = title;
    button.setAttribute('aria-label', title);
    const iconElement = document.createElement('i');
    iconElement.className = `fa-solid ${icon}`;
    button.append(iconElement);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void action(button);
    });
    return button;
  }

  function getCharacter(avatar) {
    return state.context.characters.find(character => character.avatar === avatar) ?? null;
  }

  function getGroup(groupId) {
    return state.context.groups.find(group => String(group.id) === String(groupId)) ?? null;
  }

  function getDisplayName(item) {
    if (item.avatar) return getCharacter(item.avatar)?.name || item.avatar.replace(/\.png$/i, '');
    if (item.group) return getGroup(item.group)?.name || '群聊';
    return '聊天';
  }

  function getAvatarUrl(avatar) {
    if (!avatar) return 'img/five.png';
    try {
      return state.context.getThumbnailUrl('avatar', avatar);
    } catch {
      return `characters/${encodeURIComponent(avatar)}`;
    }
  }

  async function openChat(item) {
    if (state.openingChat) {
      toastr.info('正在打开聊天，请稍候。');
      return;
    }

    state.openingChat = true;
    document.documentElement.classList.add('stca-opening-chat');
    const fileName = item.file_name.replace(/\.jsonl$/i, '');

    try {
      if (item.avatar) {
        const initialContext = getContext();
        const characterId = initialContext?.characters?.findIndex(character => character.avatar === item.avatar) ?? -1;
        if (characterId < 0) throw new Error('没有找到这个角色卡。');

        const { getCurrentChatId, saveSettingsDebounced, setActiveCharacter } = await getScriptModule();
        await initialContext.selectCharacterById(characterId);

        const selectedContext = getContext();
        const selectedCharacter = selectedContext?.characters?.[selectedContext.characterId];
        if (String(selectedContext?.characterId) !== String(characterId) || selectedCharacter?.avatar !== item.avatar) {
          throw new Error('酒馆仍在保存聊天，未能切换到目标角色。请稍后重试。');
        }

        setActiveCharacter(item.avatar);
        saveSettingsDebounced();
        if (getCurrentChatId() !== fileName) {
          await selectedContext.openCharacterChat(fileName);
        }

        const openedContext = getContext();
        const openedCharacter = openedContext?.characters?.[openedContext.characterId];
        if (openedCharacter?.avatar !== item.avatar || getCurrentChatId() !== fileName) {
          throw new Error('聊天未能正确打开，已为你中止操作。');
        }
      } else if (item.group) {
        const context = getContext();
        await context.openGroupChat(item.group, fileName);
        const { getCurrentChatId } = await getScriptModule();
        if (getCurrentChatId() !== fileName) {
          throw new Error('群聊未能正确打开，已为你中止操作。');
        }
      } else {
        throw new Error('聊天缺少角色或群组信息。');
      }

      state.context = getContext();
      closeModal();
    } catch (error) {
      console.error(`[${MODULE_NAME}] Failed to open chat safely`, error);
      toastr.error(error.message || '打开聊天失败。');
    } finally {
      state.openingChat = false;
      document.documentElement.classList.remove('stca-opening-chat');
    }
  }

  function createEmpty(text) {
    const element = document.createElement('div');
    element.className = 'stca-empty';
    element.textContent = text;
    return element;
  }

  async function fetchPinnedChats() {
    const pinnedState = getPinnedState();
    const pinned = Object.values(pinnedState);
    if (!pinned.length) return [];
    const data = await requestApi('pinned', { pinned });
    const chats = Array.isArray(data.chats) ? data.chats : [];
    const cleanedState = Object.fromEntries(chats.map(chat => [getPinnedKey(chat), {
      group: chat.group || '',
      avatar: chat.avatar || '',
      file_name: chat.file_name.endsWith('.jsonl') ? chat.file_name : `${chat.file_name}.jsonl`,
    }]));
    if (JSON.stringify(cleanedState) !== JSON.stringify(pinnedState)) {
      state.context.accountStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(cleanedState));
    }
    return chats;
  }

  async function fetchRecentOpenedChat() {
    const recent = getRecentOpened();
    if (!recent) return null;
    const data = await requestApi('pinned', { pinned: [recent] });
    return Array.isArray(data.chats) && data.chats.length ? data.chats[0] : null;
  }

  function createPinnedRow(chat) {
    const row = document.createElement('div');
    row.className = 'stca-pinned-row';
    row.tabIndex = 0;

    const image = document.createElement('img');
    image.className = 'stca-avatar';
    image.src = getAvatarUrl(chat.avatar);
    image.alt = getDisplayName(chat);

    const content = document.createElement('div');
    content.className = 'stca-row-content';
    const title = document.createElement('div');
    title.className = 'stca-row-title';
    title.textContent = `${getDisplayName(chat)} - ${chat.file_name.replace(/\.jsonl$/i, '')}`;
    const preview = document.createElement('div');
    preview.className = 'stca-row-subtitle';
    preview.textContent = chat.mes || '暂无预览';
    content.append(title, preview);

    const actions = document.createElement('div');
    actions.className = 'stca-row-actions';
    const unpinButton = createIconButton('fa-thumbtack', '取消置顶', async () => {
      if (setPinned(chat, false)) await refreshHomeSections();
    });
    unpinButton.classList.add('active');
    const openButton = createIconButton('fa-arrow-right', '打开聊天', () => openChat(chat));
    actions.append(unpinButton, openButton);
    row.append(image, content, actions);
    row.addEventListener('click', () => void openChat(chat));
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter') void openChat(chat);
    });
    return row;
  }

  function createRecentRow(chat) {
    const row = createPinnedRow(chat);
    row.classList.remove('stca-pinned-row');
    row.classList.add('stca-recent-row');
    const unpinButton = row.querySelector('.stca-icon-button');
    if (unpinButton) unpinButton.remove();
    return row;
  }

  function createCharacterRow(entry) {
    const character = getCharacter(entry.avatar);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'stca-character-row';

    const image = document.createElement('img');
    image.className = 'stca-avatar';
    image.src = getAvatarUrl(entry.avatar);
    image.alt = character?.name || entry.avatar;

    const content = document.createElement('span');
    content.className = 'stca-row-content';
    const title = document.createElement('span');
    title.className = 'stca-row-title';
    title.textContent = character?.name || entry.avatar.replace(/\.png$/i, '');
    const subtitle = document.createElement('span');
    subtitle.className = 'stca-row-subtitle';
    subtitle.textContent = `${entry.chat_count} 个聊天 · 最近 ${formatDate(entry.latest_mtime)}`;
    content.append(title, subtitle);

    const total = document.createElement('span');
    total.className = 'stca-character-size';
    total.textContent = formatBytes(entry.total_bytes);
    const arrow = document.createElement('i');
    arrow.className = 'fa-solid fa-chevron-right';
    row.append(image, content, total, arrow);
    row.addEventListener('click', () => void openArchive(entry.avatar));
    return row;
  }

  function sortCharacters(entries) {
    const mode = getSettings().characterSort;
    return [...entries].sort((a, b) => {
      if (mode === 'name') return getDisplayName(a).localeCompare(getDisplayName(b), 'zh-CN');
      if (mode === 'count') return b.chat_count - a.chat_count;
      if (mode === 'size') return b.total_bytes - a.total_bytes;
      return b.latest_mtime - a.latest_mtime;
    });
  }

  function sortChats(chats) {
    const mode = getSettings().chatSort;
    return [...chats].sort((a, b) => {
      if (mode === 'name') return a.file_name.localeCompare(b.file_name, 'zh-CN');
      if (mode === 'oldest') return a.modified_at - b.modified_at;
      if (mode === 'size') return b.file_size - a.file_size;
      return b.modified_at - a.modified_at;
    });
  }

  async function refreshHomeSections(panel = document.querySelector('.welcomePanel.stca-enhanced')) {
    if (!panel) return;
    const pinnedList = panel.querySelector('.stca-pinned-list');
    const recentList = panel.querySelector('.stca-recent-list');
    const characterList = panel.querySelector('.stca-character-list');
    if (!pinnedList && !recentList && !characterList) return;
    pinnedList?.replaceChildren(createEmpty('正在读取置顶聊天...'));
    recentList?.replaceChildren(createEmpty('正在读取最近聊天...'));
    characterList?.replaceChildren(createEmpty('正在整理角色聊天...'));
    try {
      const [pinnedChats, recentChat, catalogData] = await Promise.all([
        pinnedList ? fetchPinnedChats() : Promise.resolve([]),
        recentList ? fetchRecentOpenedChat() : Promise.resolve(null),
        characterList ? (state.catalog ? Promise.resolve({ characters: state.catalog }) : requestApi('catalog', {})) : Promise.resolve({ characters: [] }),
      ]);
      if (characterList) state.catalog = catalogData.characters || [];
      pinnedList?.replaceChildren(...(pinnedChats.length ? pinnedChats.map(createPinnedRow) : [createEmpty('还没有置顶聊天')]));
      recentList?.replaceChildren(...(recentChat ? [createRecentRow(recentChat)] : [createEmpty('还没有最近聊天')]));
      characterList?.replaceChildren(...(state.catalog.length ? sortCharacters(state.catalog).map(createCharacterRow) : [createEmpty('没有找到角色聊天文件')]));
    } catch (error) {
      console.error(`[${MODULE_NAME}] Failed to load archive home`, error);
      characterList.replaceChildren(createEmpty(`读取失败：${error.message}`));
    }
  }

  function buildHomeSections(panel) {
    const settings = getSettings();
    const container = document.createElement('section');
    container.className = 'stca-home';

    const pinnedSection = document.createElement('section');
    pinnedSection.className = 'stca-section';
    const pinnedTitle = document.createElement('div');
    pinnedTitle.className = 'stca-section-title';
    pinnedTitle.innerHTML = '<span><i class="fa-solid fa-thumbtack"></i> 置顶聊天</span>';
    const pinnedList = document.createElement('div');
    pinnedList.className = 'stca-pinned-list';
    pinnedSection.append(pinnedTitle, pinnedList);

    const archiveSection = document.createElement('section');
    archiveSection.className = 'stca-section';
    const archiveTitle = document.createElement('div');
    archiveTitle.className = 'stca-section-title';
    const titleText = document.createElement('span');
    titleText.innerHTML = '<i class="fa-solid fa-box-archive"></i> 角色归档';
    const refreshButton = createIconButton('fa-rotate-right', '刷新归档', async () => {
      state.catalog = null;
      await refreshHomeSections(panel);
    });
    archiveTitle.append(titleText, refreshButton);
    const characterList = document.createElement('div');
    characterList.className = 'stca-character-list';
    archiveSection.append(archiveTitle, characterList);
    const recentSection = document.createElement('section');
    recentSection.className = 'stca-section';
    const recentTitle = document.createElement('div');
    recentTitle.className = 'stca-section-title';
    recentTitle.innerHTML = '<span><i class="fa-solid fa-clock-rotate-left"></i> 最近聊天</span>';
    const recentList = document.createElement('div');
    recentList.className = 'stca-recent-list';
    recentSection.append(recentTitle, recentList);

    if (settings.showPinned) container.append(pinnedSection);
    if (settings.showRecent) container.append(recentSection);
    if (settings.showArchive) container.append(archiveSection);
    panel.append(container);
    void refreshHomeSections(panel);
  }

  async function enhanceWelcomePanel(panel) {
    if (!isEnabled()) return;
    if (panel.dataset.stcaState) return;
    panel.dataset.stcaState = 'checking';
    try {
      await requestApi('health');
      panel.dataset.stcaState = 'ready';
      panel.classList.add('stca-enhanced');
      panel.querySelector('.welcomeRecent')?.classList.add('stca-core-hidden');
      panel.querySelector('.recentChatsTitle')?.classList.add('stca-core-hidden');
      panel.querySelector('.recentChatsSettings')?.classList.add('stca-core-hidden');
      panel.querySelector('.showRecentChats')?.classList.add('stca-core-hidden');
      panel.querySelector('.hideRecentChats')?.classList.add('stca-core-hidden');
      buildHomeSections(panel);
    } catch (error) {
      panel.dataset.stcaState = 'missing-server';
      console.warn(`[${MODULE_NAME}] Server plugin is unavailable`, error);
      const warning = document.createElement('div');
      warning.className = 'stca-server-warning';
      warning.textContent = '酒馆首页文件分类：服务器插件未启用，已保留酒馆原首页。';
      panel.append(warning);
    }
  }

  function closeModal() {
    state.modal?.remove();
    state.modal = null;
    state.selectedAvatar = '';
  }

  function confirmDelete(fileName) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'stca-confirm-overlay';
      const dialog = document.createElement('div');
      dialog.className = 'stca-confirm-dialog';
      const title = document.createElement('strong');
      title.textContent = '删除聊天文件？';
      const text = document.createElement('p');
      text.textContent = `将永久删除“${fileName}”。如果这是该角色最后一个聊天，空归档文件夹也会消失。角色卡不会被删除。`;
      const requireName = getSettings().requireDeleteName;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'text_pole stca-delete-confirm-input';
      input.placeholder = '输入完整聊天文件名以确认';
      const actions = document.createElement('div');
      actions.className = 'stca-confirm-actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'menu_button';
      cancel.textContent = '取消';
      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.className = 'menu_button stca-danger-button';
      confirm.textContent = '删除';
      confirm.disabled = requireName;
      if (requireName) {
        input.addEventListener('input', () => {
          confirm.disabled = input.value !== fileName;
        });
      }
      const finish = value => {
        overlay.remove();
        resolve(value);
      };
      cancel.addEventListener('click', () => finish(false));
      confirm.addEventListener('click', () => finish(true));
      overlay.addEventListener('click', event => {
        if (event.target === overlay) finish(false);
      });
      actions.append(cancel, confirm);
      dialog.append(title, text);
      if (requireName) dialog.append(input);
      dialog.append(actions);
      overlay.append(dialog);
      document.body.append(overlay);
      (requireName ? input : confirm).focus();
    });
  }

  function createModal(characterName) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'stca-overlay';
    const modal = document.createElement('div');
    modal.className = 'stca-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const header = document.createElement('div');
    header.className = 'stca-modal-header';
    const heading = document.createElement('div');
    heading.className = 'stca-modal-title';
    heading.textContent = `${characterName} · 全部聊天`;
    const close = createIconButton('fa-xmark', '关闭', closeModal);
    header.append(heading, close);

    const toolbar = document.createElement('div');
    toolbar.className = 'stca-toolbar';
    const searchIcon = document.createElement('i');
    searchIcon.className = 'fa-solid fa-magnifying-glass';
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'text_pole stca-search';
    search.placeholder = '搜索聊天文件名';
    toolbar.append(searchIcon, search);

    const body = document.createElement('div');
    body.className = 'stca-modal-body';
    const list = document.createElement('div');
    list.className = 'stca-chat-list';
    const preview = document.createElement('div');
    preview.className = 'stca-preview-pane';
    preview.append(createEmpty('选择一个聊天文件查看最后两条消息'));
    body.append(list, preview);
    modal.append(header, toolbar, body);
    overlay.append(modal);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeModal();
    });
    document.body.append(overlay);
    state.modal = overlay;
    return { overlay, list, preview, search };
  }

  function createChatRow(chat, avatar, previewPane) {
    const row = document.createElement('div');
    row.className = 'stca-chat-row';
    row.dataset.search = chat.file_name.toLowerCase();

    const content = document.createElement('button');
    content.type = 'button';
    content.className = 'stca-chat-main';
    const title = document.createElement('span');
    title.className = 'stca-row-title';
    title.textContent = chat.file_name;
    const subtitle = document.createElement('span');
    subtitle.className = 'stca-row-subtitle';
    subtitle.textContent = `${formatDate(chat.modified_at)} · ${formatBytes(chat.file_size)}`;
    content.append(title, subtitle);
    content.addEventListener('click', () => void showPreview(avatar, chat.file_name, previewPane, row));

    const actions = document.createElement('div');
    actions.className = 'stca-row-actions';
    const pinItem = { avatar, file_name: `${chat.file_name}.jsonl` };
    const pinButton = createIconButton('fa-thumbtack', isPinned(pinItem) ? '取消置顶' : '置顶聊天', async button => {
      const next = !isPinned(pinItem);
      if (!setPinned(pinItem, next)) return;
      button.classList.toggle('active', next);
      button.title = next ? '取消置顶' : '置顶聊天';
      await refreshHomeSections();
    });
    pinButton.classList.toggle('active', isPinned(pinItem));
    const previewButton = createIconButton('fa-eye', '预览最后两条消息', () => showPreview(avatar, chat.file_name, previewPane, row));
    const openButton = createIconButton('fa-arrow-right', '打开聊天', () => openChat({ avatar, file_name: chat.file_name }));
    const deleteButton = createIconButton('fa-trash', '删除聊天文件', async () => {
      if (!await confirmDelete(chat.file_name)) return;
      deleteButton.disabled = true;
      try {
        const result = await requestApi('delete', { avatar, file_name: chat.file_name });
        removeChatReferences(pinItem);
        row.remove();
        previewPane.replaceChildren(createEmpty('聊天文件已删除'));
        state.catalog = null;
        await refreshHomeSections();
        if (result.remaining_count === 0) {
          toastr.success('聊天已删除，这个角色的空归档文件夹已消失。');
          closeModal();
        } else {
          toastr.success('聊天文件已删除。');
        }
      } catch (error) {
        deleteButton.disabled = false;
        toastr.error(`删除失败：${error.message}`);
      }
    });
    deleteButton.classList.add('stca-delete-button');
    actions.append(pinButton, previewButton, openButton);
    if (getSettings().deleteEnabled) actions.append(deleteButton);
    row.append(content, actions);
    return row;
  }

  async function showPreview(avatar, fileName, pane, selectedRow) {
    pane.replaceChildren(createEmpty('正在读取最后两条消息...'));
    pane.closest('.stca-modal-body')?.querySelectorAll('.stca-chat-row.selected').forEach(row => row.classList.remove('selected'));
    selectedRow.classList.add('selected');
    try {
      const data = await requestApi('preview', { avatar, file_name: fileName });
      const header = document.createElement('div');
      header.className = 'stca-preview-header';
      const title = document.createElement('strong');
      title.textContent = fileName;
      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'menu_button menu_button_icon';
      openButton.innerHTML = '<i class="fa-solid fa-arrow-right"></i><span>打开聊天</span>';
      openButton.addEventListener('click', () => void openChat({ avatar, file_name: fileName }));
      header.append(title, openButton);

      const messages = document.createElement('div');
      messages.className = 'stca-preview-messages';
      for (const message of data.messages || []) {
        const row = document.createElement('div');
        row.className = `stca-message-row ${message.is_user ? 'is-user' : 'is-character'}`;
        const name = document.createElement('div');
        name.className = 'stca-message-name';
        name.textContent = message.name || (message.is_user ? '用户' : getDisplayName({ avatar }));
        const bubble = document.createElement('div');
        bubble.className = 'stca-message-bubble';
        bubble.textContent = message.text;
        row.append(name, bubble);
        messages.append(row);
      }
      if (!messages.childElementCount) messages.append(createEmpty('没有找到可预览的对话消息'));
      pane.replaceChildren(header, messages);
      pane.scrollTop = pane.scrollHeight;
    } catch (error) {
      pane.replaceChildren(createEmpty(`预览失败：${error.message}`));
    }
  }

  async function openArchive(avatar) {
    const character = getCharacter(avatar);
    const ui = createModal(character?.name || avatar.replace(/\.png$/i, ''));
    state.selectedAvatar = avatar;
    ui.list.append(createEmpty('正在读取聊天文件...'));
    try {
      const data = await requestApi('chats', { avatar });
      const rows = sortChats(data.chats || []).map(chat => createChatRow(chat, avatar, ui.preview));
      ui.list.replaceChildren(...(rows.length ? rows : [createEmpty('这个角色还没有聊天文件')]));
      ui.search.addEventListener('input', () => {
        const query = ui.search.value.trim().toLowerCase();
        rows.forEach(row => {
          row.hidden = query && !row.dataset.search.includes(query);
        });
      });
      ui.search.focus();
    } catch (error) {
      ui.list.replaceChildren(createEmpty(`读取失败：${error.message}`));
    }
  }

  function scanWelcomePanels() {
    buildSettingsPanel();
    if (!isEnabled()) return;
    document.querySelectorAll('.welcomePanel').forEach(panel => void enhanceWelcomePanel(panel));
  }

  function restoreNativeWelcome() {
    closeModal();
    document.querySelectorAll('.welcomePanel').forEach(panel => {
      panel.querySelectorAll('.stca-home, .stca-server-warning').forEach(element => element.remove());
      panel.querySelectorAll('.stca-core-hidden').forEach(element => element.classList.remove('stca-core-hidden'));
      panel.classList.remove('stca-enhanced');
      delete panel.dataset.stcaState;
    });
  }

  function setEnabled(enabled) {
    state.context.accountStorage.setItem(ENABLED_STORAGE_KEY, String(enabled));
    if (enabled) {
      state.catalog = null;
      scanWelcomePanels();
      toastr.success('酒馆首页文件分类已启用。');
    } else {
      restoreNativeWelcome();
      toastr.info('已恢复酒馆原生首页。');
    }
  }

  function buildSettingsPanel() {
    if (document.getElementById('stca-settings')) return;
    const settingsRoot = document.getElementById('extensions_settings');
    if (!settingsRoot) return;

    const container = document.createElement('div');
    container.id = 'stca-settings';
    container.className = 'extension_container';
    const drawer = document.createElement('div');
    drawer.className = 'inline-drawer';
    const header = document.createElement('div');
    header.className = 'inline-drawer-toggle inline-drawer-header';
    const title = document.createElement('b');
    title.textContent = '酒馆首页文件分类';
    const arrow = document.createElement('i');
    arrow.className = 'inline-drawer-icon fa-solid fa-circle-chevron-down down';
    header.append(title, arrow);
    const content = document.createElement('div');
    content.className = 'inline-drawer-content';
    const settings = getSettings();
    const addCheckbox = (label, checked, onChange, disabled = false) => {
      const row = document.createElement('label');
      row.className = 'stca-setting-row';
      const text = document.createElement('span');
      text.textContent = label;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = checked;
      input.disabled = disabled;
      input.addEventListener('change', () => onChange(input.checked));
      row.append(text, input);
      content.append(row);
      return input;
    };
    const addSelect = (label, value, options, onChange) => {
      const row = document.createElement('label');
      row.className = 'stca-setting-row';
      const text = document.createElement('span');
      text.textContent = label;
      const select = document.createElement('select');
      select.className = 'text_pole';
      for (const [optionValue, optionText] of options) {
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = optionText;
        option.selected = optionValue === String(value);
        select.append(option);
      }
      select.addEventListener('change', () => onChange(select.value));
      row.append(text, select);
      content.append(row);
    };

    addCheckbox('启用酒馆首页文件分类', isEnabled(), setEnabled);
    const divider = () => {
      const line = document.createElement('hr');
      line.className = 'stca-settings-divider';
      content.append(line);
    };
    divider();
    addCheckbox('显示置顶聊天', settings.showPinned, value => updateSettings({ showPinned: value }));
    addCheckbox('显示最近聊天', settings.showRecent, value => updateSettings({ showRecent: value }));
    addCheckbox('显示角色归档', settings.showArchive, value => updateSettings({ showArchive: value }));
    divider();
    addSelect('角色排序', settings.characterSort, [
      ['recent', '最近聊天'],
      ['name', '角色名称'],
      ['count', '聊天数量'],
      ['size', '占用空间'],
    ], value => updateSettings({ characterSort: value }));
    addSelect('聊天文件排序', settings.chatSort, [
      ['recent', '最新修改'],
      ['oldest', '最早修改'],
      ['name', '文件名称'],
      ['size', '文件大小'],
    ], value => updateSettings({ chatSort: value }));
    divider();
    const deleteNameToggle = addCheckbox('删除时需输入文件名', settings.requireDeleteName, value => updateSettings({ requireDeleteName: value }), !settings.deleteEnabled);
    addCheckbox('显示删除按钮', settings.deleteEnabled, value => {
      deleteNameToggle.disabled = !value;
      updateSettings({ deleteEnabled: value });
    });
    drawer.append(header, content);
    container.append(drawer);
    settingsRoot.append(container);
  }

  function initialize() {
    state.context = getContext();
    if (!state.context) {
      setTimeout(initialize, 250);
      return;
    }
    if (state.context.accountStorage.getItem(RECENT_LOGIC_VERSION_KEY) !== 'message-v1') {
      state.context.accountStorage.removeItem(RECENT_OPENED_STORAGE_KEY);
      state.context.accountStorage.setItem(RECENT_LOGIC_VERSION_KEY, 'message-v1');
    }
    buildSettingsPanel();
    scanWelcomePanels();
    state.observer = new MutationObserver(scanWelcomePanels);
    state.observer.observe(document.body, { childList: true, subtree: true });
    const rememberActiveChat = (_messageId, messageType) => {
      if (!isEnabled()) return;
      if (messageType === 'first_message') return;
      const context = getContext();
      const currentId = String(context?.chatId || '').replace(/\.jsonl$/i, '');
      if (!context || !currentId) return;
      const character = context.characters[context.characterId];
      const item = context.groupId
        ? { group: context.groupId, file_name: currentId }
        : character?.avatar
          ? { avatar: character.avatar, file_name: currentId }
          : null;
      if (!item) return;
      setRecentOpened(item);
      void refreshHomeSections();
    };
    state.context.eventSource?.on?.(state.context.eventTypes.MESSAGE_SENT, rememberActiveChat);
    state.context.eventSource?.on?.(state.context.eventTypes.MESSAGE_RECEIVED, rememberActiveChat);
    console.log(`[${MODULE_NAME}] UI extension loaded.`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
