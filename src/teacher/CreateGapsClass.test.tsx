import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { CreateGapsClass } from './CreateGapsClass';

it.each(['weak', 'mismatch'])('associates %s passphrase feedback with its input', (kind) => {
  render(<CreateGapsClass onConnected={() => undefined} />);
  fireEvent.change(screen.getByLabelText('Course link or code'), {
    target: { value: 'a'.repeat(32) },
  });
  const phrase = screen.getByLabelText(/^Connection passphrase/);
  const repeat = screen.getByLabelText('Repeat connection passphrase');
  fireEvent.change(phrase, {
    target: { value: kind === 'weak' ? 'short' : 'several separate words for this connection' },
  });
  fireEvent.change(repeat, { target: { value: 'different' } });
  fireEvent.submit(screen.getByRole('form', { name: 'Create class from a course link' }));
  const invalid = kind === 'weak' ? phrase : repeat;
  expect(invalid).toHaveAttribute('aria-invalid', 'true');
  expect(invalid).toHaveAccessibleDescription(kind === 'weak' ? /16 characters/ : /do not match/);
});
