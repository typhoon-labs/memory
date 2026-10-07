/**
 * The official A2UI message processor with the incident catalog (the basic
 * catalog and the four components of packages/ui/src/incident-catalog.ts), in
 * strict mode: it throws if a message or component breaks its schema or refers
 * to a component that does not exist. Tests feed it what the server produces,
 * so "the card is valid A2UI" is checked by A2UI's own code against the same
 * definitions the UI draws from.
 */
import { MessageProcessor, STRICT_VALIDATION } from '@a2ui/web_core/v0_9';
import { basicCatalog } from '@a2ui/web_core/v0_9/basic_catalog';
import { BadgeApi, INCIDENT_CATALOG_ID as DEFINED_ID, NoticeApi, StepApi, StepsApi, incidentCatalog } from '@chat-assistant/ui/incident-catalog';
import { INCIDENT_CATALOG_ID, type A2uiMessage } from '../../src/a2a/wire.js';

export function newProcessor() {
  if (DEFINED_ID !== INCIDENT_CATALOG_ID) throw new Error('the server and the UI name the incident catalog differently');
  const catalog = incidentCatalog(basicCatalog, [...basicCatalog.components.values(), StepsApi, StepApi, BadgeApi, NoticeApi]);
  const processor = new MessageProcessor([catalog], undefined, { validationConfig: STRICT_VALIDATION });
  return {
    processor,
    apply(messages: A2uiMessage[]) {
      processor.processMessages(messages as never);
    },
    /** What a real client would report back as `a2uiClientDataModel.surfaces`. */
    clientSurfaces(): Record<string, unknown> {
      const model = processor.getRendererDataModel('v0.9.1' as never) as { surfaces?: Record<string, unknown> } | undefined;
      return model?.surfaces ?? {};
    },
  };
}
