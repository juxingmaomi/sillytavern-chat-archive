const fs = require('node:fs');
const path = require('node:path');

module.exports = async function ({ page, source, viewport, assert }) {
  const css = fs.readFileSync(path.join(__dirname, '../ui/style.css'), 'utf8');
  await page.setContent(`<!doctype html><html><head><style>
    :root { --mainFontSize: 16px; --SmartThemeBodyColor: #dcdcd2;
      --SmartThemeBlurTintColor: #171717; --SmartThemeBorderColor: #777;
      --SmartThemeQuoteColor: #85b985; --SmartThemeBotMesBlurTintColor: #202020;
      --SmartThemeUserMesBlurTintColor: #292929; --white30a: #ffffff4d; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 12px; font: 16px Arial, sans-serif;
      color: var(--SmartThemeBodyColor); background: var(--SmartThemeBlurTintColor); }
    button, input, select { font: inherit; color: var(--SmartThemeBodyColor); }
    .menu_button, .text_pole { border: 1px solid var(--SmartThemeBorderColor);
      border-radius: 5px; background: var(--SmartThemeBlurTintColor);
      color: var(--SmartThemeBodyColor); padding: 5px; }
    .welcomePanel { max-width: 900px; margin: auto; padding: 8px; }
    #extensions_settings { display: none; }
  </style><style>${css}</style></head><body>
    <div class="welcomePanel"><div class="welcomeRecent">Native recent chats</div></div>
    <div id="extensions_settings"></div>
  </body></html>`);
  await page.evaluate(() => {
    const characters = [
      { avatar: 'Alice.png', name: 'Alice' },
      { avatar: 'Bob.png', name: 'Bob' },
    ];
    const chats = [
      { avatar: 'Alice.png', file_name: 'Evening conversation.jsonl', mes: 'A quiet evening.', modified_at: 1000, file_size: 512 },
      { avatar: 'Bob.png', file_name: 'Weekend plans.jsonl', mes: 'See you tomorrow.', modified_at: 900, file_size: 256 },
    ];
    const storage = new Map([
      ['chatArchiveRecentLogicVersion', 'message-v1'],
      ['chatArchiveSettings', JSON.stringify({ pinnedLimit: 1, characterLimit: 1 })],
      ['pinnedChats', JSON.stringify(Object.fromEntries(chats.map(chat => [
        `char_${chat.avatar}_${chat.file_name}`,
        { avatar: chat.avatar, group: '', file_name: chat.file_name },
      ])))],
    ]);
    window.fixtureStorage = storage;
    window.fixtureRequests = [];
    window.SillyTavern = { getContext: () => ({
      characters,
      accountStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key),
      },
      getRequestHeaders: () => ({}),
      eventSource: { on() {} },
      eventTypes: { MESSAGE_SENT: 'sent', MESSAGE_RECEIVED: 'received' },
    }) };
    window.toastr = { success() {}, info() {}, error(message) { throw new Error(message); } };
    window.fetch = async (url, options = {}) => {
      window.fixtureRequests.push(String(url));
      const body = options.body ? JSON.parse(options.body) : {};
      const route = String(url).split('/').pop();
      let data;
      if (route === 'health') data = { ok: true };
      else if (route === 'catalog') data = { characters: characters.map((char, i) => ({
        ...char, chat_count: 1, total_bytes: 512, latest_mtime: 1000 - i,
        latest_file: chats[i].file_name.replace('.jsonl', ''),
      })) };
      else if (route === 'pinned') data = { chats: body.pinned.map(pin => chats.find(chat => chat.avatar === pin.avatar)) };
      else if (route === 'chats') data = { chats: chats.filter(chat => chat.avatar === body.avatar) };
      else if (route === 'preview') data = { messages: [
        { name: 'You', is_user: true, text: 'How was your day?' },
        { name: 'Alice', is_user: false, text: 'Good. Let us plan something for tomorrow.' },
      ] };
      else throw new Error(`Unexpected request: ${url}`);
      return { ok: true, json: async () => data };
    };
    // Use a real local bitmap without making thumbnail requests in the offline fixture.
    const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      ...descriptor,
      set() { descriptor.set.call(this, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='); },
    });
  });
  await page.addScriptTag({ content: source });
  await page.waitForSelector('.stca-character-row');
  const checks = [];
  const themes = [
    { name: 'native-dark', text: '#dcdcd2', bg: '#171717', inherited: '#dcdcd2', homeBg: '#171717' },
    { name: 'native-light', text: '#242424', bg: '#fafafa', inherited: '#242424', homeBg: '#fafafa' },
    { name: 'custom-dark-stale-light-variable', text: '#242424', bg: '#fafafa', inherited: '#eeeeee', homeBg: '#141414' },
    { name: 'custom-light-stale-dark-variable', text: '#dcdcd2', bg: '#171717', inherited: '#202020', homeBg: '#fafafa' },
  ];
  for (const theme of themes) {
    await page.evaluate(theme => {
      const root = document.documentElement.style;
      root.setProperty('--SmartThemeBodyColor', theme.text);
      root.setProperty('--SmartThemeBlurTintColor', theme.bg);
      root.setProperty('--SmartThemeBotMesBlurTintColor', theme.bg);
      root.setProperty('--SmartThemeUserMesBlurTintColor', theme.bg);
      const panel = document.querySelector('.welcomePanel');
      panel.style.color = theme.inherited;
      panel.style.backgroundColor = theme.homeBg;
    }, theme);
    const colors = await page.evaluate(() => {
      const panel = document.querySelector('.welcomePanel');
      const selectors = [
        '.stca-section-title', '.stca-pinned-row .stca-row-title',
        '.stca-recent-row .stca-row-subtitle', '.stca-character-row .stca-row-title',
        '.stca-character-row .stca-row-subtitle', '.stca-expand-button',
        '.stca-text-button', '.stca-icon-button:not(.active)',
      ];
      return {
        expected: getComputedStyle(panel).color,
        actual: selectors.map(selector => [selector, getComputedStyle(panel.querySelector(selector)).color]),
      };
    });
    for (const [selector, color] of colors.actual) {
      assert.equal(color, colors.expected, `${theme.name}: ${selector} follows welcome text`);
    }
    assert.equal(await page.locator('.stca-icon-button.active').first()
      .evaluate(el => getComputedStyle(el).color), 'rgb(133, 185, 133)', 'Pinned accent is preserved');
    for (const selector of ['.stca-character-row', '.stca-expand-button', '.stca-text-button']) {
      await page.locator(selector).first().hover();
      const ratio = await page.locator(selector).first().evaluate(element => {
        const parse = value => value.match(/[\d.]+/g).map(Number);
        const luminance = rgb => rgb.slice(0, 3).map(c => c / 255)
          .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
          .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
        // Canvas normalizes color-mix() into sRGB for the contrast check.
        const ctx = document.createElement('canvas').getContext('2d');
        const rgb = color => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
        const style = getComputedStyle(element);
        const bg = rgb(style.backgroundColor);
        const base = parse(getComputedStyle(element.closest('.welcomePanel')).backgroundColor);
        const alpha = bg[3] / 255;
        const blended = base.map((c, i) => bg[i] * alpha + c * (1 - alpha));
        const a = luminance(rgb(style.color));
        const b = luminance(blended);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
      assert.ok(ratio >= 4.5, `${theme.name}: ${selector} hover contrast ${ratio}`);
    }
    checks.push(theme.name);
  }
  for (const [list, key] of [['.stca-character-list', 'expandedCharacters'], ['.stca-pinned-list', 'expandedPinned']]) {
    assert.equal(await page.locator(`${list} > *`).count(), 1);
    await page.locator(`[data-stca-expand="${key}"] button`).click();
    await page.waitForFunction(list => document.querySelector(list).children.length === 2, list);
    await page.locator(`[data-stca-expand="${key}"] button`).click();
    await page.waitForFunction(list => document.querySelector(list).children.length === 1, list);
  }
  await page.locator('.stca-pinned-row .stca-text-button').click();
  await page.waitForSelector('.stca-message-bubble');
  assert.equal(await page.locator('.stca-message-bubble').count(), 2);
  await page.locator('.stca-modal [title="关闭"]').click();
  await page.locator('.stca-character-row').click();
  await page.waitForSelector('.stca-chat-row');
  await page.locator('.stca-chat-main').click();
  await page.waitForSelector('.stca-message-bubble');
  const modalColors = await page.locator('.stca-modal').evaluate(modal => ({
    expected: getComputedStyle(modal).color,
    actual: [...modal.querySelectorAll('.stca-chat-main, .stca-message-bubble')]
      .map(element => getComputedStyle(element).color),
  }));
  modalColors.actual.forEach(color => assert.equal(color, modalColors.expected));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow');
  assert.ok(await page.locator('.stca-modal').evaluate(el => el.scrollWidth <= el.clientWidth), 'No modal overflow');
  await page.locator('.stca-modal [title="关闭"]').click();
  assert.equal(await page.locator('.stca-overlay').count(), 0);
  assert.ok(await page.evaluate(() => fixtureRequests.every(url => url.startsWith('/api/plugins/chat-archive/'))));
  return { themes: checks, expandCollapse: true, quickPreview: true, archivePreview: true, viewport };
};
