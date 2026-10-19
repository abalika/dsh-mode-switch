# Changelog

## 0.2.1 — 2026-10-19

- Remove the duplicate DeepSeek header, cloned branding and permanent status toolbar. Put the return action under the website's own logo in a separate layout row.
- Recover the website action after remount/collapse. Keep an upper-right fallback when no suitable logo is visible; show recovery tools only when needed.
- Restrict the website UI adapter to the exact chat origin and three data-free signals. Preserve the guest, existing persistent partition and frozen 0.2.0 package.

## 0.2.0 — 2026-10-19

- Move the mode action beneath the Harness logo. DeepSeek mode has a blue brand header and a full chat surface. Keep both pages mounted during switches.
- Recover from acquisition, navigation and renderer failures; release stale leases and detach guest listeners.
- Keep keyboard focus out of the covered Harness UI and restore its previous focusability on return or unload.
- Make the optional Windows session patch require an explicit installation path, exact supported main-code hashes, a stopped app, verified backups and atomic file replacement.
- Add portable tests, source-release allowlists, English documentation, license notices and CI.
- Keep the 0.1.1 package as a local frozen fallback. The persistent partition name remains unchanged.

## 0.1.1 — local prototype

Two floating mode buttons; optional persistent website partition, verified on the original Windows installations. This prototype is retained locally and is not the public source release.
