# VOLTRA Web on Cloudflare Pages

This directory contains the Cloudflare Pages build entrypoint for the VOLTRA Web client.

## Cloudflare Pages settings

- Framework preset: **None**
- Root directory: **web**
- Build command: **bash build.sh**
- Build output directory: **client/dist**
- Production branch: **main**
- Project name: keep **chelixxx-giftbot-gramsrv** for the matching `.pages.dev` host unless the host value in the build script is changed too.
- Environment: Node.js **22** (set `NODE_VERSION=22` if Cloudflare does not detect `.node-version` automatically).

The build pins the public `iamxvbaba/gramsrv-tweb` source to commit
`8e6cc00b576364aa43824a1b3670bdee185046a1`, then applies the VOLTRA Railway
RSA key, the private-WebSocket transport guard, and VOLTRA branding before building.

It also copies the source client's static fonts, images, audio, stickers, and required
worker/WASM assets while deliberately excluding stale prebuilt JavaScript bundles.

The client connects over secure WebSocket to:

- Host: `voltra-server-production.up.railway.app`
- Port: `443`
- Path: `/apiws`

These are browser-visible client settings, not server credentials. This build does not
change the Railway server, database, or admin panel.

After the Pages domain is assigned, that exact origin must be included in the server's
WebSocket allowed-origin list before sign-in can work from the public website.
