import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardImportDialog } from './CardImportDialog';
import type { ApkgImportResult } from '../../db/apkgImport';

const mocks = vi.hoisted(() => ({ parseApkg: vi.fn(), duplicates: vi.fn() }));
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
  await screen.findByRole('button', { name: 'Undo' });
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
    fireEvent.click(screen.getByRole('checkbox', { name: 'Also create reverse' }));
    expect(screen.getByRole('button', { name: 'Import 2 cards' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByLabelText('Paste your cards')).toHaveValue('bonjour\thello');
    expect(screen.getByLabelText('Lesson title')).toHaveValue('Greetings');
    expect(screen.getByLabelText('Format')).toHaveValue('tsv');
    expect(onImport).not.toHaveBeenCalled();
    await review();
    expect(screen.getByRole('checkbox')).toBeChecked();
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
    fireEvent.click(screen.getByRole('checkbox'));
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
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Import 5002 cards' })).toBeDisabled();
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
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 cards' }));
    fireEvent.click(screen.getByRole('button', { name: 'Importing…' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
    expect(onImport).toHaveBeenCalledTimes(1);
    reject(new Error('Storage full'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage full');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
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
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await screen.findByText('CARDS.APKG');
    await review();
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 cards' }));
    await waitFor(() => expect(onImport).toHaveBeenCalledWith({ kind: 'apkg', result }, ''));
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
