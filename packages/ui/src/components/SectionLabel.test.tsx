import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SectionLabel } from './SectionLabel';

afterEach(cleanup);

describe('SectionLabel', () => {
  it('renders children', () => {
    render(<SectionLabel>Test Label</SectionLabel>);
    expect(screen.getByText('Test Label')).toBeTruthy();
  });
});
