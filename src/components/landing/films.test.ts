import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('../../config/origins');
  vi.resetModules();
});

it('uses the configured media origin for both films without changing their file paths', async () => {
  vi.doMock('../../config/origins', () => ({ LANDING_FILM_ORIGIN: 'https://media.example.test' }));
  const { landingFilms } = await import('./films');

  expect(landingFilms.student.externalSrc).toBe(
    'https://media.example.test/films/2026-10/lacuna-student-4k.mp4',
  );
  expect(landingFilms.gaps.externalSrc).toBe(
    'https://media.example.test/films/2026-10/gaps-teachers-tutors-4k.mp4',
  );
  expect(landingFilms.student.src).toBe('/films/lacuna-student-4k.mp4');
  expect(landingFilms.gaps.src).toBe('/films/gaps-teachers-tutors-4k.mp4');
});
