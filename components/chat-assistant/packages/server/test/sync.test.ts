import { describe, expect, test } from 'vitest';
import { NO_NOTICE, buildIncidentCard, type Notice } from '../src/card/incident-card.js';
import { clientSurfacesFrom, syncMessages } from '../src/card/sync.js';
import { newProcessor } from './support/a2ui.js';
import { VIEWERS, incidentWith } from './support/fixtures.js';

const kinds = (messages: Record<string, unknown>[]) => messages.map((m) => Object.keys(m).find((k) => k !== 'version'));
const paths = (messages: any[]) => messages.filter((m) => m.updateDataModel).map((m) => m.updateDataModel.path);
const manager = VIEWERS['incident-manager']!;
const refused: Notice = { slot: 'approve', tone: 'service', title: 'Refused by the service', text: 'The person who proposed a change cannot approve it.', rule: 'approver_is_not_proposer' };

/** A client that has the card for `status` and has typed into it. */
function clientWith(status: Parameters<typeof incidentWith>[0]) {
  const a2ui = newProcessor();
  a2ui.apply(syncMessages([buildIncidentCard(incidentWith(status), manager)], {}));
  const surface = a2ui.processor.getSurface('incident-INC-1')!;
  surface.dataModel.set('/reject/reason', 'not yet');
  surface.dataModel.set('/draft/text', 'my draft');
  return a2ui;
}
const model = (a2ui: ReturnType<typeof newProcessor>) => a2ui.clientSurfaces()['incident-INC-1'] as any;

