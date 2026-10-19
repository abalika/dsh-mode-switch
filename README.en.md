# DSH Mode Switch

[中文](README.md) · [Download](https://github.com/abalika/dsh-mode-switch/releases) · [Installation and rollback](docs/INSTALL.md) · [Architecture](docs/ARCHITECTURE.md)

An independent community plugin for DeepSeek Harness Desktop. A single action beneath each surface's own logo switches between Harness and the real DeepSeek Chat website. There is no duplicate chat header. Switching back preserves the mounted Harness UI and draft. This project is not affiliated with or endorsed by DeepSeek. Button labels are currently Chinese.

Supported desktop builds: **0.2.0-rc.2 and 0.2.1-rc.2**. Tooling requires **Node.js 22+**. The plugin uses the desktop's owned browser bridge and does not appear in web-only hosts without it.

## Install

Download/clone the source, then run `npm pack --ignore-scripts`. Initialize and fully quit DSH Desktop, then add `dsh-mode-switch-0.2.1.tgz` to its `desktop` profile using the CLI bundled with that installation. Restart. See [Windows commands and rollback](docs/INSTALL.md). Development dependencies are not needed. `private: true` prevents accidental npm publication; local tarballs and GitHub distribution still work.

## Remembering login

The plugin keeps the website alive when switching modes. Cross-restart storage requires explicitly applying the optional Windows tool in `desktop/persistent-session.cjs`. It requires an explicit archive path, exact supported main-code hashes and a stopped app. It keeps a verified original backup beside the archive and refuses restore over an update.

The guest uses `persist:dsh-deepseek-chat-v1`; unrelated workspaces stay ephemeral. Cookies, localStorage and IndexedDB remain in Electron's local user data. The plugin does not read/transmit credentials or chat history. Sign-in may be needed once after changing partitions, and again after expiry, logout or clearing storage. App upgrades may overwrite the patch.

## Limits

There is no direct public slot beneath the logo. The Harness adapter targets supported builds' semantic CSS-module suffixes. On `https://chat.deepseek.com` only, a sandboxed UI adapter inserts an action into public logo layout without reading account, input or conversation contents. A compact fallback appears when no suitable logo is visible: top left in Harness, top right on the website, including sign-in pages without a sidebar. Host or website releases may require adaptation. Recovery tools appear only when needed. Downloads, device permissions and some popups remain limited by the host. This is an embedded website, not a model API integration.

## Develop

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm test
npm run check:release
npm run release:source
```

[Contributing](CONTRIBUTING.md) covers optional Windows archive and cross-process Electron tests. The release builder copies only allowlisted source. Never upload the entire development folder, backups, profiles or private screenshots.

Code is [MIT licensed](LICENSE). Read [third-party notices](THIRD_PARTY_NOTICES.md) and [security notes](SECURITY.md). Trademarks remain with their owners.
