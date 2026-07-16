import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardMock } from './DashboardMock';

describe('DashboardMock', () => {
  it('uses the current Lacuna brand mark in the sidebar header', () => {
    const { container } = render(<DashboardMock />);
    const brandMark = container.querySelector('svg[aria-hidden="true"]');

    expect(brandMark).toHaveAttribute('x', '31');
    expect(brandMark).toHaveAttribute('y', '31');
    expect(brandMark).toHaveAttribute('width', '20');
    expect(brandMark).toHaveAttribute('height', '20');
    expect(brandMark?.querySelectorAll('path')).toHaveLength(2);
    expect(brandMark?.querySelector('circle')).toHaveAttribute('fill', 'currentColor');
  });
});
