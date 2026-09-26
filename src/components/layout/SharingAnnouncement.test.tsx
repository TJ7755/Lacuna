import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SharingAnnouncement } from './SharingAnnouncement';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const mount = () =>
  render(
    <MemoryRouter>
      <SharingAnnouncement />
    </MemoryRouter>,
  );

it('shows the chosen copy and remains visible across visits until dismissed', () => {
  const first = mount();
  expect(screen.getByText('One link to share it all')).toBeTruthy();
  expect(screen.queryByText('Better, together')).toBeNull();
  first.unmount();
  const second = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement' }));
  second.unmount();
  mount();
  expect(screen.queryByRole('region', { name: 'New sharing features' })).toBeNull();
});

it('dismisses and directs the sharing action to the highlighted link control', () => {
  const first = mount();
  const link = screen.getByRole('link', { name: /Explore sharing/ });
  expect(link.getAttribute('href')).toBe('/share?highlight=share-link');
  fireEvent.click(link);
  first.unmount();
  mount();
  expect(screen.queryByRole('region', { name: 'New sharing features' })).toBeNull();
});

it('honours dismissal in another tab', () => {
  mount();
  localStorage.setItem('lacuna-sharing-announcement-v1-dismissed', '1');
  fireEvent(
    window,
    new StorageEvent('storage', { key: 'lacuna-sharing-announcement-v1-dismissed' }),
  );
  expect(screen.queryByRole('region', { name: 'New sharing features' })).toBeNull();
});

it('still renders and dismisses when storage is unavailable', () => {
  const initial = mount();
  initial.unmount();
  const getItem = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
    throw new Error('Unavailable');
  });
  const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('Unavailable');
  });
  const unavailable = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement' }));
  expect(screen.queryByRole('region', { name: 'New sharing features' })).toBeNull();
  unavailable.unmount();
  mount();
  expect(getItem).toHaveBeenCalled();
  expect(setItem).toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: 'New sharing features' })).toBeNull();
});
