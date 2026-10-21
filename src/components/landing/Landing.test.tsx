import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { Landing } from '../../pages/Landing';
import { LIBRARY_ORIGIN } from '../../config/origins';
import { landingFilms } from './films';

vi.mock('../welcome/useSmoothScroll', () => ({ useSmoothScroll: vi.fn() }));

it('exposes the course library from navigation without leaving the app window', () => {
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
  const link = within(screen.getByRole('navigation', { name: 'Landing navigation' }))
    .getAllByRole('link')
    .find((anchor) => anchor.getAttribute('href') === LIBRARY_ORIGIN);
  expect(link).toBeDefined();
  expect(link).toHaveAccessibleName();
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

it('points discovery and keyboard skip at the first section', () => {
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
  const section = document.getElementById('how-it-works')!;
  expect(section).not.toBeNull();
  const scroll = vi.spyOn(section, 'scrollIntoView');
  const discover = screen.getByRole('link', { name: 'See how it works' });
  expect(discover).toHaveAttribute('href', '#how-it-works');
  fireEvent.click(discover);
  expect(section).toHaveFocus();
  expect(scroll).toHaveBeenCalled();
  const skip = screen.getByRole('link', { name: 'Skip to Lacuna' });
  expect(skip).toHaveAttribute('href', '#how-it-works');
  fireEvent.click(skip);
  expect(section).toHaveFocus();
});

it('keeps product visuals decorative and outside the tab order', () => {
  const { container } = render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
  const visuals = container.querySelectorAll('.landing-feature-visual');
  expect(visuals.length).toBeGreaterThan(0);
  for (const visual of visuals) {
    expect(visual).toHaveAttribute('aria-hidden', 'true');
    expect(visual.querySelector('button, a, input, textarea, [tabindex]')).toBeNull();
  }
});

it('loads only the film requested by the visitor', () => {
  const { container } = render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
  expect(container.querySelector('video')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Watch Gaps in action, 1 min 4 sec' }));
  const video = container.querySelector('video')!;
  expect(video).toHaveAttribute('preload', 'none');
  expect(video).toHaveAttribute('controls');
  expect(video).toHaveAttribute('playsinline');
  expect(video.getAttribute('src')).toContain('gaps');
  expect(
    screen.getByRole('button', { name: 'Watch Lacuna in action, 1 min 33 sec' }),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'Open Gaps' })).toHaveAttribute(
    'href',
    'https://gaps.getlacuna.app',
  );
});

it('offers a direct hosted film link when playback fails', () => {
  const { container } = render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Watch Gaps in action, 1 min 4 sec' }));
  fireEvent.error(container.querySelector('video')!);
  expect(screen.getByRole('link', { name: 'Open the video directly' })).toHaveAttribute(
    'href',
    'https://chpeihgcobr0gvsi.public.blob.vercel-storage.com/films/2026-10/gaps-teachers-tutors-4k.mp4',
  );
});

it.each(Object.values(landingFilms))(
  'replaces a failed $title player with its local poster',
  (film) => {
    const { container } = render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: `Watch ${film.title}, ${film.duration}` }));
    const video = container.querySelector('video')!;
    video.focus();
    fireEvent.error(video);

    expect(container.querySelector('video')).toBeNull();
    const fallback = screen.getByRole('status');
    expect(fallback).toBeVisible();
    expect(fallback).toHaveFocus();
    const poster = screen.getByRole('img', { name: film.title });
    expect(poster).toBeVisible();
    expect(poster).toHaveAttribute('src', film.poster);
    expect(screen.getByRole('link', { name: 'Open the video directly' })).toHaveAttribute(
      'href',
      film.externalSrc,
    );
    expect(screen.getByRole('link', { name: 'Open Gaps' })).toBeVisible();
  },
);

it('moves keyboard focus to the requested film player', () => {
  const { container } = render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
  const play = screen.getByRole('button', { name: 'Watch Gaps in action, 1 min 4 sec' });
  play.focus();
  fireEvent.click(play);
  expect(container.querySelector('video')).toHaveFocus();
});

it('does not steal focus when a film fails after the visitor moves on', () => {
  const { container } = render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
  const film = landingFilms.gaps;
  fireEvent.click(screen.getByRole('button', { name: `Watch ${film.title}, ${film.duration}` }));
  const link = screen.getByRole('link', { name: 'Open Gaps' });
  link.focus();
  fireEvent.error(container.querySelector('video')!);
  expect(link).toHaveFocus();
  expect(screen.getByRole('status')).toBeVisible();
});

it('opens desktop films directly outside the app service worker', () => {
  vi.stubGlobal('electronAPI', { isElectron: true });
  const open = vi.spyOn(window, 'open').mockImplementation(() => null);
  try {
    const { container } = render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Watch Gaps in action, 1 min 4 sec' }));
    expect(open).toHaveBeenCalledWith(
      'https://chpeihgcobr0gvsi.public.blob.vercel-storage.com/films/2026-10/gaps-teachers-tutors-4k.mp4',
      '_blank',
      'noopener,noreferrer',
    );
    expect(container.querySelector('video')).toBeNull();
  } finally {
    open.mockRestore();
    vi.unstubAllGlobals();
  }
});
