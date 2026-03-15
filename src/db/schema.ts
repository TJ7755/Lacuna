import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core';

// ---------------------------------------------------------------------------
// Shared timestamp columns helper (used in every table)
// ---------------------------------------------------------------------------

const timestamps = {
  created_at: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updated_at: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  deleted_at: integer('deleted_at', { mode: 'timestamp' }),
};

// ---------------------------------------------------------------------------
// decks
// ---------------------------------------------------------------------------

export const decks = sqliteTable('decks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parent_id: text('parent_id'), // nullable self-referential FK
  path: text('path').notNull(), // e.g. "Languages::French::Vocab"
  exam_date: integer('exam_date', { mode: 'timestamp' }), // nullable
  ...timestamps,
});

// ---------------------------------------------------------------------------
// cards
// ---------------------------------------------------------------------------

export const cards = sqliteTable('cards', {
  id: text('id').primaryKey(),
  deck_id: text('deck_id')
    .notNull()
    .references(() => decks.id),
  card_type: text('card_type', {
    enum: ['basic', 'cloze', 'image_occlusion'],
  }).notNull(),
  front: text('front').notNull(),
  back: text('back').notNull(),
  cloze_text: text('cloze_text'),
  image_url: text('image_url'),
  occlusion_data: text('occlusion_data', { mode: 'json' }), // nullable JSON
  ...timestamps,
});

// ---------------------------------------------------------------------------
// fsrs_state
// ---------------------------------------------------------------------------

export const fsrs_state = sqliteTable('fsrs_state', {
  id: text('id').primaryKey(),
  card_id: text('card_id')
    .notNull()
    .unique()
    .references(() => cards.id),
  stability: real('stability').notNull(),
  difficulty: real('difficulty').notNull(),
  due: integer('due', { mode: 'timestamp' }).notNull(),
  last_review: integer('last_review', { mode: 'timestamp' }),
  rating_history: text('rating_history', { mode: 'json' })
    .notNull()
    .$defaultFn(() => []),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// notes
// ---------------------------------------------------------------------------

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  deck_id: text('deck_id').references(() => decks.id), // nullable FK
  title: text('title').notNull(),
  content: text('content', { mode: 'json' }).notNull(), // TipTap document JSON
  ...timestamps,
});

// ---------------------------------------------------------------------------
// card_note_links
// ---------------------------------------------------------------------------

export const card_note_links = sqliteTable('card_note_links', {
  id: text('id').primaryKey(),
  card_id: text('card_id')
    .notNull()
    .references(() => cards.id),
  note_id: text('note_id')
    .notNull()
    .references(() => notes.id),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// tags
// ---------------------------------------------------------------------------

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// card_tags
// ---------------------------------------------------------------------------

export const card_tags = sqliteTable('card_tags', {
  id: text('id').primaryKey(),
  card_id: text('card_id')
    .notNull()
    .references(() => cards.id),
  tag_id: text('tag_id')
    .notNull()
    .references(() => tags.id),
  ...timestamps,
});