describe('card sync: only what the client is missing', () => {
  test('a client with nothing gets createSurface, updateComponents, updateDataModel', () => {
    const messages = syncMessages([buildIncidentCard(incidentWith('proposed'), manager)], {});
    expect(kinds(messages)).toEqual(['createSurface', 'updateComponents', 'updateDataModel']);
    expect(messages.every((m) => m.version === 'v0.9.1')).toBe(true);
    expect((messages[0] as any).createSurface.sendDataModel).toBe(true);
  });

  test('an up-to-date client gets nothing, so a poll cannot disturb what is on screen', () => {
    const a2ui = clientWith('proposed');
    expect(syncMessages([buildIncidentCard(incidentWith('proposed'), manager)], a2ui.clientSurfaces())).toEqual([]);
  });

  test("a change of status is an in-place update that leaves the viewer's typing alone", () => {
    const a2ui = clientWith('proposed');
    const next = buildIncidentCard(incidentWith('approved'), manager);
    const messages = syncMessages([next], a2ui.clientSurfaces());
    expect(kinds(messages)).toEqual(['updateComponents', 'updateDataModel', 'updateDataModel']);
    expect(paths(messages)).toEqual(['/can', '/meta']);
    a2ui.apply(messages); // strict: throws if a component were left orphaned

    expect(model(a2ui).reject.reason).toBe('not yet');
    expect(model(a2ui).draft.text).toBe('my draft');
    expect(model(a2ui).can.approve).toBe(false);
    expect(model(a2ui).meta.version).toBe(next.version);
    expect(syncMessages([next], a2ui.clientSurfaces())).toEqual([]);
  });

  test('the diagnosis arriving is an in-place update too: nothing on screen is replaced', () => {
    const a2ui = newProcessor();
    const undiagnosed = incidentWith('none', { evidence: [], suspected_cause: undefined, recommended_version: undefined });
    a2ui.apply(syncMessages([buildIncidentCard(undiagnosed, manager, { state: 'running', since: '2026-10-06T09:14:03Z' })], {}));
    a2ui.processor.getSurface('incident-INC-1')!.dataModel.set('/draft/text', 'early draft');

    const diagnosed = buildIncidentCard(incidentWith('none'), manager);
    const messages = syncMessages([diagnosed], a2ui.clientSurfaces());
    expect(kinds(messages)).toEqual(['updateComponents', 'updateDataModel', 'updateDataModel']);
    a2ui.apply(messages); // strict: throws if a component were left orphaned
    expect(model(a2ui).draft.text).toBe('early draft');
    expect(syncMessages([diagnosed], a2ui.clientSurfaces())).toEqual([]);
  });

  test('a rebuild carries the notice over too', () => {
    const a2ui = newProcessor();
    const developer = VIEWERS.developer!;
    const undiagnosed = incidentWith('none', { evidence: [], suspected_cause: undefined, recommended_version: undefined });
    a2ui.apply(syncMessages([buildIncidentCard(undiagnosed, developer, { state: 'failed', at: '2026-10-06T09:15:03Z', message: 'no answer' })], {}));
    const wrongVersion: Notice = { slot: 'propose', tone: 'service', title: 'Refused by the service', text: 'That is not a retained earlier version of the service.', rule: 'target_is_retained_earlier_version' };
    a2ui.processor.getSurface('incident-INC-1')!.dataModel.set('/notice', wrongVersion);
    // The same card, with the version field gone, built in one request with no new outcome.
    const messages = syncMessages([buildIncidentCard(incidentWith('none'), developer)], a2ui.clientSurfaces(), { 'incident-INC-1': {} });
    expect(kinds(messages)).toEqual(['deleteSurface', 'createSurface', 'updateComponents', 'updateDataModel']);
    a2ui.apply(messages);
    expect(model(a2ui).notice).toEqual(wrongVersion);
  });

  test('when the card loses a component the surface is rebuilt, carrying over what the viewer typed', () => {
    const a2ui = newProcessor();
    const developer = VIEWERS.developer!;
    const undiagnosed = incidentWith('none', { evidence: [], suspected_cause: undefined, recommended_version: undefined });
    // The diagnosis failed, so the developer was offered a field to name the version.
    a2ui.apply(syncMessages([buildIncidentCard(undiagnosed, developer, { state: 'failed', at: '2026-10-06T09:15:03Z', message: 'no answer' })], {}));
    a2ui.processor.getSurface('incident-INC-1')!.dataModel.set('/propose/version', '2.0.0');

    // A later diagnosis recommends a version: the field goes, which an update cannot express.
    const diagnosed = buildIncidentCard(incidentWith('none'), developer);
    const messages = syncMessages([diagnosed], a2ui.clientSurfaces());
    expect(kinds(messages)).toEqual(['deleteSurface', 'createSurface', 'updateComponents', 'updateDataModel']);
    a2ui.apply(messages);
    expect(model(a2ui).propose.version).toBe('2.0.0');
    expect(model(a2ui).meta.layout).toEqual(diagnosed.layout);
    expect(syncMessages([diagnosed], a2ui.clientSurfaces())).toEqual([]);
  });

  test('an action result writes the notice and the draft, and nothing else, when the card is unchanged', () => {
    const a2ui = clientWith('proposed');
    const card = buildIncidentCard(incidentWith('proposed'), manager);
    const messages = syncMessages([card], a2ui.clientSurfaces(), {
      'incident-INC-1': { notice: refused, draft: 'Draft text' },
    });
    expect(paths(messages)).toEqual(['/notice', '/draft']);
    a2ui.apply(messages);
    expect(model(a2ui).notice).toEqual(refused);
    expect(model(a2ui).draft.text).toBe('Draft text');
    expect(model(a2ui).reject.reason).toBe('not yet');
  });

  test('an action that went through leaves no notice, and clears the one before it', () => {
    const a2ui = clientWith('proposed');
    const card = buildIncidentCard(incidentWith('proposed'), manager);
    a2ui.apply(syncMessages([card], a2ui.clientSurfaces(), { 'incident-INC-1': { notice: refused } }));
    a2ui.apply(syncMessages([card], a2ui.clientSurfaces(), { 'incident-INC-1': { notice: NO_NOTICE } }));
    expect(model(a2ui).notice).toEqual(NO_NOTICE);
  });

  test("when the incident moves on, the outcome of the viewer's earlier action is cleared", () => {
    const a2ui = clientWith('proposed');
    a2ui.processor.getSurface('incident-INC-1')!.dataModel.set('/notice', refused);
    const messages = syncMessages([buildIncidentCard(incidentWith('approved'), manager)], a2ui.clientSurfaces());
    expect(paths(messages)).toEqual(['/can', '/meta', '/notice']);
    a2ui.apply(messages);
    expect(model(a2ui).notice).toEqual(NO_NOTICE);
    expect(model(a2ui).draft.text).toBe('my draft');
  });

  test('a completed rejection clears the reason field', () => {
    const a2ui = clientWith('proposed');
    const messages = syncMessages([buildIncidentCard(incidentWith('rejected'), manager)], a2ui.clientSurfaces(), {
      'incident-INC-1': { notice: NO_NOTICE, rejectReason: '' },
    });
    a2ui.apply(messages);
    expect(model(a2ui).reject.reason).toBe('');
    expect(model(a2ui).draft.text).toBe('my draft');
  });

  test('a surface the client holds for an incident no longer shown is deleted', () => {
    const a2ui = clientWith('applied');
    const other = buildIncidentCard(incidentWith('none', { id: 'INC-2' }), manager);
    const messages = syncMessages([other], a2ui.clientSurfaces());
    expect(kinds(messages)).toEqual(['deleteSurface', 'createSurface', 'updateComponents', 'updateDataModel']);
    a2ui.apply(messages);
    expect([...a2ui.processor.getSurfaces().keys()]).toEqual(['incident-INC-2']);
  });

  test('the client data model is read from message metadata as the specification defines it', () => {
    expect(clientSurfacesFrom({ a2uiClientDataModel: { version: 'v0.9.1', surfaces: { s: { meta: { version: 'v' } } } } })).toEqual({
      s: { meta: { version: 'v' } },
    });
    expect(clientSurfacesFrom(undefined)).toEqual({});
    expect(clientSurfacesFrom({ a2uiClientDataModel: 'nonsense' })).toEqual({});
  });
});
