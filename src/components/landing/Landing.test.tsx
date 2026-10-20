import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { Landing } from '../../pages/Landing';

vi.mock('../welcome/useSmoothScroll', () => ({ useSmoothScroll: vi.fn() }));

it('keeps branding in the navigation and hero artwork limited to revision illustrations', () => {
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
  const nav = screen.getByRole('navigation', { name: 'Landing navigation' });
  expect(nav.querySelector('.landing-brand svg')).not.toBeNull();
  const hero = screen.getByRole('heading', { level: 1 }).closest('section')!;
  const standaloneArtwork = [...hero.querySelectorAll('svg')].filter(
    (svg) => !svg.closest('h1, a, button'),
  );
  expect(standaloneArtwork).toHaveLength(0);
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
