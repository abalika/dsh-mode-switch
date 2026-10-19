# Architecture

## Client UI

`lib/client.js` is loaded by the host module loader. `lib/index.js` supplies the node half and schedules default login storage setup in the current Windows desktop installation. Mounting requires desktop browser `acquire`/`release`.

The Harness mode action is inserted after the sidebar logo row using semantic CSS-module suffixes from supported builds, not generated hashes. A MutationObserver reattaches it on host remount/collapse, with at most one animation-frame update queued. Missing/collapsed anchors use a compact fallback. DeepSeek mode covers the area below the desktop title bar without adding a header. Loading tools stay hidden unless recovery is needed or an external HTTPS host needs identification.

The guest adapter is serialized through Electron's webview `executeJavaScript` only on the exact `https://chat.deepseek.com` origin, with another origin/top-frame check inside the adapter. It examines public SVG/image geometry at the upper left and inserts a separate row after the logo row, moving following controls down instead of overlaying them. Styles are scoped with Shadow DOM. A MutationObserver, ResizeObserver and viewport listener recover from page remount/collapse; repeated installation is idempotent. No logo is copied or bundled. Layout heuristics must be rechecked after website updates.

Three exact console signals (ready, fallback, back), prefixed by a fresh per-guest random token, communicate UI state. They carry no page data. The host checks the current guest and origin; the back signal can only switch the visible surface, never invoke privileged host operations. The token is visible to page scripts and is not an authentication boundary. Missing/hidden logo, failed adapter execution, external navigation or a crashed guest retain a compact host-owned return action at the upper right. Normal pages hide that fallback when the logo action is ready.

This is an overlay, not a router replacement or separate native window. Both host and guest stay mounted during switching. Viewport/sidebar changes do not recreate the guest.

While the overlay is visible, the supported host's `#root` is temporarily inert so keyboard focus and assistive technology cannot enter the covered Harness UI. The previous inert state is restored on return or disposal, including after a host-root remount. Native window controls remain available.

## Browser ownership

The client acquires `dsh-mode-switch:deepseek`, sets the returned partition/lease on a webview and first loads `about:blank#<lease>`. The first `dom-ready` navigates to `https://chat.deepseek.com/`, after host ownership registration.

Disposal detaches listeners, unsubscribes popup forwarding and releases the lease; late acquisition after unload is released. Acquisition/subscription failures, rejected initial navigation and renderer crashes have retry paths. HTTPS popup requests without embedded credentials navigate in the owned guest; unsafe schemes are ignored. Status identifies external HTTPS destinations by hostname.

## Default persistent partition

From 0.2.2, node-side activation checks only the current executable's sibling archive and the active profile's package registration. It does not scan other installations or inspect account configuration. An already-patched archive needs no helper. An unsupported build is left unchanged. Set `DSH_MODE_SWITCH_PERSIST_LOGIN=0` before activation to opt out. Package lifecycle scripts are not needed.

For a supported unpatched archive, a hidden detached one-shot helper uses that desktop installation's bundled native Node executable. It waits for the backend parent to exit and retries only the typed app-running/patch-busy conditions. The existing writer checks every desktop process of this exact installation twice, with no process exemptions. The helper's executable path determines the allowed archive, preventing guesses about other desktop installations. The active package registration is checked while waiting and again immediately before writes, so removal/replacement cancels pending setup. There is no task service, elevation, download or forced shutdown. Waiting is bounded to seven days; later activations can retry. Storage begins on the next launch, and the old ephemeral session is not copied.

The Windows helper changes the partition assignment only for this exact workspace to `persist:dsh-deepseek-chat-v1`. Other workspaces remain ephemeral. It adds no Node access, guest preload, relaxed sandbox or permission grant.

The CLI requires an explicit real `app.asar`, validates packed main bounds/integrity and a fixed allowlist of original main-code hashes (or their exact normalized patch). It preserves unrelated packed entries/data, appends changed main source, and updates header offsets/integrity.

Before writing it checks the Windows executable is stopped and takes an exclusive lock. It verifies an original backup and records a recovery manifest before atomic archive replacement. Restore checks backup, current full-archive hash and reproduced patch, refusing updated targets. Sudden power loss, concurrent updaters and unusual filesystems still require ordinary backups; this is not an installer service. Uninstall leaves an already-applied patch and browser data in place; explicit rollback is separate. Keep the opt-out environment variable when rolling back, otherwise activation schedules setup again.

Browser storage is scoped by Electron user data, not the DSH workspace/profile. A persistent partition is not a credential vault or a security boundary against trusted host code/local programs. Website login expiry remains under the website's control. Plugin code never reads passwords, cookies or conversations.

## Upstream references

- [Desktop/browser model](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md)
- [Sidebar browser](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/client/ui-sidebar-browser)
- [CLI plugin installation](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md)
