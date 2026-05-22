import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Loader } from './loader';

afterEach(cleanup);

describe('Loader', () => {
  it('renders three animated dots', () => {
    const { container } = render(<Loader />);
    const dots = container.querySelectorAll('.animate-pulse');
    expect(dots).toHaveLength(3);
  });

  it('accepts custom className', () => {
    const { container } = render(<Loader className="my-custom-class" />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.classList.contains('my-custom-class')).toBe(true);
  });

  it('always has base flex layout', () => {
    const { container } = render(<Loader />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.classList.contains('flex')).toBe(true);
    expect(wrapper?.classList.contains('items-center')).toBe(true);
  });
});
