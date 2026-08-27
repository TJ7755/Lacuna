import { serveStdio, type StdioServerHandle } from '@modelcontextprotocol/server/stdio';
import { TerminalAiClient } from './client.js';
import { HttpTerminalRelayTransport } from './relayTransport.js';
import { createLacunaAiMcpServer } from './server.js';

export function startLacunaAiMcpServer(): StdioServerHandle {
  return serveStdio(
    () => {
      const client = new TerminalAiClient({ transport: new HttpTerminalRelayTransport() });
      const server = createLacunaAiMcpServer(client);
      server.server.onclose = () => {
        void client.disconnect().catch((error: unknown) => {
          process.stderr.write(`${describeError(error)}\n`);
        });
      };
      return server;
    },
    {
      legacy: 'serve',
      onerror: (error) => process.stderr.write(`Lacuna AI MCP stdio failed: ${error.message}\n`),
    },
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Lacuna AI disconnected unexpectedly.';
}

startLacunaAiMcpServer();
