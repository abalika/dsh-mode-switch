# Security

This is an unofficial community plugin. It opens the real `https://chat.deepseek.com/` inside DSH's owned desktop guest. It does not provide an account proxy or an API service. Website sign-in is performed by the user.

The plugin does not read, export or upload website cookies, tokens or chat history. Browser storage belongs to Electron's user-data directory. A persistent partition is a storage choice, not encryption or an additional security boundary against other trusted host plugins or local software. Users sharing the same OS desktop-app profile also share this website session.

The website UI adapter runs only on the exact chat origin, inspects public logo geometry and inserts one scoped return control. It does not inspect input values or account/conversation text. Its three fixed console signals carry no page data and can only change UI visibility or return to Harness. The per-guest token is not a security boundary against website code. Node integration, guest preloads and permission grants are not added.

The optional patch modifies only the browser partition selection in exact supported Windows builds. It preserves the host's sandbox, context isolation and lease ownership checks. Unknown main code is rejected. This tool cannot promise compatibility with modified binaries, signed installers, enterprise policy or future desktop updates.

Do not attach cookies, tokens, profile folders, ASAR backups, full app logs or screenshots of private conversations to public issues. Use GitHub's private vulnerability reporting if enabled for the repository. If it is unavailable, ask the maintainer for a private reporting channel without posting exploit details or credentials publicly.

Upstream website login expiry and host permission restrictions still apply. A failed or unavailable login should be investigated through the website's normal flow; this project does not bypass authentication or permission prompts.
