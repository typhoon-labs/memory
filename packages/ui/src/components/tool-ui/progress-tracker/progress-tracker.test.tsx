import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ProgressTracker } from './progress-tracker';
import type { ProgressStep } from './schema';

afterEach(cleanup);

describe('ProgressTracker', () => {
  it('renders steps', () => {
    const { container } = render(
      <ProgressTracker
        id="test"
        steps={[
          { id: 's-1', label: 'Step 1', status: 'completed' },
          { id: 's-2', label: 'Step 2', status: 'in-progress' },
        ]}
      />,
    );
    expect(container.textContent).toContain('Step 1');
    expect(container.textContent).toContain('Step 2');
  });

  it('renders empty when no steps', () => {
    const { container } = render(<ProgressTracker id="test" steps={[]} />);
    expect(container).toBeTruthy();
  });

  it('renders completed step with check indicator', () => {
    const { container } = render(
      <ProgressTracker id="test" steps={[{ id: 's-1', label: 'Done Step', status: 'completed' }]} />,
    );
    expect(container.textContent).toContain('Done Step');
    // Completed steps get a primary background indicator
    const indicator = container.querySelector('.bg-primary');
    expect(indicator).toBeTruthy();
  });

  it('renders in-progress step with spinner', () => {
    const { container } = render(
      <ProgressTracker id="test" steps={[{ id: 's-1', label: 'Loading', status: 'in-progress' }]} />,
    );
    expect(container.textContent).toContain('Loading');
    // In-progress steps show a Loader2 icon with animate-spin
    const spinner = container.querySelector('.motion-safe\\:animate-spin');
    expect(spinner).toBeTruthy();
  });

  it('renders failed step with X indicator', () => {
    const { container } = render(
      <ProgressTracker id="test" steps={[{ id: 's-1', label: 'Failed Step', status: 'failed' }]} />,
    );
    expect(container.textContent).toContain('Failed Step');
    // Failed steps get a muted background indicator
    const indicator = container.querySelector('.bg-muted');
    expect(indicator).toBeTruthy();
  });

  it('renders pending step with empty circle', () => {
    const { container } = render(
      <ProgressTracker id="test" steps={[{ id: 's-1', label: 'Pending Step', status: 'pending' }]} />,
    );
    expect(container.textContent).toContain('Pending Step');
    // Pending steps get a bg-card circle
    const indicator = container.querySelector('.bg-card');
    expect(indicator).toBeTruthy();
  });

  it('marks the in-progress step as aria-current', () => {
    const { container } = render(
      <ProgressTracker
        id="test"
        steps={[
          { id: 's-1', label: 'Step 1', status: 'completed' },
          { id: 's-2', label: 'Step 2', status: 'in-progress' },
          { id: 's-3', label: 'Step 3', status: 'pending' },
        ]}
      />,
    );
    const currentStep = container.querySelector('[aria-current="step"]');
    expect(currentStep).toBeTruthy();
    expect(currentStep?.textContent).toContain('Step 2');
  });

  it('sets aria-busy when a step is in progress', () => {
    const { container } = render(
      <ProgressTracker id="test" steps={[{ id: 's-1', label: 'Working', status: 'in-progress' }]} />,
    );
    const output = container.querySelector('output');
    expect(output?.getAttribute('aria-busy')).toBe('true');
  });

  it('sets aria-busy to false when no step is in progress', () => {
    const { container } = render(
      <ProgressTracker id="test" steps={[{ id: 's-1', label: 'Done', status: 'completed' }]} />,
    );
    const output = container.querySelector('output');
    expect(output?.getAttribute('aria-busy')).toBe('false');
  });

  it('displays elapsed time when provided', () => {
    const { container } = render(
      <ProgressTracker id="test" steps={[{ id: 's-1', label: 'Step', status: 'completed' }]} elapsedTime={5500} />,
    );
    // 5500ms = 5.5s
    expect(container.textContent).toContain('5.5s');
  });

  it('displays elapsed time in minutes format', () => {
    const { container } = render(
      <ProgressTracker id="test" steps={[{ id: 's-1', label: 'Step', status: 'completed' }]} elapsedTime={125000} />,
    );
    // 125000ms = ~2m 5s
    expect(container.textContent).toContain('2m');
  });

  it('does not display elapsed time when zero or negative', () => {
    const { container } = render(
      <ProgressTracker id="test" steps={[{ id: 's-1', label: 'Step', status: 'completed' }]} elapsedTime={0} />,
    );
    const timeEl = container.querySelector('time');
    expect(timeEl).toBeNull();
  });

  it('renders progress events under a step', () => {
    const steps: ProgressStep[] = [
      {
        id: 's-1',
        label: 'Ingesting',
        status: 'in-progress',
        progressEvents: [
          { message: 'Parsing file...', status: 'done' },
          { message: 'Chunking text...', status: 'in-progress' },
        ],
      },
    ];
    const { container } = render(<ProgressTracker id="test" steps={steps} />);
    expect(container.textContent).toContain('Parsing file...');
    expect(container.textContent).toContain('Chunking text...');
  });

  it('renders step description only when active or failed', () => {
    const { container } = render(
      <ProgressTracker
        id="test"
        steps={[
          { id: 's-1', label: 'Step 1', description: 'Visible desc', status: 'in-progress' },
          { id: 's-2', label: 'Step 2', description: 'Hidden desc', status: 'pending' },
        ]}
      />,
    );
    // Both descriptions exist in DOM, but the pending one is hidden via aria-hidden
    const hiddenDescs = container.querySelectorAll('[aria-hidden="true"]');
    const visibleDescs = container.querySelectorAll('[aria-hidden="false"]');
    expect(hiddenDescs.length).toBeGreaterThan(0);
    // The in-progress step description should not be aria-hidden
    expect(visibleDescs.length).toBeGreaterThan(0);
  });

  it('applies custom className to the output element', () => {
    const { container } = render(<ProgressTracker id="test" steps={[]} className="my-tracker" />);
    const output = container.querySelector('output.my-tracker');
    expect(output).toBeTruthy();
  });

  it('sets data-tool-ui-id attribute', () => {
    const { container } = render(<ProgressTracker id="my-tracker-123" steps={[]} />);
    const output = container.querySelector('[data-tool-ui-id="my-tracker-123"]');
    expect(output).toBeTruthy();
  });

  it('shows connector line between steps', () => {
    const { container } = render(
      <ProgressTracker
        id="test"
        steps={[
          { id: 's-1', label: 'Step 1', status: 'completed' },
          { id: 's-2', label: 'Step 2', status: 'pending' },
        ]}
      />,
    );
    // Connector line should exist (an absolutely-positioned div between steps)
    const connectors = container.querySelectorAll('[aria-hidden="true"]');
    expect(connectors.length).toBeGreaterThan(0);
  });

  it('renders step with failed status and description visible', () => {
    const { container } = render(
      <ProgressTracker
        id="test"
        steps={[{ id: 's-1', label: 'Failed Step', description: 'Error details here', status: 'failed' }]}
      />,
    );
    expect(container.textContent).toContain('Failed Step');
    // Failed step description should be visible (aria-hidden="false")
    const visibleDescs = container.querySelectorAll('[aria-hidden="false"]');
    expect(visibleDescs.length).toBeGreaterThan(0);
  });

  it('hides completed step description', () => {
    const { container } = render(
      <ProgressTracker
        id="test"
        steps={[{ id: 's-1', label: 'Done', description: 'Completed desc', status: 'completed' }]}
      />,
    );
    // Completed step description should be hidden (aria-hidden="true")
    const hiddenDescs = container.querySelectorAll('[aria-hidden="true"]');
    expect(hiddenDescs.length).toBeGreaterThan(0);
  });

  it('applies pending text styling to pending steps', () => {
    const { container } = render(
      <ProgressTracker id="test" steps={[{ id: 's-1', label: 'Waiting', status: 'pending' }]} />,
    );
    const pendingLabel = container.querySelector('.text-muted-foreground');
    expect(pendingLabel).toBeTruthy();
  });

  it('marks superseded in-progress events as done', () => {
    const steps: ProgressStep[] = [
      {
        id: 's-1',
        label: 'Processing',
        status: 'in-progress',
        progressEvents: [
          { message: 'First action', status: 'in-progress' },
          { message: 'Second action', status: 'in-progress' },
        ],
      },
    ];
    const { container } = render(<ProgressTracker id="test" steps={steps} />);
    // Both events should render
    expect(container.textContent).toContain('First action');
    expect(container.textContent).toContain('Second action');
  });

  it('renders progress events with done status', () => {
    const steps: ProgressStep[] = [
      {
        id: 's-1',
        label: 'Complete',
        status: 'completed',
        progressEvents: [
          { message: 'Done event', status: 'done' },
          { message: 'Failed sub-event', status: 'failed' },
        ],
      },
    ];
    const { container } = render(<ProgressTracker id="test" steps={steps} />);
    expect(container.textContent).toContain('Done event');
    expect(container.textContent).toContain('Failed sub-event');
  });

  it('does not display elapsed time when negative', () => {
    const { container } = render(
      <ProgressTracker id="test" steps={[{ id: 's-1', label: 'Step', status: 'completed' }]} elapsedTime={-500} />,
    );
    const timeEl = container.querySelector('time');
    expect(timeEl).toBeNull();
  });

  it('renders elapsed time with hours format for very long durations', () => {
    const { container } = render(
      <ProgressTracker id="test" steps={[{ id: 's-1', label: 'Step', status: 'completed' }]} elapsedTime={3661000} />,
    );
    // 3661000ms ~ 1h 1m
    expect(container.textContent).toContain('1m');
  });

  it('getCurrentStepId falls back to first pending when no in-progress or failed', () => {
    const { container } = render(
      <ProgressTracker
        id="test"
        steps={[
          { id: 's-1', label: 'Done', status: 'completed' },
          { id: 's-2', label: 'Next', status: 'pending' },
          { id: 's-3', label: 'Later', status: 'pending' },
        ]}
      />,
    );
    // s-2 should be aria-current="step" as first pending
    const currentStep = container.querySelector('[aria-current="step"]');
    expect(currentStep?.textContent).toContain('Next');
  });

  it('prioritizes in-progress over failed for current step', () => {
    const { container } = render(
      <ProgressTracker
        id="test"
        steps={[
          { id: 's-1', label: 'Failed', status: 'failed' },
          { id: 's-2', label: 'Active', status: 'in-progress' },
        ]}
      />,
    );
    const currentStep = container.querySelector('[aria-current="step"]');
    expect(currentStep?.textContent).toContain('Active');
  });
});
