import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedbackSection } from './FeedbackSection';

afterEach(() => vi.unstubAllEnvs());

describe('FeedbackSection', () => {
  it.each(['', 'https://tally.so/r/form', '../form', 'form?school=private'])(
    'hides feedback when the configured form ID is absent or invalid: %s',
    (formId) => {
      vi.stubEnv('VITE_TALLY_FEEDBACK_FORM_ID', formId);
      render(<FeedbackSection />);
      expect(screen.queryByRole('region', { name: 'Feedback' })).not.toBeInTheDocument();
    },
  );
});
