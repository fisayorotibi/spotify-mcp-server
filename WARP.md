# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Common commands
- Environment
  - Windows (PowerShell): `Copy-Item .env.example .env`
  - macOS/Linux: `cp .env.example .env`
- Install: `npm install`
- Dev server (TypeScript via tsx): `npm run dev`
- Build (emit ESM to dist/): `npm run build`
- Start built server: `npm start`
- Lint: `npm run lint`
- Tests (Node.js test runner)
  - All tests: `npm test`
  - Single test file (JS): `node --test path/to/test-file.test.js`
  - Single test file (TS, via tsx): `node --loader tsx --test src/path/to/test-file.test.ts`
  - After building tests to dist: `node --test dist/path/to/test-file.test.js`

## Architecture and structure (big picture)
- Runtime and build
  - Node.js 18+ with ES modules (`package.json` has `"type": "module"`).
  - TypeScript sources in `src/` compiled by `tsc` (`tsconfig` outDir: `dist`, rootDir: `src`, `strict`, `moduleResolution: Bundler`).
  - Dev uses `tsx` (no build step); production runs `node dist/index.js` after build.
  - `dotenv/config` is imported at startup to auto-load `.env`.

- MCP server surface (`src/index.ts`)
  - Transports:
    - `StdioServerTransport` for local CLI clients.
    - `SSEServerTransport` exposed over HTTP for web clients (e.g., Poke) at `http://localhost:<MCP_SERVER_PORT><MCP_SSE_PATH>`.
  - Handlers: `listTools`, `listResources`, `callTool` (switch on tool name), `readResource` (switch on resource URI).
  - Tools
    - `spotify.search` — params: `q` (string), `type` (`track|artist|album`), `limit` (1–50, default 10). Returns the JSON body from the corresponding `spotify-web-api-node` search call.
    - `spotify.play` — params: `uris[]` or `context_uri`, optional `position_ms`. Calls `spotify.play`; returns text confirmation.
    - `spotify.pause` — no params. Calls `spotify.pause`; returns text confirmation.
  - Resources
    - `spotify:currently-playing` — JSON from `getMyCurrentPlaybackState`.
    - `spotify:user-profile` — JSON from `getMe`.

- Spotify client and auth
  - Configured from `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`.
  - `ensureAccessToken()`: if no access token is set, performs Client Credentials grant and sets an app token.
  - Implications: Search and other non-user endpoints work with the app token; playback tools require a user-authorized token with scopes (e.g., `user-read-playback-state`, `user-modify-playback-state`), which are not obtained by the client-credentials fallback.

## Environment variables (see `.env.example`)
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI`
- `SPOTIFY_SCOPES` (space-separated)
- `MCP_SERVER_NAME` (defaults to `spotify-mcp-server`)
- `MCP_SERVER_PORT` (SSE HTTP server port; default 7312)
- `MCP_SSE_PATH` (optional; default `/sse`)

## Extending the server
- Add a tool: extend the `tools` array and implement it in the `callTool` switch.
- Add a resource: extend the `resources` array and implement it in `readResource` by matching the URI.
- For user-scoped Spotify endpoints, supply a user access token with required scopes; the current code only auto-fetches an app token if none is set.
