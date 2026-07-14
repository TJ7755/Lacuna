import { describe, expect, it } from 'vitest';
import { hasCloze, nextClozeIndex, renderClozeBack, renderClozeFront } from './cloze';

describe('hasCloze', () => {
  it('detects cloze notation and rejects ordinary or incomplete text', () => {
    expect(hasCloze('The answer is {{c1::forty-two}}.')).toBe(true);
    expect(hasCloze('The answer is forty-two.')).toBe(false);
    expect(hasCloze('The answer is {{c1::forty-two}.')).toBe(false);
  });

  it('does not retain regular-expression state between calls', () => {
    const source = '{{c1::one}} and {{c2::two}}';

    expect(hasCloze(source)).toBe(true);
    expect(hasCloze(source)).toBe(true);
  });
});

describe('renderClozeFront', () => {
  it('renders unhinted and hinted blanks while retaining surrounding text', () => {
    expect(renderClozeFront('A {{c1::mitochondrion}} is the {{c2::powerhouse::role}}.')).toBe(
      'A <span class="cloze-blank">[...]</span> is the <span class="cloze-blank">[role]</span>.',
    );
  });

  it('escapes HTML in hints', () => {
    expect(renderClozeFront('{{c1::answer::<look & think>}}')).toBe(
      '<span class="cloze-blank">[&lt;look &amp; think&gt;]</span>',
    );
  });
});

describe('renderClozeBack', () => {
  it('reveals every answer regardless of index order', () => {
    expect(renderClozeBack('{{c4::four}}, {{c1::one}}, {{c4::again}}')).toBe(
      '<span class="cloze-reveal">four</span>, <span class="cloze-reveal">one</span>, <span class="cloze-reveal">again</span>',
    );
  });

  it('escapes HTML in revealed answers and omits hints', () => {
    expect(renderClozeBack('{{c1::<strong>safe & sound</strong>::formatting}}')).toBe(
      '<span class="cloze-reveal">&lt;strong&gt;safe &amp; sound&lt;/strong&gt;</span>',
    );
  });

  it('supports multiline answers and hints', () => {
    const source = 'Before {{c2::line one\nline two::first\nsecond}} after';

    expect(renderClozeFront(source)).toBe(
      'Before <span class="cloze-blank">[first\nsecond]</span> after',
    );
    expect(renderClozeBack(source)).toBe(
      'Before <span class="cloze-reveal">line one\nline two</span> after',
    );
  });
});

describe('nextClozeIndex', () => {
  it('starts at one without clozes', () => {
    expect(nextClozeIndex('No clozes')).toBe(1);
  });

  it('uses one above the highest index for multiple non-sequential clozes', () => {
    expect(nextClozeIndex('{{c2::two}} {{c7::seven}} {{c3::three}}')).toBe(8);
  });
});
