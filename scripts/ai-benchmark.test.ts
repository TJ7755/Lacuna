import { describe, expect, it } from 'vitest';
import { AUDIT_FIXTURES } from './ai-benchmark-fixtures';
import { gradeAudit, runFixtureTool } from './ai-benchmark';

describe('source-grounded AI benchmark', () => {
  it('passes complete source-supported verdicts and actual corrections', () => {
    const fixture = AUDIT_FIXTURES[0];
    const quotes = [
      'Mitosis produces two genetically identical daughter cells.',
      'Meiosis produces four genetically different haploid cells.',
      'The nucleus contains the chromosomes.',
      'Ribosomes are the site of protein synthesis.',
    ];
    const text = JSON.stringify({
      cards: fixture.gold.map((gold, index) => ({
        cardId: gold.cardId,
        status: gold.status,
        evidence: quotes[index],
        correction: gold.correctionIncludes ?? '',
      })),
    });
    expect(gradeAudit(fixture, text)).toEqual({
      classifications: 4,
      expectedCards: 4,
      grounded: 4,
      corrections: 2,
      requiredCorrections: 2,
      complete: true,
    });
  });

  it('fails missing cards, false positives and unsupported evidence', () => {
    const fixture = AUDIT_FIXTURES[0];
    const result = gradeAudit(
      fixture,
      JSON.stringify({
        cards: [
          { cardId: 'B1', status: 'error', evidence: 'Invented source.', correction: 'Nothing.' },
          {
            cardId: 'B2',
            status: 'error',
            evidence: 'Meiosis produces four genetically different haploid cells.',
            correction: 'Four identical diploid cells.',
          },
        ],
      }),
    );
    expect(result).toMatchObject({
      classifications: 1,
      expectedCards: 4,
      grounded: 1,
      corrections: 0,
      requiredCorrections: 2,
      complete: false,
    });
  });

  it('does not pass malformed JSON or repeated card IDs', () => {
    expect(gradeAudit(AUDIT_FIXTURES[0], 'Looks good.').complete).toBe(false);
    const row = {
      cardId: 'B1',
      status: 'correct',
      evidence: 'Mitosis produces two genetically identical daughter cells.',
      correction: '',
    };
    expect(
      gradeAudit(AUDIT_FIXTURES[0], JSON.stringify({ cards: [row, row] })).classifications,
    ).toBe(0);
  });

  it('validates real tool schemas, course identity and pagination, refusing writes', () => {
    const fixture = AUDIT_FIXTURES[3];
    expect(
      runFixtureTool(fixture, 'lacuna.search_cards', { course: 'Lumen', limit: 2 }),
    ).toMatchObject({ data: { nextCursor: 'benchmark-page-2' } });
    expect(
      runFixtureTool(fixture, 'lacuna.search_cards', {
        course: 'Lumen',
        cursor: 'benchmark-page-2',
      }),
    ).toMatchObject({ data: { cards: fixture.cards.slice(2) } });
    expect(() => runFixtureTool(fixture, 'lacuna.search_cards', { course: 'Other' })).toThrow();
    expect(() =>
      runFixtureTool(fixture, 'lacuna.search_cards', { course: 'Lumen', cursor: 'invented' }),
    ).toThrow();
    expect(() => runFixtureTool(fixture, 'lacuna.find_course', { invented: true })).toThrow();
    expect(() => runFixtureTool(fixture, 'lacuna.update_card', {})).toThrow('Forbidden');
  });
});
