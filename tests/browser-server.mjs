import { createServer, hashPassword } from '../server.js';
if (!process.env.NODO_BROWSER_PASSWORD) throw new Error('Run via Playwright: ephemeral test credential is missing.');
const server = createServer({ auth: { username: 'browser-test', ...hashPassword(process.env.NODO_BROWSER_PASSWORD) } });
server.listen(4173, '127.0.0.1');
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
