import 'dotenv/config';
import { Server, Tool, Resource, ListResourcesRequest, CallToolRequest, ListToolsRequest } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import http from 'http';
import SpotifyWebApi from 'spotify-web-api-node';

const name = process.env.MCP_SERVER_NAME || 'spotify-mcp-server';

// Configure Spotify client
const spotify = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI,
});

async function ensureAccessToken() {
  // If you already have a refresh token set in env, refresh it
  const hasToken = spotify.getAccessToken();
  if (!hasToken && process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
    // Client Credentials flow as a fallback for non-user endpoints
    const data = await spotify.clientCredentialsGrant();
    spotify.setAccessToken(data.body.access_token);
  }
}

// Define tools
const tools: Tool[] = [
  {
    name: 'spotify.search',
    description: 'Search Spotify for tracks, artists, or albums. Params: q (query), type (track|artist|album), limit (1-50) default 10.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        type: { type: 'string', enum: ['track', 'artist', 'album'] },
        limit: { type: 'number', minimum: 1, maximum: 50, default: 10 }
      },
      required: ['q', 'type']
    },
  },
  {
    name: 'spotify.play',
    description: 'Start or resume playback on the user\'s active device. Params: uris (array of track URIs) or context_uri.',
    inputSchema: {
      type: 'object',
      properties: {
        uris: { type: 'array', items: { type: 'string' } },
        context_uri: { type: 'string' },
        position_ms: { type: 'number' }
      }
    }
  },
  {
    name: 'spotify.pause',
    description: 'Pause playback on the user\'s active device.',
    inputSchema: { type: 'object', properties: {} }
  }
];

// Define resources
const resources: Resource[] = [
  {
    uri: 'spotify:currently-playing',
    mimeType: 'application/json',
    name: 'Currently Playing',
    description: 'The user\'s currently playing item info'
  },
  {
    uri: 'spotify:user-profile',
    mimeType: 'application/json',
    name: 'User Profile',
    description: 'Current user profile information'
  }
];

const server = new Server({ name, version: '0.1.0' }, {
  listTools: async (_req: ListToolsRequest) => ({ tools }),
  listResources: async (_req: ListResourcesRequest) => ({ resources }),
  callTool: async (req: CallToolRequest) => {
    await ensureAccessToken();

    switch (req.params.name) {
      case 'spotify.search': {
        const { q, type, limit = 10 } = req.params.arguments as { q: string; type: 'track'|'artist'|'album'; limit?: number };
        if (!q || !type) {
          return { content: [{ type: 'text', text: 'Missing required parameters q and type' }] };
        }
        if (type === 'track') {
          const res = await spotify.searchTracks(q, { limit });
          return { content: [{ type: 'json', json: res.body }] };
        } else if (type === 'artist') {
          const res = await spotify.searchArtists(q, { limit });
          return { content: [{ type: 'json', json: res.body }] };
        } else {
          const res = await spotify.searchAlbums(q, { limit });
          return { content: [{ type: 'json', json: res.body }] };
        }
      }
      case 'spotify.play': {
        const args = req.params.arguments as { uris?: string[]; context_uri?: string; position_ms?: number };
        await spotify.play(args);
        return { content: [{ type: 'text', text: 'Playback started/resumed.' }] };
      }
      case 'spotify.pause': {
        await spotify.pause();
        return { content: [{ type: 'text', text: 'Playback paused.' }] };
      }
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }] };
    }
  },
  readResource: async ({ uri }) => {
    await ensureAccessToken();

    if (uri === 'spotify:currently-playing') {
      const res = await spotify.getMyCurrentPlaybackState();
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(res.body) }] };
    }
    if (uri === 'spotify:user-profile') {
      const res = await spotify.getMe();
      return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(res.body) }] };
    }

    throw new Error(`Unknown resource: ${uri}`);
  }
});

// Initialize transports: stdio (for CLI clients) and HTTP SSE (for web clients like Poke)
const stdioTransport = new StdioServerTransport();
server.connect(stdioTransport);

const port = Number(process.env.MCP_SERVER_PORT) || 7312;
const ssePath = process.env.MCP_SSE_PATH || '/sse';

const sseTransport = new SSEServerTransport();
server.connect(sseTransport);

const httpServer = http.createServer((req, res) => {
  // Basic CORS for browsers connecting from other origins
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url && (req.url === ssePath || req.url.startsWith(ssePath + '?'))) {
    // Delegate SSE handshake/stream to the MCP SSE transport
    // @ts-ignore - handleRequest is provided by the transport implementation
    if (typeof (sseTransport as any).handleRequest === 'function') {
      (sseTransport as any).handleRequest(req, res);
      return;
    }
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('SSE transport does not expose handleRequest');
    return;
  }

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ name, version: '0.1.0', transport: 'sse', ssePath }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

httpServer.listen(port, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`[MCP] SSE listening at http://localhost:${port}${ssePath}`);
});
