import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { createCourse } from '../../db/courseRepository';
import { db } from '../../db/schema';
import {
  paperSpecification,
  paperSpecificationReference,
} from '../../specifications/paperFixture.testFixtures';
import { CourseSpecificationSection } from './CourseSpecificationSection';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

it('offers a sole tier and route in a cancellable draft without persisting them on arrival', async () => {
  const course = await createCourse('Science', {
    specificationData: { ...paperSpecification, tiers: [paperSpecification.tiers[0]] },
    specificationRef: { specificationId: paperSpecification.id, extra: 'Preserve additive fields' },
  });
  render(<CourseSpecificationSection course={course} />);
  fireEvent.click(screen.getByRole('button', { name: 'Change selection' }));
  expect(screen.getByRole('combobox', { name: 'Tier' })).toHaveValue('higher');
  expect(screen.getByRole('checkbox', { name: 'Written papers' })).toBeChecked();
  expect((await db.courses.get(course.id))?.specificationRef).toEqual(course.specificationRef);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect((await db.courses.get(course.id))?.specificationRef).toEqual(course.specificationRef);
  fireEvent.click(screen.getByRole('button', { name: 'Change selection' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save selection' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Save selection' }));
  await waitFor(async () =>
    expect((await db.courses.get(course.id))?.specificationRef).toEqual({
      ...paperSpecificationReference,
      extra: 'Preserve additive fields',
    }),
  );
});

it('requires a fresh preview if the supplied selection changes while editing', async () => {
  const course = await createCourse('Science', {
    specificationData: paperSpecification,
    specificationRef: paperSpecificationReference,
  });
  const view = render(<CourseSpecificationSection course={course} />);
  fireEvent.click(screen.getByRole('button', { name: 'Change selection' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Tier' }), {
    target: { value: 'foundation' },
  });
  view.rerender(
    <CourseSpecificationSection
      course={{
        ...course,
        specificationRef: { ...paperSpecificationReference, tier: 'foundation' },
      }}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The course specification changed while editing.',
  );
  expect(screen.getByRole('button', { name: 'Save selection' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'Change selection' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save selection' })).toBeEnabled());
});

it('retains unknown tier and route choices until the author explicitly repairs them', async () => {
  const course = await createCourse('Science', {
    specificationData: paperSpecification,
    specificationRef: paperSpecificationReference,
  });
  const reference = {
    ...paperSpecificationReference,
    tier: 'retired-tier',
    routeIds: ['retired-route'],
  };
  // Older or independently restored references may outlive their supplied options.
  await db.courses.update(course.id, { specificationRef: reference });
  render(<CourseSpecificationSection course={{ ...course, specificationRef: reference }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Change selection' }));
  expect(
    screen.getByRole('option', { name: 'Unavailable tier: retired-tier' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Unavailable route: retired-route' })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Save selection' })).toBeDisabled();
  expect((await db.courses.get(course.id))?.specificationRef).toEqual(reference);
  fireEvent.change(screen.getByRole('combobox', { name: 'Tier' }), { target: { value: 'higher' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Written papers' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Unavailable route: retired-route' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save selection' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Save selection' }));
  await waitFor(async () =>
    expect((await db.courses.get(course.id))?.specificationRef).toEqual(
      paperSpecificationReference,
    ),
  );
});

it('surfaces a concurrent ownership rejection and leaves the draft and stored selection intact', async () => {
  const course = await createCourse('Science', {
    specificationData: paperSpecification,
    specificationRef: paperSpecificationReference,
  });
  const view = render(<CourseSpecificationSection course={course} />);
  fireEvent.click(screen.getByRole('button', { name: 'Change selection' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Tier' }), {
    target: { value: 'foundation' },
  });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save selection' })).toBeEnabled());
  const distributedCopy = {
    lineageId: 'publisher',
    revision: 1,
    locked: true,
    autoAcceptUpdates: true,
  };
  await db.courses.update(course.id, { distributedCopy });
  fireEvent.click(screen.getByRole('button', { name: 'Save selection' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This published course is locked.');
  expect(screen.getByRole('combobox', { name: 'Tier' })).toHaveValue('foundation');
  expect((await db.courses.get(course.id))?.specificationRef).toEqual(paperSpecificationReference);
  view.rerender(<CourseSpecificationSection course={{ ...course, distributedCopy }} />);
  expect(screen.getByRole('button', { name: 'Save selection' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('button', { name: 'Change selection' })).toBeDisabled();
  expect(screen.getByText(/The publisher owns its specification selection/)).toBeVisible();
});
