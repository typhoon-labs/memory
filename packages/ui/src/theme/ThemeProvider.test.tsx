import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThemeContext, ThemeProvider } from './ThemeProvider';
import { useTheme } from './useTheme';

afterEach(cleanup);

function TestConsumer() {
  const { theme, resolvedTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
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
