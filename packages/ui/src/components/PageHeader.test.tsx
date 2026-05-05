import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

afterEach(cleanup);

describe('PageHeader', () => {
  it('renders title', () => {
    render(<PageHeader title="My Page" />);
    expect(screen.getByText('My Page')).toBeTruthy();
  });

  it('renders description when provided', () => {
    render(<PageHeader title="Title" description="Some desc" />);
    expect(screen.getByText('Some desc')).toBeTruthy();
  });
});
