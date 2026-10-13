import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownView } from './MarkdownView';

const source = '![Diagram](https://example.com/diagram.png)';

describe('MarkdownView image enlargement', () => {
  it('keeps cached plain and enlarged render modes separate', () => {
    const plainFirst = render(<MarkdownView source={source} />);
    expect(plainFirst.container.querySelector('button[data-enlarge-image]')).toBeNull();
    plainFirst.unmount();

    const enlarged = render(<MarkdownView source={source} enlargeImages />);
    expect(screen.getByRole('button', { name: 'Enlarge image: Diagram' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge image: Diagram' }));
    expect(screen.getByRole('dialog', { name: 'Image' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close image' }));
    enlarged.unmount();

    const plainAgain = render(<MarkdownView source={source} />);
    expect(plainAgain.container.querySelector('img')).toHaveAttribute('alt', 'Diagram');
    expect(plainAgain.container.querySelector('button[data-enlarge-image]')).toBeNull();
  });

  it('keeps unsafe image URLs stripped in plain and enlarged render modes', () => {
    const malicious = '![Unsafe](javascript:alert%281%29)';
    const plain = render(<MarkdownView source={malicious} />);
    expect(plain.container.querySelector('img')?.getAttribute('src')).toBeNull();
    plain.unmount();

    render(<MarkdownView source={malicious} enlargeImages />);
    const trigger = screen.getByRole('button', { name: 'Enlarge image: Unsafe' });
    expect(trigger.querySelector('img')?.getAttribute('src')).toBeNull();
  });

  it('preserves linked-image navigation without nesting an enlarge button inside the link', () => {
    const { container } = render(
      <MarkdownView
        source="[![Linked diagram](https://example.com/diagram.png)](https://example.com/reference)"
        enlargeImages
      />,
    );

    const link = screen.getByRole('link', { name: 'Linked diagram' });
    expect(link).toHaveAttribute('href', 'https://example.com/reference');
    expect(within(link).getByRole('img', { name: 'Linked diagram' })).toBeInTheDocument();
    expect(container.querySelector('a button')).toBeNull();
  });

  it('toggles the enlarged diagram between fitted and actual-size modes', () => {
    render(<MarkdownView source={source} enlargeImages />);
    fireEvent.click(screen.getByRole('button', { name: 'Enlarge image: Diagram' }));

    const dialog = screen.getByRole('dialog', { name: 'Image' });
    const actualSize = within(dialog).getByRole('button', { name: 'Actual size' });
    expect(actualSize).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(actualSize);
    expect(within(dialog).getByRole('button', { name: 'Fit image' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('names images whose author left out the alt text', () => {
    const plain = render(<MarkdownView source={'<img src="https://example.com/a.png">'} />);
    expect(plain.container.querySelector('img')).toHaveAttribute('alt', 'Image');
    plain.unmount();

    render(
      <MarkdownView
        source="[![](https://example.com/a.png)](https://example.com/ref)"
        enlargeImages
      />,
    );
    expect(screen.getByRole('link', { name: 'Image' })).toHaveAttribute(
      'href',
      'https://example.com/ref',
    );
  });

  it('keeps an unnamed enlargeable image from announcing its file name', () => {
    const { container } = render(
      <MarkdownView source={'<img src="https://example.com/a.png">'} enlargeImages />,
    );
    expect(screen.getByRole('button', { name: 'Enlarge image' })).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
  });

  it('opens and closes the enlarged image from the keyboard', () => {
    render(<MarkdownView source={source} enlargeImages />);
    const trigger = screen.getByRole('button', { name: 'Enlarge image: Diagram' });

    // A native button activates on Enter or Space by dispatching a click.
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Image' });
    expect(within(dialog).getByRole('button', { name: 'Close image' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
