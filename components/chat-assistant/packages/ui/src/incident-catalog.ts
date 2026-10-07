/**
 * The incident catalog: A2UI's basic catalog, plus four components of this
 * app's own for what the basic catalog cannot say: a step with a state, a
 * status badge, and the outcome of an action that was refused.
 *
 * This file is the catalog's definition, as schemas (zod 3, as
 * @a2ui/web_core writes its own). How each component is drawn is in
 * ./catalog.tsx. The server sends components by these names under this
 * catalog's id, and its tests check every card against these schemas with
 * A2UI's own strict validation.
 */
import {
  AccessibilityAttributesSchema,
  Catalog,
  ChildListSchema,
  ComponentIdSchema,
  DynamicStringSchema,
  type ComponentApi,
  type FunctionImplementation,
} from '@a2ui/web_core/v0_9';
import { z } from 'zod';

/** A name, not an address: nothing is published under it. The server holds the same string. */
export const INCIDENT_CATALOG_ID = 'agentgateway-demo:chat-assistant/incident-catalog/v1';

export const STEP_STATES = ['pending', 'current', 'done', 'failed'] as const;
export const BADGE_TONES = ['neutral', 'red', 'amber', 'green'] as const;
export const BADGE_ICONS = ['dot', 'bars', 'check'] as const;

/** The two properties every component of the basic catalog has. */
const common = {
  accessibility: AccessibilityAttributesSchema.describe('REF:#/$defs/AccessibilityAttributes').optional(),
  weight: z.number().describe('The relative weight of this component within a Row or Column.').optional(),
};

export const StepsApi = {
  name: 'Steps',
  schema: z
    .object({
      ...common,
      children: ChildListSchema.describe('REF:#/$defs/ChildList|The steps, in order. Each child is a Step.'),
    })
    .strict(),
};

export const StepApi = {
  name: 'Step',
  schema: z
    .object({
      ...common,
      label: DynamicStringSchema.describe('REF:#/$defs/DynamicString|The step, in the tense of its state: "Approve", "Approved".'),
      state: z.enum(STEP_STATES).describe('Where the step stands.'),
      closes: z.boolean().describe('True for the step that ends the work. Once done it is drawn as the good outcome.').optional(),
      owner: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Who does the step, or did it.').optional(),
      ownerRole: z.string().describe("The owner's role. A renderer may give each role a color.").optional(),
      you: z.boolean().describe('True when the viewer is the owner.').optional(),
      note: DynamicStringSchema.describe('REF:#/$defs/DynamicString|One short line on where the step stands.').optional(),
      busy: z.boolean().describe('True while the note describes something that is running.').optional(),
      time: DynamicStringSchema.describe('REF:#/$defs/DynamicString|When the step was done.').optional(),
      child: ComponentIdSchema.describe("REF:#/$defs/ComponentId|The viewer's controls for this step.").optional(),
      open: z.boolean().describe('True when the controls are drawn. A step keeps its controls when they do not apply; it stops drawing them.').optional(),
      turn: z.boolean().describe('True when the viewer can act on this step now.').optional(),
    })
    .strict(),
};

export const BadgeApi = {
  name: 'Badge',
  schema: z
    .object({
      ...common,
      text: DynamicStringSchema.describe('REF:#/$defs/DynamicString|The word on the badge.'),
      tone: z.enum(BADGE_TONES).default('neutral').describe('What the word means: red is bad, amber is under way, green is good.').optional(),
      icon: z.enum(BADGE_ICONS).describe('A mark before the word: a dot for a status, bars for a severity, a check for done.').optional(),
    })
    .strict(),
};

export const NoticeApi = {
  name: 'Notice',
  schema: z
    .object({
      ...common,
      slot: z.string().describe('The controls this notice belongs to. It is drawn only while `active` names it.'),
      active: DynamicStringSchema.describe('REF:#/$defs/DynamicString|The slot that has something to say now. Empty: none.'),
      tone: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Who said no: "gateway" or "service". Anything else is a failure.'),
      title: DynamicStringSchema.describe('REF:#/$defs/DynamicString|What happened, in a few words.'),
      text: DynamicStringSchema.describe('REF:#/$defs/DynamicString|Why, in a sentence.'),
      rule: DynamicStringSchema.describe("REF:#/$defs/DynamicString|The name of the service's rule that refused, if one did.").optional(),
    })
    .strict(),
};

/**
 * The catalog: the basic catalog's functions and theme, its components (as
 * given, so a renderer passes its own drawings of them) and the four above.
 */
export function incidentCatalog<T extends ComponentApi>(
  basic: Pick<Catalog<ComponentApi, FunctionImplementation>, 'protocolVersion' | 'functions' | 'themeSchema'>,
  components: T[],
): Catalog<T, FunctionImplementation> {
  return new Catalog<T, FunctionImplementation>(
    INCIDENT_CATALOG_ID,
    basic.protocolVersion,
    components,
    [...basic.functions.values()],
    basic.themeSchema,
  );
}
