# Contributing

Node.js 22 or later is required. Keep changes within the plugin; do not commit desktop binaries or personal DSH configuration.

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm test
npm run check:release
```

Playwright tests mock the desktop bridge and guest. The website adapter also runs in a separate browser page using a synthetic, intercepted chat-origin fixture. Tests cover layout attachment, non-overlap, remount/collapse, origin-scoped UI signals, switching, state preservation, failure recovery, URL handling and disposal. They do not prove Electron integration or website login by themselves. To use an installed Edge for local tests, set `DSH_TEST_BROWSER_CHANNEL=msedge`.

On Windows, set `DSH_TEST_ARCHIVE` to a pristine supported `app.asar` to enable install/rollback integration tests. Tests copy it to a temporary fake installation, never launch its executable and never change the source archive.

For cross-process storage verification, also set `DSH_TEST_ELECTRON` to an existing Electron executable and run `npm run test:storage`. Only a loopback server and synthetic cookie, localStorage and IndexedDB values are used. The isolated test profile is retained in the OS temp folder for inspection. It contains no production login data.

When adding a supported build, independently verify its main-code hash, guest ownership checks, sandbox and permissions, then exercise install, idempotence, update refusal, byte-exact restore and storage restart tests. Do not add a force flag or relax the hash check to accept arbitrary binaries.

`npm run release:source` builds an allowlisted source folder and tar.gz under `release/`. It needs system `tar`; it refuses to overwrite an existing archive. Do not upload the whole development directory: ignored local backup/test folders may contain private data. Review the actual archive contents before publishing.

UI layout uses semantic CSS-module class suffixes from the supported DSH builds. Check the actual desktop at a narrow width, with the sidebar collapsed and expanded, and with light/dark themes after modifying those adapters. Include sanitized UI screenshots when useful.
