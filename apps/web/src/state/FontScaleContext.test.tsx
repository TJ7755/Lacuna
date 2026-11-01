import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { FontScaleProvider, useFontScale } from './FontScaleContext';

function Consumer() {
  const { scale, setScale } = useFontScale();
  return (
    <>
      <output>{scale}</output>
      <button onClick={() => setScale(1.3)}>Larger</button>
    </>
  );
}

beforeEach(() => localStorage.clear());

it('retains the stored scale and writes changes under the existing key', () => {
  localStorage.setItem('lacuna-font-scale', '1.15');
  render(
    <FontScaleProvider>
      <Consumer />
    </FontScaleProvider>,
  );
  expect(screen.getByText('1.15')).toBeInTheDocument();
  expect(Number.parseFloat(document.documentElement.style.fontSize)).toBeCloseTo(115);
  fireEvent.click(screen.getByRole('button', { name: 'Larger' }));
  expect(localStorage.getItem('lacuna-font-scale')).toBe('1.3');
  expect(localStorage.getItem('lacuna-font-scale-user-set')).toBeNull();
});
