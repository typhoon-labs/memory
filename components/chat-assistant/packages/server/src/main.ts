import { createApp } from './app.js';
import { createTokenVerifier } from './auth.js';
import { createChat } from './chat/agent.js';
import { loadConfig } from './config.js';
import { createTestIssuer, type TestIssuer } from './dev/test-issuer.js';
import { createDownstreams } from './downstream/index.js';

const config = loadConfig();

let testIssuer: TestIssuer | undefined;
if (config.devTestIssuer) {
  testIssuer = await createTestIssuer({ issuer: config.oidc.issuer, audience: config.oidc.audience });
  console.warn(
    `[chat-assistant] DEV_TEST_ISSUER=1: tokens are issued by ${config.oidc.issuer} without a password. Local testing only.`,
  );
}

const verify = createTokenVerifier({
  issuer: config.oidc.issuer,
  audience: config.oidc.audience,
  jwksUrl: config.oidc.jwksUrl,
  keys: testIssuer?.keys,
});

const downstreams = createDownstreams(config);
const app = createApp({ config, verify, downstreams, chat: createChat(config, downstreams), testIssuer });

const server = app.listen(config.port, config.host, () => {
  console.log(
    `[chat-assistant] ${config.appVersion} listening on ${config.host}:${config.port}; ` +
      `downstreams: ${config.stubDownstreams ? 'in-memory stubs' : 'real'}; model: ${config.model.id} at ${config.model.baseUrl}; ` +
      `issuer: ${config.oidc.issuer}`,
  );
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    // Open SSE streams would hold the server open.
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
