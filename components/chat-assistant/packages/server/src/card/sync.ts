/**
 * Turns "what this viewer should see" into the A2UI messages that get them
 * there from what their client already has.
 *
 * The server keeps no per-client state. Each surface is created with
 * `sendDataModel: true`, so the client reports its data model in
 * `message.metadata.a2uiClientDataModel` on every request (A2UI v0.9.1, Data
 * Model Sync). The model carries `/meta/version` and `/meta/layout`; comparing
 * them with the card just built gives one of four answers:
 *
 *   nothing to send     the client is up to date (the usual answer to a poll);
 *   update in place     the client's components are all still part of the card:
 *                       `updateComponents` (which adds and updates) plus the
 *                       server-owned parts of the data model. Every step of an
 *                       incident is this case, the diagnosis arriving included,
 *                       so the buttons a viewer sees are never replaced;
 *   rebuild             the card no longer has a component the client holds.
 *                       `updateComponents` cannot remove one, so the surface is
 *                       deleted and created again (rare: a diagnosis recorded
 *                       after the developer was offered a version field);
 *   create              the client does not have the surface.
 *
 * `/reject`, `/draft`, `/propose` and `/notice` belong to the viewer. They are
 * written only when an action produces them, and carried over on a rebuild, so
 * a poll never overwrites what someone is typing.
 */
import { A2UI_VERSION, INCIDENT_CATALOG_ID, type A2uiMessage } from '../a2a/wire.js';
import { NO_NOTICE, type CardSurface, type Notice } from './incident-card.js';

export const SURFACE_PREFIX = 'incident-';
export const CARD_THEME = { primaryColor: '#1F6FEB', agentDisplayName: 'Chat assistant' };

/** surfaceId -> the data model the client holds for it. */
export type ClientSurfaces = Record<string, unknown>;

export interface SurfaceExtras {
  /** What the viewer's last action came to: a refusal or a failure, or `NO_NOTICE` when it went through. */
  notice?: Notice;
  /** A status draft from comms-agent, or '' to clear the field after posting. */
  draft?: string;
  /** '' to clear the reject reason once the rejection went through. */
  rejectReason?: string;
}

interface ClientModel {
  meta?: { version?: unknown; layout?: unknown };
  reject?: { reason?: unknown };
  draft?: { text?: unknown };
  propose?: { version?: unknown };
  notice?: Partial<Record<keyof Notice, unknown>>;
}

/** True when every component the client holds is still part of the card, with the same type. */
function updatableInPlace(held: unknown, layout: string[]): boolean {
  if (!Array.isArray(held)) return false;
  const now = new Set(layout);
  return held.every((entry) => now.has(entry));
}

/** Reads `a2uiClientDataModel` from an A2A message's metadata. */
export function clientSurfacesFrom(metadata: Record<string, unknown> | undefined): ClientSurfaces {
  const model = metadata?.a2uiClientDataModel as { surfaces?: unknown } | undefined;
  const surfaces = model?.surfaces;
  return surfaces && typeof surfaces === 'object' && !Array.isArray(surfaces) ? (surfaces as ClientSurfaces) : {};
}

const str = (value: unknown, fallback: string) => (typeof value === 'string' ? value : fallback);

/** The notice a client holds, with every field a string. */
function heldNotice(held: ClientModel | undefined): Notice {
  const n = held?.notice ?? {};
  return { slot: str(n.slot, ''), tone: str(n.tone, ''), title: str(n.title, ''), text: str(n.text, ''), rule: str(n.rule, '') };
}

export function syncMessages(
  desired: CardSurface[],
  client: ClientSurfaces,
  extras: Record<string, SurfaceExtras> = {},
): A2uiMessage[] {
  const out: A2uiMessage[] = [];
  const msg = (body: Record<string, unknown>) => out.push({ version: A2UI_VERSION, ...body });

  for (const surfaceId of Object.keys(client)) {
    if (surfaceId.startsWith(SURFACE_PREFIX) && !desired.some((s) => s.surfaceId === surfaceId)) {
      msg({ deleteSurface: { surfaceId } });
    }
  }

  for (const surface of desired) {
    const { surfaceId } = surface;
    const extra = extras[surfaceId] ?? {};
    const held = surfaceId in client ? ((client[surfaceId] ?? {}) as ClientModel) : undefined;

    if (!held || !updatableInPlace(held.meta?.layout, surface.layout)) {
      if (held) msg({ deleteSurface: { surfaceId } });
      msg({ createSurface: { surfaceId, catalogId: INCIDENT_CATALOG_ID, theme: CARD_THEME, sendDataModel: true } });
      msg({ updateComponents: { surfaceId, components: surface.components } });
      msg({
        updateDataModel: {
          surfaceId,
          path: '/',
          value: {
            ...surface.model,
            reject: { reason: extra.rejectReason ?? str(held?.reject?.reason, '') },
            draft: { text: extra.draft ?? str(held?.draft?.text, '') },
            propose: { version: str(held?.propose?.version, '') },
            notice: extra.notice ?? heldNotice(held),
          },
        },
      });
      continue;
    }

    if (held.meta?.version !== surface.version) {
      msg({ updateComponents: { surfaceId, components: surface.components } });
      msg({ updateDataModel: { surfaceId, path: '/can', value: surface.model.can } });
      msg({ updateDataModel: { surfaceId, path: '/meta', value: surface.model.meta } });
      // The incident moved on: the outcome of an earlier action no longer describes it.
      if (extra.notice === undefined && heldNotice(held).slot) {
        msg({ updateDataModel: { surfaceId, path: '/notice', value: NO_NOTICE } });
      }
    }
    if (extra.notice !== undefined) msg({ updateDataModel: { surfaceId, path: '/notice', value: extra.notice } });
    if (extra.draft !== undefined) msg({ updateDataModel: { surfaceId, path: '/draft', value: { text: extra.draft } } });
    if (extra.rejectReason !== undefined) {
      msg({ updateDataModel: { surfaceId, path: '/reject', value: { reason: extra.rejectReason } } });
    }
  }
  return out;
}

/** What the client holds once it has applied a sync for `desired`: used to diff again within one stream. */
export function applyToClientView(client: ClientSurfaces, desired: CardSurface[]): ClientSurfaces {
  return Object.fromEntries(desired.map((s) => [s.surfaceId, { ...(client[s.surfaceId] as object | undefined), meta: s.model.meta }]));
}
