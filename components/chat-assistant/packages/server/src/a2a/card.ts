import type { AgentCard } from '@a2a-js/sdk';
import type { Config } from '../config.js';
import { A2UI_EXTENSION_URI, A2UI_MIME_TYPE, INCIDENT_CATALOG_ID } from './wire.js';

/**
 * The agent card. The A2UI extension is declared under
 * `capabilities.extensions`, as the extension specification asks. Both A2A 1.0
 * and 0.3 are offered on the same JSON-RPC URL; the `A2A-Version` request
 * header selects (absent means 0.3).
 */
export function buildAgentCard(config: Config, url: string): AgentCard {
  return {
    name: 'chat-assistant',
    description:
      'Answers questions about the current incident and renders the incident card as A2UI, with the actions of the signed-in role.',
    supportedInterfaces: [
      { url, protocolBinding: 'JSONRPC', protocolVersion: '1.0', tenant: '' },
      { url, protocolBinding: 'JSONRPC', protocolVersion: '0.3', tenant: '' },
    ],
    provider: undefined,
    version: config.appVersion,
    capabilities: {
      streaming: true,
      pushNotifications: false,
      extendedAgentCard: false,
      extensions: [
        {
          uri: A2UI_EXTENSION_URI,
          description: 'Renders the incident card as A2UI v0.9.1 with the incident catalog: the basic catalog and four components of its own.',
          required: false,
          params: { supportedCatalogIds: [INCIDENT_CATALOG_ID], acceptsInlineCatalogs: false },
        },
      ],
    },
    securitySchemes: {
      oidc: {
        scheme: {
          $case: 'openIdConnectSecurityScheme',
          value: {
            description: `Bearer access token for audience "${config.oidc.audience}", carrying preferred_username, roles and team.`,
            openIdConnectUrl: `${config.ui.oidcIssuer}/.well-known/openid-configuration`,
          },
        },
      },
    },
    securityRequirements: [{ schemes: { oidc: { list: [] } } }],
    defaultInputModes: ['text/plain', A2UI_MIME_TYPE],
    defaultOutputModes: ['text/plain', A2UI_MIME_TYPE],
    skills: [
      {
        id: 'incident-card',
        name: 'Incident card',
        description:
          'Returns the incident card as A2UI and handles its button actions (propose, approve, reject, apply, restart, draft and post a status update) as the signed-in user.',
        tags: ['incident', 'a2ui'],
        examples: [],
        inputModes: [A2UI_MIME_TYPE],
        outputModes: [A2UI_MIME_TYPE, 'text/plain'],
        securityRequirements: [],
      },
      {
        id: 'incident-chat',
        name: 'Incident chat',
        description: 'Answers questions about the incident in text. Read-only.',
        tags: ['incident', 'chat'],
        examples: ['What is broken and since when?', 'Who has to approve the rollback?'],
        inputModes: ['text/plain'],
        outputModes: ['text/plain'],
        securityRequirements: [],
      },
    ],
    signatures: [],
  };
}
