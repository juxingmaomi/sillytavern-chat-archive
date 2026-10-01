# Tests

Run the server logic tests with `npm test`.

`theme-browser.cjs` is an offline scenario for the shared SillyTavern browser
test runner. It loads the real frontend JavaScript and CSS with synthetic
characters, chats and mocked account storage/API responses. It checks native
dark/light themes, custom welcome colors with stale theme variables, hover
contrast, live theme switching, limits, expand/collapse, quick preview,
archive preview, and desktop/mobile overflow.

```powershell
node D:\Codex\CodexHome\skills\sillytavern-helper\scripts\test-kit\run-browser.cjs `
  --source ui/index.js --scenario test/theme-browser.cjs `
  --output D:\Codex\UserFiles\work\chat-archive-theme-qa `
  --playwright-module <installed-playwright-module>
```

This fixture does not test the actual SillyTavern event pipeline, persistence,
rename/delete operations or arbitrary third-party CSS. Its thumbnail images
are local placeholder bitmaps and it does not load Font Awesome.
