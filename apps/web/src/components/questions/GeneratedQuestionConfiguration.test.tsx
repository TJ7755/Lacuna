import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { INTEGER_ROOT_QUADRATIC_DESCRIPTION } from '../../questions/generators/integerRootQuadratic';
import { GeneratedQuestionConfiguration } from './GeneratedQuestionConfiguration';

it('updates a boolean generator option through the standard switch without losing other fields', () => {
  const onChange = vi.fn();
  render(
    <GeneratedQuestionConfiguration
      generator={INTEGER_ROOT_QUADRATIC_DESCRIPTION}
      configuration={{
        minimumRootMagnitude: 1,
        maximumRootMagnitude: 9,
        maximumLeadingCoefficient: 1,
        allowRepeatedRoots: false,
      }}
      onChange={onChange}
    />,
  );
  const control = screen.getByRole('switch', { name: 'Allow repeated roots' });
  expect(control).not.toBeChecked();
  fireEvent.click(control);
  expect(onChange).toHaveBeenCalledWith({
    minimumRootMagnitude: 1,
    maximumRootMagnitude: 9,
    maximumLeadingCoefficient: 1,
    allowRepeatedRoots: true,
  });
});
