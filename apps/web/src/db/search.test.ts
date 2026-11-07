import { describe, expect, it } from 'vitest';
import {
  filterSessionCardPool,
  plainPreview,
  questionEditPath,
  searchCardsInScope,
  searchQuestionsInScope,
  type SearchOptions,
} from '@lacuna/core/db/search';
import { DEFAULT_LEECH_LAPSE_THRESHOLD } from '@lacuna/core/fsrs/leech';
import type { Card, Course, LegacyDeckRecord, Lesson, Occlusion } from '@lacuna/core/db/types';
import type { FixedQuestionDefinition } from '@lacuna/core/questions/types';

const NOW = 1_000_000_000_000;

function card(id: string, over: Partial<Card> = {}): Card {
  return {
    id,
    conceptId: `concept-${id}`,
    deckId: 'd1',
    courseId: 'course-1',
    primaryLessonId: null,
    schedulingUnitId: 'course-1',
    type: 'front_back',
    front: `front ${id}`,
    back: `back ${id}`,
    stability: 1,
    difficulty: 5,
    lastReviewed: NOW - 1000,
    reps: 1,
    lapses: 0,
    state: 2,
    due: NOW + 1000,
    scheduledDays: 1,
    learningSteps: 0,
    history: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const deck: LegacyDeckRecord = {
  id: 'd1',
  name: 'LegacyDeckRecord one',
  examDate: NOW,
  createdAt: NOW,
  fsrsVersion: 6,
  fsrsParameters: {
    w: [],
    requestRetention: 0.9,
    enable_fuzz: true,
    maximum_interval: 36500,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
  },
  examObjective: 'expectedMarks',
};

const course: Course = {
  id: 'course-1',
  name: 'Ancient Rome',
  description: '',
  createdAt: NOW,
  updatedAt: NOW,
  examDate: NOW + 100_000,
  fsrsVersion: 6,
  fsrsParameters: deck.fsrsParameters,
  examObjective: 'expectedMarks',
  unlockMode: 'open',
  autoPractice: false,
  practiceThresholdMinutesFar: 10,
  practiceThresholdMinutesNear: 5,
  practiceUrgentWindowDays: 7,
  practiceMaxGap: 3,
};

const lesson: Lesson = {
  id: 'lesson-1',
  courseId: course.id,
  name: 'The Republic',
  orderIndex: 0,
  createdAt: NOW,
  updatedAt: NOW,
  isExtension: false,
};

function question(over: Partial<FixedQuestionDefinition> = {}): FixedQuestionDefinition {
  return {
    id: 'question-1',
    courseId: course.id,
    primaryLessonId: lesson.id,
    additionalLessonIds: [],
    name: 'Applying conservation of energy',
    tags: ['mechanics'],
    suspended: false,
    kind: 'fixed',
    prompt: 'Calculate the final velocity.',
    payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '4' } },
    explanation: 'Equate the initial and final energy, then solve for velocity.',
    explanationStatus: 'authored',
    contentVersion: 1,
    contentRevisionId: 'content-revision-1',
    authoringRevisionId: 'authoring-revision-1',
    authoringUpdatedAt: NOW,
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    scheduleEpoch: {
      id: 'epoch-1',
      startedAt: NOW,
      reason: 'created',
      baseline: { kind: 'new' },
    },
    scheduleUpdatedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function searchCards(query: string, cards: Card[], options: SearchOptions = {}) {
  return searchCardsInScope(query, { cards, courses: [course], lessons: [lesson] }, options);
}

describe('searchCards', () => {
  it('returns nothing without a query or filter', () => {
    expect(searchCards('', [card('a')])).toEqual([]);
  });

  it('still substring-searches when given a query', () => {
    const results = searchCards('front a', [card('a'), card('b')]);
    expect(results.map((r) => r.card.id)).toEqual(['a']);
  });

  it('refreshes repeated searches when loaded content or ownership metadata changes', () => {
    const loaded = card('a', {
      front: 'Résumé',
      back: 'Initial answer',
      primaryLessonId: lesson.id,
    });
    expect(searchCards('resume', [loaded])).toHaveLength(1);
    expect(searchCards('initial answer', [loaded])).toHaveLength(1);
    loaded.front = 'Updated question';
    loaded.back = 'Replacement answer';
    loaded.tags = ['changed'];
    expect(searchCards('resume', [loaded])).toHaveLength(0);
    expect(searchCards('initial answer', [loaded])).toHaveLength(0);
    expect(searchCards('updated question', [loaded])).toHaveLength(1);
    expect(searchCards('replacement answer', [loaded])).toHaveLength(1);
    expect(searchCards('tag:changed', [loaded], { parseQuery: true })).toHaveLength(1);
    expect(
      searchCardsInScope('renamed topic', {
        cards: [loaded],
        courses: [course],
        lessons: [{ ...lesson, name: 'Renamed topic' }],
      }),
    ).toHaveLength(1);
  });

  it('preserves matching across field separators and front-first ranking', () => {
    const acrossFields = card('boundary', { front: 'Ends alpha', back: 'beta starts' });
    const inFront = card('front', { front: 'Later alpha  beta', back: '' });
    expect(searchCards('alpha  beta', [acrossFields, inFront]).map((hit) => hit.card.id)).toEqual([
      'front',
      'boundary',
    ]);
    const bank = card('bank', { front: '', back: '', tags: ['exam revision'] });
    expect(searchCards('rome    exam', [bank])).toHaveLength(1);
    expect(searchCards('rome  exam', [bank])).toHaveLength(0);
    expect(searchCards('\u0301 beta', [acrossFields])).toHaveLength(1);
    expect(searchCards('alpha \u0301', [acrossFields])).toHaveLength(1);
  });

  it('reads in-place tag and ownership renames on repeated image-heavy searches', () => {
    const loaded = card('image', {
      front: `![Cell](data:image/png;base64,${'a'.repeat(128 * 1024)})`,
      back: 'Nucleus',
      tags: ['old tag'],
      primaryLessonId: lesson.id,
    });
    const owner = { ...course };
    const topic = { ...lesson };
    const scope = { cards: [loaded], courses: [owner], lessons: [topic] };
    expect(searchCardsInScope('nucleus', scope)).toHaveLength(1);
    expect(searchCardsInScope('old tag', scope)).toHaveLength(1);
    loaded.tags![0] = 'Résumé';
    owner.name = 'Renamed course';
    topic.name = 'Renamed lesson';
    expect(searchCardsInScope('old tag', scope)).toHaveLength(0);
    expect(searchCardsInScope('resume', scope)).toHaveLength(1);
    expect(searchCardsInScope('ancient rome', scope)).toHaveLength(0);
    expect(searchCardsInScope('renamed course', scope)).toHaveLength(1);
    expect(searchCardsInScope('the republic', scope)).toHaveLength(0);
    expect(searchCardsInScope('renamed lesson', scope)).toHaveLength(1);
    expect(searchCardsInScope('nucleus', scope)).toHaveLength(1);
  });

  it('finds text around embedded images without matching their encoded bytes', () => {
    const loaded = card('image', {
      front: '![Cell nucleus](DATA:image/png;base64,SearchNoise+/=) Mitosis',
      back: '<img alt="Cytoplasm" src="data:image/webp;base64,OtherNoise"> Division',
    });
    for (const query of ['cell nucleus', 'mitosis', 'cytoplasm', 'division'])
      expect(searchCards(query, [loaded])).toHaveLength(1);
    for (const query of ['searchnoise', 'othernoise'])
      expect(searchCards(query, [loaded])).toHaveLength(0);
  });

  it.each(['\f', '\v', '?'])('preserves source when an image payload contains %j', (separator) => {
    const loaded = card('malformed-image', {
      front: `![Example](data:image/png;base64,Hello${separator}text)`,
    });
    expect(searchCards('base64,hello', [loaded])).toHaveLength(1);
  });

  it('keeps image URL examples searchable when the author presents them as text', () => {
    const loaded = card('example', {
      front: 'Explain the `data:image/png;base64,AAAA` example.',
      back: '`![Example](data:image/png;base64,BBBB)` and `<img src="data:image/png;base64,CCCC">`',
    });
    for (const query of ['data:image/png', 'base64,AAAA', 'base64,BBBB', 'base64,CCCC'])
      expect(searchCards(query, [loaded])).toHaveLength(1);
  });

  it('keeps image syntax in indented Markdown code searchable', () => {
    const loaded = card('example', {
      front: '    ![Example](data:image/png;base64,BBBB)',
    });
    expect(searchCards('data:image/png', [loaded])).toHaveLength(1);
  });

  it('lists due cards with an empty query when the due filter is on', () => {
    const cards = [
      card('due', { due: NOW - 1, lastReviewed: NOW - 5000 }),
      card('later', { due: NOW + 100_000 }),
      card('fresh', { due: null, lastReviewed: null }),
    ];
    const results = searchCards('', cards, { filters: ['due'], now: NOW });
    expect(results.map((r) => r.card.id)).toEqual(['due']);
  });

  it('filters new, leech, flagged and suspended cards', () => {
    const cards = [
      card('new', { lastReviewed: null, due: null }),
      card('leech', { lapses: DEFAULT_LEECH_LAPSE_THRESHOLD }),
      card('flag', { flagged: true }),
      card('susp', { suspended: true }),
      card('plain'),
    ];
    expect(searchCards('', cards, { filters: ['new'] }).map((r) => r.card.id)).toEqual(['new']);
    expect(searchCards('', cards, { filters: ['leech'] }).map((r) => r.card.id)).toEqual(['leech']);
    expect(searchCards('', cards, { filters: ['flagged'] }).map((r) => r.card.id)).toEqual([
      'flag',
    ]);
    expect(searchCards('', cards, { filters: ['suspended'] }).map((r) => r.card.id)).toEqual([
      'susp',
    ]);
  });

  it("applies the owning Course's leech threshold", () => {
    const cards = [card('three', { lapses: 3 }), card('two', { lapses: 2 })];
    const scope = { cards, courses: [{ ...course, leechThreshold: 3 }], lessons: [lesson] };
    expect(searchCardsInScope('', scope, { filters: ['leech'] }).map((r) => r.card.id)).toEqual([
      'three',
    ]);
    expect(
      filterSessionCardPool(cards, { filters: ['leech'], leechThreshold: 3 }).map((c) => c.id),
    ).toEqual(['three']);
  });

  it('orders equally ranked cards naturally by front', () => {
    const cards = ['Item 10', 'Item 2', 'item 1'].map((front) => card(front, { front }));
    expect(searchCards('item', cards).map((r) => r.card.front)).toEqual([
      'item 1',
      'Item 2',
      'Item 10',
    ]);
  });

  it('combines multiple filters with AND', () => {
    const cards = [
      card('both', { flagged: true, lapses: DEFAULT_LEECH_LAPSE_THRESHOLD }),
      card('flagOnly', { flagged: true }),
      card('leechOnly', { lapses: DEFAULT_LEECH_LAPSE_THRESHOLD }),
    ];
    const results = searchCards('', cards, { filters: ['flagged', 'leech'] });
    expect(results.map((r) => r.card.id)).toEqual(['both']);
  });

  it('intersects a text query with active filters', () => {
    const cards = [
      card('a', { flagged: true, front: 'apple' }),
      card('b', { flagged: true, front: 'banana' }),
      card('c', { flagged: false, front: 'apple' }),
    ];
    const results = searchCards('apple', cards, { filters: ['flagged'] });
    expect(results.map((r) => r.card.id)).toEqual(['a']);
  });
});

describe('searchCardsInScope', () => {
  it('finds generated diagram cards by their displayed answers, including paired features', () => {
    const diagram: Occlusion = {
      id: 'diagram',
      courseId: course.id,
      primaryLessonId: lesson.id,
      name: 'Cell anatomy',
      assetHash: 'image-hash',
      createdAt: NOW,
      updatedAt: NOW,
      regions: [
        {
          id: 'label',
          role: 'label',
          shape: 'rectangle',
          x: 0,
          y: 0,
          w: 0.1,
          h: 0.1,
          answerText: 'Núcleus',
          backNote: 'Controls cell activity',
        },
        {
          id: 'feature',
          role: 'feature',
          shape: 'rectangle',
          x: 0.2,
          y: 0,
          w: 0.1,
          h: 0.1,
          pairedRegionId: 'label',
          answerText: 'Unused own answer',
        },
      ],
    };
    const generated = ['label', 'feature'].map((id) =>
      card(id, {
        occlusionRegionId: id,
        front: 'Label the structure',
        back: 'Label the structure',
      }),
    );
    const scope = { cards: generated, courses: [course], lessons: [lesson], occlusions: [diagram] };
    expect(searchCardsInScope('nucleus', scope).map((hit) => hit.card)).toEqual(generated);
    expect(searchCardsInScope('unused own answer', scope)).toHaveLength(0);
    expect(searchCardsInScope('cell anatomy', scope)).toHaveLength(2);
    expect(searchCardsInScope('controls cell activity', scope).map((hit) => hit.card)).toEqual([
      generated[0],
    ]);
    diagram.regions[0].answerText = 'Mitochondrion';
    expect(searchCardsInScope('nucleus', scope)).toHaveLength(0);
    expect(searchCardsInScope('mitochondrion', scope)).toHaveLength(2);
    diagram.courseId = 'other-course';
    expect(searchCardsInScope('mitochondrion', scope)).toHaveLength(0);
  });

  it('returns Course, Lesson and bank cards with domain ownership labels', () => {
    const courseCard = card('course', { primaryLessonId: null });
    const lessonCard = card('lesson', {
      primaryLessonId: lesson.id,
      schedulingUnitId: lesson.id,
    });
    const bankCard = card('bank', { primaryLessonId: null });

    const results = searchCardsInScope('front', {
      cards: [courseCard, lessonCard, bankCard],
      courses: [course],
      lessons: [lesson],
    });

    // Equal matches read in front-text order.
    expect(results).toEqual([
      expect.objectContaining({ card: bankCard, course, contextName: 'Ancient Rome' }),
      expect.objectContaining({ card: courseCard, course, contextName: 'Ancient Rome' }),
      expect.objectContaining({ card: lessonCard, course, lesson, contextName: 'The Republic' }),
    ]);
  });
});

describe('searchQuestionsInScope', () => {
  it('returns a discriminated fixed-Question result with Course and Lesson context', () => {
    const result = searchQuestionsInScope('final velocity', {
      questions: [question()],
      courses: [course],
      lessons: [lesson],
    });

    expect(result).toEqual([
      expect.objectContaining({
        kind: 'question',
        question: expect.objectContaining({ id: 'question-1' }),
        course,
        lesson,
        contextName: 'The Republic',
      }),
    ]);
  });

  it('matches Question-specific authored content without borrowing Card filters', () => {
    const questions = [question()];
    const scope = { questions, courses: [course], lessons: [lesson] };

    expect(searchQuestionsInScope('conservation', scope)).toHaveLength(1);
    expect(searchQuestionsInScope('equate the initial', scope)).toHaveLength(1);
    expect(searchQuestionsInScope('mechanics', scope)).toHaveLength(1);
    expect(searchQuestionsInScope('', scope)).toEqual([]);
  });

  it('drops Questions whose Course or primary Lesson relationship is invalid', () => {
    expect(
      searchQuestionsInScope('velocity', {
        questions: [
          question({ courseId: 'missing-course' }),
          question({ primaryLessonId: 'missing-lesson' }),
        ],
        courses: [course],
        lessons: [lesson],
      }),
    ).toEqual([]);
  });
});

describe('questionEditPath', () => {
  it('deep-links to the canonical course-scoped Question editor', () => {
    expect(questionEditPath(question())).toBe('/course/course-1/questions/question-1/edit');
  });
});

describe('filterSessionCardPool', () => {
  it('returns the supplied pool unchanged without a tag or filter', () => {
    const cards = [card('a'), card('b')];
    expect(filterSessionCardPool(cards)).toEqual(cards);
  });

  it('matches an exact tag without case or diacritic sensitivity', () => {
    const cards = [
      card('match', { tags: ['Résumé'] }),
      card('wrong-tag', { tags: ['résumé-writing'] }),
      card('untagged'),
    ];

    expect(filterSessionCardPool(cards, { tag: 'resume' }).map((item) => item.id)).toEqual([
      'match',
    ]);
  });

  it('combines card filters with AND semantics', () => {
    const cards = [
      card('due', { due: NOW - 1 }),
      card('flagged', { flagged: true }),
      card('both', { due: NOW - 1, flagged: true }),
      card('neither'),
    ];

    expect(
      filterSessionCardPool(cards, { filters: ['due', 'flagged'], now: NOW }).map(
        (item) => item.id,
      ),
    ).toEqual(['both']);
  });

  it('intersects the tag with every selected filter', () => {
    const cards = [
      card('tagged-both', { tags: ['exam'], due: NOW - 1, flagged: true }),
      card('tagged-due', { tags: ['exam'], due: NOW - 1 }),
      card('tagged-plain', { tags: ['exam'] }),
      card('untagged-flagged', { flagged: true }),
    ];

    expect(
      filterSessionCardPool(cards, {
        tag: 'exam',
        filters: ['due', 'flagged'],
        now: NOW,
      }).map((item) => item.id),
    ).toEqual(['tagged-both']);
  });

  it('keeps suspended cards when the suspended filter selects them', () => {
    const cards = [
      card('suspended', { suspended: true }),
      card('active'),
      card('active-flagged', { flagged: true }),
    ];

    expect(filterSessionCardPool(cards, { filters: ['suspended'] }).map((item) => item.id)).toEqual(
      ['suspended'],
    );
    expect(
      filterSessionCardPool(cards, { filters: ['suspended', 'flagged'] }).map((item) => item.id),
    ).toEqual([]);
  });
});

describe('plainPreview', () => {
  it.each([
    ['Before {{c1::line one\nline two}} after', 'Before line one line two after'],
    ['Before {{c1::answer::first\nsecond}} after', 'Before answer after'],
    [
      '{{c1::line one\r\nline two::first\r\nsecond}} and {{c2::last}}',
      'line one line two and last',
    ],
  ])('unwraps multiline clozes in %j', (source, expected) => {
    expect(plainPreview(source)).toBe(expected);
  });

  it('strips formatting and truncates after unwrapping a multiline cloze', () => {
    expect(plainPreview('**{{c1::line one\nline two::hint}}**', 8)).toBe('line one…');
  });
});

describe('advanced search query text', () => {
  it.each(['deck:"Ancient Rome"', "deck:'Ancient Rome'", 'tag:"final exam"'])(
    'keeps quoted operator values together in %s',
    (query) => {
      const cards = [card('match', { tags: ['final exam'] }), card('other', { courseId: 'other' })];
      const results = searchCardsInScope(
        query,
        {
          cards,
          courses: [course, { ...course, id: 'other', name: 'Other course' }],
          lessons: [],
        },
        { parseQuery: true },
      );
      expect(results.map((result) => result.card.id)).toEqual(['match']);
    },
  );

  it('preserves apostrophes in ordinary query words', () => {
    expect(
      searchCardsInScope(
        "don't",
        {
          cards: [card('match', { front: "don't forget" })],
          courses: [course],
          lessons: [],
        },
        { parseQuery: true },
      ),
    ).toHaveLength(1);
  });

  it('searches unrecognised is: operators as literal text', () => {
    const results = searchCardsInScope(
      'is:pending apple',
      {
        cards: [card('match', { front: 'is:pending apple' }), card('other', { front: 'apple' })],
        courses: [course],
        lessons: [],
      },
      { parseQuery: true },
    );
    expect(results.map((result) => result.card.id)).toEqual(['match']);
  });
});

describe('link previews', () => {
  it('shows link labels without destinations or Markdown syntax', () => {
    expect(plainPreview('Read [**the guide**](https://example.com/guide) today.')).toBe(
      'Read the guide today.',
    );
    expect(plainPreview('[A very long label](https://example.com)', 6)).toBe('A very\u2026');
  });
});
