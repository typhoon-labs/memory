import { createApp } from './app.js';
import { createTokenVerifier } from './auth.js';
import { createChat } from './chat/agent.js';
import { loadConfig } from './config.js';
import { createTestIssuer, type TestIssuer } from './dev/test-issuer.js';
import { createTokenExchange } from './downstream/delegation.js';
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
  audiences: config.oidc.acceptedAudiences,
  jwksUrl: config.oidc.jwksUrl,
  keys: testIssuer?.keys,
});

// With delegation, the model and every downstream get a token chain-sts issued for the caller, never the caller's own.
const tokenFor = config.delegation && createTokenExchange({ ...config.delegation, audience: config.oidc.audience });
const downstreams = createDownstreams(config, tokenFor);
const app = createApp({ config, verify, downstreams, chat: createChat(config, downstreams, tokenFor), testIssuer });

const server = app.listen(config.port, config.host, () => {
  console.log(
    `[chat-assistant] ${config.appVersion} listening on ${config.host}:${config.port}; ` +
      `downstreams: ${config.stubDownstreams ? 'in-memory stubs' : 'real'}; model: ${config.model.id} at ${config.model.baseUrl}; ` +
      `issuer: ${config.oidc.issuer}, audiences: ${config.oidc.acceptedAudiences.join(', ')}; ` +
      `sent downstream: ${config.delegation ? `a token exchanged at ${config.delegation.metadataUrl}` : "the caller's own token"}`,
  );
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    // Open SSE streams would hold the server open.
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
