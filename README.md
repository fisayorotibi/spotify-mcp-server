# Spotify MCP Server

An MCP (Model Context Protocol) server that integrates with Spotify for Poke integration.

## Features
- Authenticate with Spotify using OAuth (Auth Code w/ PKCE for desktop or Client Credentials for non-user endpoints)
- Expose MCP tools to search tracks, control playback, and fetch user playlists
- Example resources for currently playing and user profile

## Prerequisites
- Node.js 18+
- A Spotify Developer App (Client ID, Client Secret)

## Setup
1. Copy the environment template and fill in your credentials:
   - Windows (PowerShell): `Copy-Item .env.example .env`
   - macOS/Linux: `cp .env.example .env`
2. Fill in the OAuth values in `.env`.
3. Install dependencies and run in dev mode:
   - `npm install`
   - `npm run dev`

## MCP
Implements an MCP server using `@modelcontextprotocol/sdk` that provides:
- Tools:
  - `spotify.search` — search tracks, artists, albums
  - `spotify.play` — start resume playback (requires user-read-playback-state, user-modify-playback-state)
  - `spotify.pause` — pause playback
- Resources:
  - `spotify:currently-playing`
  - `spotify:user-profile`

## Security
Do not commit real secrets. `.env` is ignored by git. Use environment variables.

## License
MIT
