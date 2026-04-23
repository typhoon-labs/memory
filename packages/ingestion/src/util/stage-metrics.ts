import { syncStageDuration } from '@typhoon/telemetry';

/** Record the duration of a pipeline stage to the OTel histogram. */
export function recordStageDuration(stage: string, ms: number): void {
  syncStageDuration.record(ms, { stage });
}
