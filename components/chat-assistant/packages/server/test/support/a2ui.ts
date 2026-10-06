/**
 * The official A2UI message processor with the official basic catalog, in
 * strict mode: it throws if a message or component breaks the v0.9 schema or
 * refers to a component that does not exist. Tests feed it what the server
 * produces, so "the card is valid A2UI" is checked by A2UI's own code.
 */
import { MessageProcessor, STRICT_VALIDATION } from '@a2ui/web_core/v0_9';
import { basicCatalog } from '@a2ui/web_core/v0_9/basic_catalog';
import { BASIC_CATALOG_ID, type A2uiMessage } from '../../src/a2a/wire.js';

export function newProcessor() {
  if (basicCatalog.id !== BASIC_CATALOG_ID) throw new Error('basic catalog id changed upstream');
  const processor = new MessageProcessor([basicCatalog], undefined, { validationConfig: STRICT_VALIDATION });
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
