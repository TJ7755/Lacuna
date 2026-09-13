import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useStableCardHeight } from './useStableCardHeight';

afterEach(() => vi.restoreAllMocks());

it('measures layout height independently of an ancestor entrance scale', () => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.side === 'back' ? 500 : 200;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return { height: this.offsetHeight * 0.97 } as DOMRect;
  });
  function Card() {
    const { height, frontRef, backRef } = useStableCardHeight();
    return (
      <>
        <div ref={frontRef} data-side="front" />
        <div ref={backRef} data-side="back" />
        <output>{height}</output>
      </>
    );
  }
  render(<Card />);
  expect(screen.getByRole('status')).toHaveTextContent('500');
});
