import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { ThemeContext, ThemeProvider } from './ThemeProvider';
import { useTheme } from './useTheme';

afterEach(cleanup);

function TestConsumer() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button type="button" onClick={() => setTheme('dark')} data-testid="set-dark">
        Dark
      </button>
      <button type="button" onClick={() => setTheme('light')} data-testid="set-light">
        Light
      </button>
      <button type="button" onClick={() => setTheme('system')} data-testid="set-system">
        System
      </button>
    </div>
  );
}

describe('ThemeProvider', () => {
  it('provides default theme "system"', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('system');
  });

  it('resolves system theme to light or dark', () => {
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    const resolved = screen.getByTestId('resolved').textContent;
    expect(['light', 'dark']).toContain(resolved);
  });

  it('accepts defaultTheme prop', () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <TestConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });

  it('exports ThemeContext', () => {
    expect(ThemeContext).toBeDefined();
  });

  it('switches to dark theme via setTheme', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider defaultTheme="light">
        <TestConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('light');
    await user.click(screen.getByTestId('set-dark'));
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });

  it('switches to light theme via setTheme', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider defaultTheme="dark">
        <TestConsumer />
      </ThemeProvider>,
    );
    await user.click(screen.getByTestId('set-light'));
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(screen.getByTestId('resolved').textContent).toBe('light');
  });

  it('persists theme to localStorage', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider storageKey="test-theme">
        <TestConsumer />
      </ThemeProvider>,
    );
    await user.click(screen.getByTestId('set-dark'));
    expect(localStorage.getItem('test-theme')).toBe('dark');
  });

  it('reads theme from localStorage on init', () => {
    localStorage.setItem('typhoon-theme', 'dark');
    render(
      <ThemeProvider>
        <TestConsumer />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    localStorage.removeItem('typhoon-theme');
  });

  it('applies theme class to document.documentElement', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider defaultTheme="light">
        <TestConsumer />
      </ThemeProvider>,
    );
    await user.click(screen.getByTestId('set-dark'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('light')).toBe(false);
  });
});

describe('useTheme', () => {
  it('throws when used outside ThemeProvider', () => {
    function BadConsumer() {
      useTheme();
      return null;
    }
    expect(() => render(<BadConsumer />)).toThrow('useTheme must be used within a ThemeProvider');
  });
});
