import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppLink, AppNavLink } from './AppLink';

function Location() {
  const location = useLocation();
  return (
    <output>
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  );
}

describe('app navigation', () => {
  it('navigates without a hover URL and supports Enter', () => {
    render(
      <MemoryRouter>
        <AppLink to="/share?course=1">Share</AppLink>
        <Location />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Share' });
    expect(link).not.toHaveAttribute('href');
    expect(link).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(link, { key: 'Enter' });
    expect(screen.getByRole('status')).toHaveTextContent('/share?course=1');
  });

  it('preserves active matching, including route boundaries', () => {
    render(
      <MemoryRouter initialEntries={['/course/one/cards']}>
        <AppNavLink to="/course/one">Course</AppNavLink>
        <AppNavLink to="/course/one" end>
          Exact
        </AppNavLink>
        <AppNavLink to="/course/on">Other</AppNavLink>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Course' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Exact' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Other' })).not.toHaveAttribute('aria-current');
  });

  it('opens modified and middle clicks separately without changing the current route', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(
      <MemoryRouter>
        <AppLink to="/share">Share</AppLink>
        <Location />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Share' });
    fireEvent.click(link, { ctrlKey: true });
    fireEvent(link, new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }));
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledWith('/share', '_blank', 'noopener,noreferrer');
    expect(screen.getByRole('status')).toHaveTextContent('/');
    open.mockRestore();
  });

  it('respects cancelled navigation and retains ordinary external and download links', () => {
    render(
      <MemoryRouter>
        <AppLink to="/share" onClick={(event) => event.preventDefault()}>
          Share
        </AppLink>
        <AppLink to="https://example.com">Website</AppLink>
        <AppLink to="/backup" download>
          Download
        </AppLink>
        <Location />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Share' }));
    expect(screen.getByRole('status')).toHaveTextContent('/');
    expect(screen.getByRole('link', { name: 'Website' })).toHaveAttribute(
      'href',
      'https://example.com',
    );
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('href', '/backup');
  });
});
