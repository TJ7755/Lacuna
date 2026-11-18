import './SharePage.testSupport';
import {
  chooseCourse,
  expectShareLinkRevision,
  given,
  linked,
  mockCourse,
  mockSummary,
  render,
  sharePageState,
} from './SharePage.testSupport';
import { expectAppDestination } from '../../../../tests/helpers/expectAppDestination';
import { describe, expect, it } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { SharePage } from './SharePage';

describe('SharePage', () => {
  describe('initial course selection', () => {
    const archived = { ...mockCourse, id: 'archived', name: 'Archived course', archived: true };
    const active = { ...mockCourse, id: 'active', name: 'Active course' };
    const shared = { ...linked('a'.repeat(32), 1), name: 'Shared course' };
    const archivedShared = {
      ...shared,
      id: 'archived-shared',
      name: 'Archived shared',
      archived: true,
    };

    it.each([
      [[archived, active, shared], 'active', 'Active course'],
      [[archived, active, shared], null, 'Shared course'],
      [[archived, active], 'missing', 'Active course'],
      [[archivedShared, active], null, 'Active course'],
      [[archivedShared, shared], null, 'Shared course'],
      [[archivedShared, active], archivedShared.id, 'Archived shared (Archived)'],
      [[archived, archivedShared], null, 'Archived shared (Archived)'],
    ] as const)('selects %s with request %s as %s', (courses, requested, expected) => {
      given(...courses);
      sharePageState.mockSearchParams = new URLSearchParams(
        requested ? { courseId: requested } : {},
      );
      render(<SharePage />);
      expect(screen.getByRole('button', { name: 'Course to share' })).toHaveTextContent(expected);
    });
  });

  it('marks archived courses in the picker and keeps their status visible after selection', () => {
    const archived = { ...mockCourse, id: 'archived', name: 'Old course', archived: true };
    given(archived, mockCourse);
    render(<SharePage />);
    const picker = screen.getByRole('button', { name: 'Course to share' });
    expect(picker).toHaveTextContent('Test Course');
    expect(picker).not.toHaveTextContent('Archived');
    fireEvent.click(picker);
    const archivedItem = screen.getByRole('menuitem', { name: /^Old course \(Archived\)/ });
    expect(archivedItem).toHaveTextContent('1 lesson, 1 card');
    expect(screen.getByRole('menuitem', { name: /^Test Course/ })).not.toHaveTextContent(
      'Archived',
    );
    fireEvent.click(archivedItem);
    expect(picker).toHaveTextContent('Old course (Archived)');
  });

  it('marks an archived course opened directly from its sharing URL', () => {
    given(mockCourse, { ...mockCourse, id: 'archived', name: 'Old course', archived: true });
    sharePageState.mockSearchParams = new URLSearchParams('courseId=archived');
    render(<SharePage />);
    expect(screen.getByRole('button', { name: 'Course to share' })).toHaveTextContent(
      'Old course (Archived)',
    );
  });

  it('marks the course as archived when it is the only course', () => {
    given({ ...mockCourse, archived: true });
    render(<SharePage />);
    expect(within(screen.getByRole('banner')).getByRole('paragraph')).toHaveTextContent(
      'Test Course (Archived)',
    );
    expect(screen.queryByRole('button', { name: 'Course to share' })).not.toBeInTheDocument();
  });

  it('keeps sharing frames mounted through rapid linked, unlinked and empty course switches', async () => {
    const shared = linked('e'.repeat(32), 1);
    const unlinked = { ...mockCourse, id: 'unlinked', name: 'Unlinked course' };
    const empty = { ...mockCourse, id: 'empty', name: 'Empty course' };
    given(shared, unlinked, empty);
    sharePageState.mockSummaries![empty.id] = { ...mockSummary, cardCount: 0, lessonCount: 0 };
    render(<SharePage />);
    await expectShareLinkRevision(1);
    const surface = screen.getByRole('region', { name: 'Share link' }).closest('section');
    const alternatives = screen.getByRole('region', { name: 'Other ways' });
    for (const name of ['Unlinked course', 'Empty course', 'Test Course', 'Empty course']) {
      chooseCourse(name);
      expect(screen.getByRole('region', { name: 'Other ways' })).toBe(alternatives);
      expect(screen.getByRole('region', { name: 'Share link' }).closest('section')).toBe(surface);
      expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();
      if (name !== 'Test Course') {
        expect(screen.getByRole('button', { name: 'Create share link' })).toBeEnabled();
        expect(screen.queryByRole('button', { name: 'Update link' })).not.toBeInTheDocument();
      }
    }
  });

  it('opens on a course with the share link as the one primary action', () => {
    given(mockCourse);
    render(<SharePage />);
    expect(screen.getByRole('heading', { name: 'Share link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create share link' })).toBeEnabled();
    expect(screen.getByText('Test Course')).toBeInTheDocument();
    // One course needs no picker, and the alternatives stay folded away.
    expect(screen.queryByRole('button', { name: 'Course to share' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create share code' })).not.toBeInTheDocument();
  });

  it('leaves receiving to the Import page', () => {
    given(mockCourse);
    render(<SharePage />);
    expect(screen.queryByText('Import a shared course')).not.toBeInTheDocument();
  });

  it('opens on the requested course from a courseId query', () => {
    const other = { ...mockCourse, id: 'course-2', name: 'Other Course' };
    given(mockCourse, other);
    sharePageState.mockSearchParams = new URLSearchParams('courseId=course-2');
    render(<SharePage />);
    expect(screen.getByRole('button', { name: 'Course to share' })).toHaveTextContent(
      'Other Course',
    );
  });

  it('follows a later courseId query after a manual pick', () => {
    const other = { ...mockCourse, id: 'course-2', name: 'Other Course' };
    given(mockCourse, other);
    const view = render(<SharePage />);
    // A manual pick sticks while the query is unchanged.
    chooseCourse('Other Course');
    expect(screen.getByRole('button', { name: 'Course to share' })).toHaveTextContent(
      'Other Course',
    );
    // A later ?courseId= navigation overrides the manual pick.
    sharePageState.mockSearchParams = new URLSearchParams('courseId=course-1');
    view.rerender(<SharePage />);
    expect(screen.getByRole('button', { name: 'Course to share' })).toHaveTextContent(
      'Test Course',
    );
  });

  it('renders nothing but the frame while courses load', () => {
    render(<SharePage />);
    expect(screen.getByRole('heading', { name: 'Share' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Share link' })).not.toBeInTheDocument();
  });

  it('points to Today when there is nothing to share', () => {
    given();
    render(<SharePage />);
    expect(screen.getByRole('heading', { name: 'Nothing to share yet' })).toBeInTheDocument();
    expectAppDestination(screen.getByRole('link', { name: 'Create a course on Today' }), '/');
  });

  it('lists each course with its size in the picker', () => {
    given(mockCourse, { ...mockCourse, id: 'course-2', name: 'Other Course' });
    render(<SharePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Course to share' }));
    expect(screen.getByRole('menuitem', { name: /^Test Course/ })).toHaveTextContent(
      '1 lesson, 1 card',
    );
  });
});
