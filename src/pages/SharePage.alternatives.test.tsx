import './SharePage.testSupport';
import {
  chooseCourse,
  given,
  mockBuildCourseFile,
  mockCourse,
  otherWay,
  render,
  sharePageState,
} from './SharePage.testSupport';
import { describe, expect, it } from 'vitest';
import { StrictMode } from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { downloadTextFile } from '../db/export';
import { SharePage } from './SharePage';
import { buildCourseShareCode } from '../db/share';
import { publishCourse } from '../db/courseRepository';
import type { Card } from '../db/types';

describe('SharePage alternatives', () => {
  it('generates share codes after StrictMode replays the mount effect', async () => {
    given(mockCourse);
    render(
      <StrictMode>
        <SharePage />
      </StrictMode>,
    );
    otherWay('Share code');
    fireEvent.click(screen.getByRole('button', { name: 'Create share code' }));
    expect(await screen.findByRole('textbox', { name: 'Generated share code' })).toHaveValue(
      'LAC2-test-code',
    );
  });

  it('moves focus from a generated code action to its output', async () => {
    given(mockCourse);
    render(<SharePage />);
    otherWay('Share code');
    const create = screen.getByRole('button', { name: 'Create share code' });
    create.focus();
    fireEvent.click(create);
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Generated share code' })).toHaveFocus(),
    );
  });

  it('saves the course as a file', async () => {
    given(mockCourse);
    mockBuildCourseFile.mockResolvedValue('course file contents');
    render(<SharePage />);
    otherWay('Course file');
    fireEvent.click(screen.getByRole('button', { name: 'Save course file' }));
    await waitFor(() =>
      expect(downloadTextFile).toHaveBeenCalledWith(
        'course file contents',
        'Test Course.lacuna',
        'application/json',
      ),
    );
    expect(mockBuildCourseFile).toHaveBeenCalledWith(mockCourse.id);
  });

  it('opens one other way at a time, closes it on a second press, and keeps outputs', async () => {
    given(mockCourse);
    sharePageState.mockCourseCards = [
      { conceptId: 'concept-export-card', front: 'Question', back: 'Answer' } as Card,
    ];
    render(<SharePage />);
    otherWay('Share code');
    expect(screen.getByRole('button', { name: 'Share code' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create share code' }));
    expect(await screen.findByRole('textbox', { name: 'Generated share code' })).toHaveValue(
      'LAC2-test-code',
    );

    otherWay('Plain text');
    expect(screen.queryByRole('textbox', { name: 'Generated share code' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export cards as plain text' }));
    expect(screen.getByRole('textbox', { name: 'Generated plain-text export' })).toHaveValue(
      'card front\tcard back',
    );

    otherWay('Share code');
    expect(screen.getByRole('textbox', { name: 'Generated share code' })).toHaveValue(
      'LAC2-test-code',
    );
    otherWay('Share code');
    expect(screen.queryByRole('textbox', { name: 'Generated share code' })).not.toBeInTheDocument();
  });

  it('creates a QR code', async () => {
    given(mockCourse);
    render(<SharePage />);
    otherWay('QR code');
    fireEvent.click(screen.getByRole('button', { name: 'Create QR code' }));
    expect(await screen.findByTestId('qr-code')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'QR code text' })).toHaveValue('LAC2-qr-code');
  });

  it('keeps outputs for the same course and clears them for another', async () => {
    const other = { ...mockCourse, id: 'course-2', name: 'Other Course' };
    given(mockCourse, other);
    render(<SharePage />);
    otherWay('Share code');
    fireEvent.click(screen.getByRole('button', { name: 'Create share code' }));
    await screen.findByRole('textbox', { name: 'Generated share code' });

    chooseCourse('Test Course');
    expect(screen.getByRole('textbox', { name: 'Generated share code' })).toBeInTheDocument();

    chooseCourse('Other Course');
    expect(screen.queryByRole('textbox', { name: 'Generated share code' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Course to share' })).toHaveTextContent(
      'Other Course',
    );
  });

  it('warns that a code drops media and names the affected cards', () => {
    given(mockCourse);
    sharePageState.mockCourseCards = [
      {
        id: 'media-card',
        conceptId: 'concept-media-card',
        front: 'What is shown? lacuna-asset://' + 'a'.repeat(64),
        back: 'Answer',
      } as Card,
    ];
    render(<SharePage />);
    expect(screen.queryByText(/won.t be included/)).not.toBeInTheDocument();
    otherWay('Share code');
    expect(screen.getByText(/Media in 1 card won.t be included/)).toBeInTheDocument();
    expect(screen.getByText('What is shown?')).toBeInTheDocument();
    otherWay('Course file');
    expect(screen.queryByText(/won.t be included/)).not.toBeInTheDocument();
  });

  it('counts an occlusion card as media even though its diagram is not in the card text', () => {
    given(mockCourse);
    sharePageState.mockCourseCards = [
      {
        id: 'occlusion-card',
        conceptId: 'concept-occlusion-card',
        front: 'Label 1 of 3 — Plant cell',
        back: 'Label 1 of 3 — Plant cell\n\nNucleus',
        occlusionRegionId: 'region-1',
      } as Card,
    ];
    render(<SharePage />);
    otherWay('QR code');
    expect(screen.getByText(/Media in 1 card/)).toBeInTheDocument();
    expect(screen.getByText('Label 1 of 3 — Plant cell')).toBeInTheDocument();
  });

  it('does not warn about media when the course has none', () => {
    given(mockCourse);
    sharePageState.mockCourseCards = [
      { conceptId: 'concept-plain-card', front: 'Plain text', back: 'Answer' } as Card,
    ];
    render(<SharePage />);
    otherWay('Share code');
    expect(screen.queryByText(/Media in/)).not.toBeInTheDocument();
  });

  it('offers publishing for a course that has never been published', async () => {
    given(mockCourse);
    render(<SharePage />);
    otherWay('Share code');
    expect(
      screen.getByText('Unpublished copies won’t receive your later edits.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Publish course' }));
    await waitFor(() => expect(publishCourse).toHaveBeenCalledWith(mockCourse.id));
  });

  it('shows the published revision and refreshes an existing code on update', async () => {
    given({
      ...mockCourse,
      distribution: { lineageId: 'lineage-1', revision: 3, publishedAt: Date.now() - 60_000 },
    });
    render(<SharePage />);
    otherWay('Share code');
    expect(screen.getByText(/^Revision 3 · published/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create share code' }));
    await screen.findByRole('textbox', { name: 'Generated share code' });
    fireEvent.click(screen.getByRole('button', { name: 'Publish update' }));
    await waitFor(() => expect(buildCourseShareCode).toHaveBeenCalledTimes(2));
  });
});
