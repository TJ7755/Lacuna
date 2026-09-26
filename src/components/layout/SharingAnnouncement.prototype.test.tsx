import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { SharingAnnouncementPrototype } from './SharingAnnouncement.prototype';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function mount(variant = 'A') {
  return render(
    <MemoryRouter initialEntries={[`/?variant=${variant}`]}>
      <SharingAnnouncementPrototype />
    </MemoryRouter>,
  );
}

it('remembers dismissal across visits and offers a deliberate preview reset', () => {
  const first = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement' }));
  first.unmount();
  mount();
  expect(screen.queryByRole('region', { name: 'New sharing features' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show again' }));
  expect(screen.getByRole('region', { name: 'New sharing features' })).toBeTruthy();
});

it.each(['A', 'B', 'C'])('takes option %s to the existing Share page', (variant) => {
  mount(variant);
  expect(screen.getByRole('link', { name: /Explore sharing/ }).getAttribute('href')).toBe('/share');
});

it('switches designs with the keyboard without stealing typing keys', () => {
  mount();
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  expect(screen.getByText('B · The invitation')).toBeTruthy();
});
