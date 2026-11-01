import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { Landing } from '../../pages/Landing';
import { LIBRARY_ORIGIN } from '../../config/origins';

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

it('shows local product screenshots without video playback controls', () => {
  const { container } = render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
  expect(screen.getByRole('img', { name: /Lacuna revision dashboard/ })).toHaveAttribute(
    'src',
    '/landing/films/student.webp',
  );
  expect(screen.getByRole('img', { name: /Gaps class report/ })).toHaveAttribute(
    'src',
    '/landing/films/gaps.webp',
  );
  expect(container.querySelector('video')).toBeNull();
  expect(screen.queryByRole('button', { name: /Watch/ })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open Gaps' })).toHaveAttribute(
    'href',
    'https://gaps.getlacuna.app',
  );
});
