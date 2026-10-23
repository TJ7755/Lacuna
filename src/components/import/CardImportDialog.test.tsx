import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardImportDialog } from './CardImportDialog';
import { ImportDestination, useImportDestination } from './ImportDestination';
import type { ApkgImportResult } from '../../db/apkgImport';

const mocks = vi.hoisted(() => ({ parseApkg: vi.fn(), duplicates: vi.fn() }));
vi.mock('../../state/useCourseData', () => ({ useCourses: () => [], useLessons: () => [] }));
vi.mock('../../db/apkgImport', () => ({ parseApkg: mocks.parseApkg }));
vi.mock('../../db/cardRepository', () => ({ checkDuplicatesBatch: mocks.duplicates }));
vi.mock('../../state/motionSpeed', () => ({
  useMotionSpeed: () => ['normal'],
  speedMultiplier: () => 0,
}));
vi.mock('../cards/CardContent', () => ({
  CardContent: ({
    card,
    side,
  }: {
    card: { front: string; back: string };
    side: 'front' | 'back';
  }) => <div>{card[side]}</div>,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.duplicates.mockResolvedValue(new Set());
});
function paste(value = 'bonjour\thello\n{{c1::Paris}} is in France\t') {
  fireEvent.change(screen.getByLabelText('Paste your cards'), { target: { value } });
}
async function review() {
  fireEvent.click(screen.getByRole('button', { name: 'Review cards' }));
  await screen.findByRole('button', { name: 'Back' });
}

describe('CardImportDialog', () => {
  it('Undo returns to input and retains title, text, format and reverse choice without writing', async () => {
    const onImport = vi.fn();
    render(
      <CardImportDialog
        titleLabel="Lesson title"
        initialTitle="Greetings"
        onCancel={vi.fn()}
        onImport={onImport}
      />,
    );
    paste('bonjour\thello');
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'tsv' } });
    await review();
    fireEvent.click(screen.getByRole('switch', { name: 'Also create reverse' }));
    expect(screen.getByRole('button', { name: 'Import 2 cards' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByLabelText('Paste your cards')).toHaveValue('bonjour\thello');
    expect(screen.getByLabelText('Lesson title')).toHaveValue('Greetings');
    expect(screen.getByLabelText('Format')).toHaveValue('tsv');
    expect(onImport).not.toHaveBeenCalled();
    await review();
    expect(screen.getByRole('switch')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 cards' }));
    await waitFor(() =>
      expect(onImport).toHaveBeenCalledWith(
        {
          kind: 'text',
          cards: [{ type: 'front_back', front: 'bonjour', back: 'hello' }],
          reverse: true,
        },
        'Greetings',
      ),
    );
  });
  it('excludes cloze cards and checks generated reverses for duplicates', async () => {
    render(
      <CardImportDialog
        targetName="French"
        schedulingUnitId="unit"
        onCancel={vi.fn()}
        onImport={vi.fn()}
      />,
    );
    paste();
    await review();
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('button', { name: 'Import 3 cards' })).toBeEnabled();
    await waitFor(() =>
      expect(mocks.duplicates).toHaveBeenLastCalledWith(
        'unit',
        expect.arrayContaining([expect.objectContaining({ front: 'hello', back: 'bonjour' })]),
      ),
    );
  });
  it('blocks generated totals above the import limit', async () => {
    render(<CardImportDialog targetName="French" onCancel={vi.fn()} onImport={vi.fn()} />);
    paste(Array.from({ length: 2501 }, (_, i) => `${i}\tanswer`).join('\n'));
    await review();
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('button', { name: 'Import 5,002 cards' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('5,002');
  });
  it('keeps failures retryable and blocks closing or double submission while saving', async () => {
    let reject!: (reason: Error) => void;
    const onImport = vi.fn(
      () =>
        new Promise<void>((_, no) => {
          reject = no;
        }),
    );
    const onCancel = vi.fn();
    render(<CardImportDialog targetName="French" onCancel={onCancel} onImport={onImport} />);
    paste('Q\tA');
    await review();
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 card' }));
    fireEvent.click(screen.getByRole('button', { name: 'Importing…' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
    expect(onImport).toHaveBeenCalledTimes(1);
    reject(new Error('Storage full'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage full');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByLabelText('Paste your cards')).toHaveValue('Q\tA');
  });
  it('retains the Anki package through Undo and does not offer automatic reverses', async () => {
    const result = {
      deckName: 'Anki',
      cards: [{ type: 'front_back', front: 'Q', back: 'A' }],
      media: new Map(),
      skippedCards: 0,
      skippedNotes: 0,
    } as ApkgImportResult;
    mocks.parseApkg.mockResolvedValue(result);
    const onImport = vi.fn();
    render(<CardImportDialog targetName="French" onCancel={vi.fn()} onImport={onImport} />);
    fireEvent.change(screen.getByLabelText('Upload cards'), {
      target: { files: [new File(['test'], 'CARDS.APKG')] },
    });
    await screen.findByText('CARDS.APKG');
    await review();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByText('CARDS.APKG');
    await review();
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 card' }));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith({ kind: 'apkg', result }, ''));
  });
  it('leaves the title and close to the Import page when shown on it', () => {
    render(
      <CardImportDialog
        presentation="page"
        targetName="French"
        onCancel={vi.fn()}
        onImport={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Close import' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Import cards' })).toHaveClass('sr-only');
  });
  it('wraps keyboard focus within the dialogue in both directions', () => {
    render(<CardImportDialog targetName="French" onCancel={vi.fn()} onImport={vi.fn()} />);
    paste('Q\tA');
    const first = screen.getByRole('button', { name: 'Close import' });
    const last = screen.getByRole('button', { name: 'Review cards' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });
  it('requires a title only for new destinations', () => {
    render(<CardImportDialog titleLabel="Course title" onCancel={vi.fn()} onImport={vi.fn()} />);
    paste('Q\tA');
    expect(screen.getByRole('button', { name: 'Review cards' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Course title'), { target: { value: 'French' } });
    expect(screen.getByRole('button', { name: 'Review cards' })).toBeEnabled();
  });
});

it('supports an inline review with destination validation and preserves input on Undo', async () => {
  const onImport = vi.fn();
  render(
    <CardImportDialog
      presentation="page"
      onCancel={vi.fn()}
      onImport={onImport}
      canImport={false}
      reviewOptions={<p>Choose a destination</p>}
    />,
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  paste('bonjour\thello');
  await review();
  expect(screen.getByText('Choose a destination')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Import 1 card' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(await screen.findByLabelText('Paste your cards')).toHaveValue('bonjour\thello');
  expect(onImport).not.toHaveBeenCalled();
});

function DestinationPanel({ onImport }: { onImport: () => Promise<void> }) {
  const draft = useImportDestination();
  return (
    <CardImportDialog
      presentation="panel"
      onCancel={vi.fn()}
      onImport={onImport}
      canImport={!!draft.destination}
      reviewOptions={<ImportDestination draft={draft} />}
    />
  );
}

async function chooseDestination(onImport = vi.fn().mockResolvedValue(undefined)) {
  render(<DestinationPanel onImport={onImport} />);
  paste('bonjour\thello');
  await review();
  fireEvent.click(screen.getByRole('button', { name: 'Choose destination' }));
  const title = await screen.findByLabelText('Course title');
  fireEvent.change(title, { target: { value: 'French vocabulary' } });
  title.focus();
  return { title, onImport };
}

it('tabs directly from a valid destination title to Import', async () => {
  const { title } = await chooseDestination();
  fireEvent.keyDown(title, { key: 'Tab' });
  expect(screen.getByRole('button', { name: 'Import 1 card' })).toHaveFocus();
});

it('imports once on plain Enter from the destination title, including repeated keys while busy', async () => {
  let finish!: () => void;
  const onImport = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { title } = await chooseDestination(onImport);
  fireEvent.keyDown(title, { key: 'Enter' });
  fireEvent.keyDown(title, { key: 'Enter' });
  expect(onImport).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Importing…' })).toBeDisabled();
  finish();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Import 1 card' })).toBeEnabled());
});

it.each([
  { key: 'Enter', isComposing: true },
  { key: 'Enter', keyCode: 229 },
  { key: 'Enter', shiftKey: true },
  { key: 'Enter', altKey: true },
  { key: 'Tab', shiftKey: true },
  { key: 'Tab', isComposing: true },
])('leaves composition and modified title keys alone: %j', async (key) => {
  const { title, onImport } = await chooseDestination();
  expect(fireEvent.keyDown(title, key)).toBe(true);
  expect(title).toHaveFocus();
  expect(onImport).not.toHaveBeenCalled();
});

it('does not shortcut an empty title or an invalid exam date', async () => {
  const { title, onImport } = await chooseDestination();
  fireEvent.change(title, { target: { value: '   ' } });
  expect(screen.getByRole('button', { name: 'Import 1 card' })).toBeDisabled();
  expect(fireEvent.keyDown(title, { key: 'Tab' })).toBe(true);
  fireEvent.keyDown(title, { key: 'Enter' });
  expect(onImport).not.toHaveBeenCalled();
  fireEvent.change(title, { target: { value: 'French' } });
  fireEvent.click(screen.getByRole('radio', { name: /Exam date/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Exam date and time' }));
  fireEvent.change(screen.getByLabelText('Hour'), { target: { value: '99' } });
  expect(screen.getByRole('button', { name: 'Import 1 card' })).toBeDisabled();
  title.focus();
  expect(fireEvent.keyDown(title, { key: 'Tab' })).toBe(true);
  fireEvent.keyDown(title, { key: 'Enter' });
  expect(onImport).not.toHaveBeenCalled();
});

it('leaves plain Enter in the earlier multiline entry alone', () => {
  const onImport = vi.fn();
  render(<DestinationPanel onImport={onImport} />);
  paste('bonjour\thello');
  expect(fireEvent.keyDown(screen.getByLabelText('Paste your cards'), { key: 'Enter' })).toBe(true);
  expect(screen.getByRole('button', { name: 'Review cards' })).toBeInTheDocument();
  expect(onImport).not.toHaveBeenCalled();
});
