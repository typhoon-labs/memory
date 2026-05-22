import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExternalLinkDialog } from './ExternalLinkDialog';

afterEach(cleanup);

describe('ExternalLinkDialog', () => {
  it('renders children as trigger', () => {
    render(
      <ExternalLinkDialog href="https://example.com">
        <button type="button">Open</button>
      </ExternalLinkDialog>,
    );
    expect(screen.getByText('Open')).toBeTruthy();
  });

  it('shows dialog with URL when trigger is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ExternalLinkDialog href="https://example.com/page">
        <button type="button">Click me</button>
      </ExternalLinkDialog>,
    );
    await user.click(screen.getByText('Click me'));
    expect(screen.getByText('Open external link?')).toBeTruthy();
    expect(screen.getByText('https://example.com/page')).toBeTruthy();
    expect(screen.getByText('This will open in a new tab:')).toBeTruthy();
  });

  it('renders Cancel and Open Link buttons in dialog', async () => {
    const user = userEvent.setup();
    render(
      <ExternalLinkDialog href="https://example.com">
        <button type="button">Trigger</button>
      </ExternalLinkDialog>,
    );
    await user.click(screen.getByText('Trigger'));
    expect(screen.getByRole('button', { name: /Cancel/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open Link/ })).toBeTruthy();
  });

  it('calls window.open on Open Link click', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();
    render(
      <ExternalLinkDialog href="https://example.com/doc">
        <button type="button">Trigger</button>
      </ExternalLinkDialog>,
    );
    await user.click(screen.getByText('Trigger'));
    await user.click(screen.getByRole('button', { name: /Open Link/ }));
    expect(openSpy).toHaveBeenCalledWith('https://example.com/doc', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });
});
