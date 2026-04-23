import { useContext } from 'react';
import type { ThemeContextValue } from './ThemeProvider';
import { ThemeContext } from './ThemeProvider';

/**
 * Hook to access the current theme and a setter.
 * Must be used within a ThemeProvider.
 *
 * @returns `{ theme, setTheme, resolvedTheme }` where resolvedTheme is always 'light' or 'dark'.
 * @throws Error if used outside of ThemeProvider.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
