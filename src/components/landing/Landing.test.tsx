import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { Landing } from '../../pages/Landing';

vi.mock('../welcome/useSmoothScroll', () => ({ useSmoothScroll: vi.fn() }));

const headings = [
  'Scheduled for your exam, not for ever.',
  'One number, and it means something.',
  "Did you know it? That's the whole question.",
  'Practise the exam, not just the facts.',
  'Yours, on your device.',
  'A few questions.',
  'Your exam has a date. Start there.',
];

it('renders the exact below-hero headings in order', () => {
  render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
  expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual(
    headings,
  );
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
  expect(visuals).toHaveLength(4);
  for (const visual of visuals) {
    expect(visual).toHaveAttribute('aria-hidden', 'true');
    expect(visual.querySelector('button, a, input, textarea, [tabindex]')).toBeNull();
  }
  expect(container.querySelectorAll('.landing-faq details')).toHaveLength(3);
});
