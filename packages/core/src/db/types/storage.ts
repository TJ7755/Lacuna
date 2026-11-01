import type { QuestionSetAttemptRecord } from '@lacuna/core/questions/questionSetAttempts';
import type { QuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';
import type {
  Concept,
  QuestionAttempt,
  QuestionConceptSet,
  QuestionDefinition,
} from '@lacuna/core/questions/types';
import type { ReviewHistoryEntry } from '@lacuna/core/db/reviewHistory';
import type { AgentMemory } from '@lacuna/core/db/types/agentMemory';
import type { Card } from '@lacuna/core/db/types/card';
import type {
  AssessmentDateCompatibility,
  CourseAssessment,
  CourseRecord,
  Lesson,
  LessonCardExposure,
  LessonCardLink,
  LessonCompletion,
  Note,
  PracticeMilestone,
  PracticeNode,
  RevisionPlan,
} from '@lacuna/core/db/types/course';
import type { Occlusion, Sequence } from '@lacuna/core/db/types/generatedContent';
import type { LineageIdMapping, PendingMergeReview } from '@lacuna/core/db/types/lineage';
import type {
  CoursePerformance,
  LegacyDeck,
  LegacyFolder,
  SchedulingPerformance,
  SchedulingUnitRecord,
  SessionHistoryEntry,
  UserPerformance,
} from '@lacuna/core/db/types/scheduling';

/** Binary media asset stored separately from card Markdown and deduplicated by hash.
 *  We store the raw bytes as Uint8Array because fake-indexeddb (and some browser
 *  IndexedDB implementations) do not reliably preserve Blob objects through
 *  structuredClone.  DOM APIs that need a Blob receive one via `toBlob()`. */
export interface MediaAsset {
  hash: string;
  blob: Blob | Uint8Array;
  mimeType: string;
  /** Absent on pre-Arc-6 records and therefore interpreted as image. */
  kind?: 'image' | 'audio';
  width?: number;
  height?: number;
  createdAt: number;
}

/** JSON-safe form of a MediaAsset for backups and exports. */
export interface BackupAsset {
  hash: string;
  data: string;
  mimeType: string;
  kind?: 'image' | 'audio';
  width?: number;
  height?: number;
  createdAt: number;
}

/** A timestamped automatic snapshot of the whole database, kept as a restore point. */
export interface BackupSnapshot {
  id?: number;
  createdAt: number;
  /**
   * Optional marker. 'pre-migration' snapshots are taken automatically before a
   * schema upgrade and are exempt from the normal daily-snapshot pruning, so a
   * botched migration always has a restore point to fall back to.
   */
  tag?: 'pre-migration';
  /**
   * Denormalised counts so the restore-point list can render without parsing the payload.
   * `deckCount` is a legacy wire name; current snapshots store the user-facing lesson count.
   */
  deckCount: number;
  cardCount: number;
  /** The full backup payload, identical in shape to a manual export. */
  payload: BackupFile;
}

/** Generic key/value store for small persistent app state (e.g. the backup folder handle). */
export interface AppStateEntry {
  key: string;
  value: unknown;
}

/** One deleted snapshot-carried row, kept so a peer merge can honour the deletion. */
export interface Tombstone {
  /** Dexie table name, e.g. `cards` or `courses`. */
  table: string;
  recordId: string;
  deletedAt: number;
}

/**
 * Unwrapped channel key and write token kept on this device so sync works
 * without re-entering the recovery passphrase. Cleared by the Settings Lock
 * action; the wrapped keybag remains for pairing fresh devices.
 */
export interface RememberedSyncCredentials {
  /** Hex-encoded channel key. */
  channelKeyHex: string;
  writeToken: string;
}

/**
 * Device-local credentials for one teacher share link: the relay origin plus
 * the bearer write token and the last-known slot generations (so republishes
 * can compare-and-swap instead of blindly overwriting).
 */
export interface RememberedShareLinkCredentials {
  relayUrl: string;
  writeToken: string;
  payloadGeneration?: string;
  metaGeneration?: string;
}

/**
 * Local sync-channel bookkeeping. Stored under `appState` key `syncState`.
 * Absent until a device is paired; the P6 Settings flow owns pairing and
 * stores the relay origin, wrapped recovery copy and optional remembered
 * credentials here.
 */
export interface SyncState {
  /** Relay origin used by this device to reach the channel. */
  relayUrl?: string;
  channelId?: string;
  /** Hex-encoded passphrase-wrapped channel key and write token. */
  wrappedKeyMaterial?: string;
  /** Present while this device remembers its credentials without the passphrase. */
  remembered?: RememberedSyncCredentials;
  /**
   * Teacher share-link write credentials, keyed by relay share id. Device-local
   * like `remembered`: never exported in backups or course files, since anyone
   * holding a write token can replace the linked course. The public share id
   * itself lives on the course's `distribution` instead.
   */
  shareLinks?: Record<string, RememberedShareLinkCredentials>;
  lastPushedGeneration?: string;
  lastSuccessfulSyncAt?: number;
  /** Last encrypted snapshot size, retained for the Settings sync status panel. */
  lastSnapshotBytes?: number;
  /** Last uncompressed JSON snapshot size. */
  lastSnapshotPlaintextBytes?: number;
  lastError?: string | null;
}

/** Shape of an exported/imported backup file. */
export interface BackupFile {
  /** New markers make older readers reject collections they cannot preserve. */
  app: 'lacuna' | 'lacuna-v12' | 'lacuna-v13' | 'lacuna-v14' | 'lacuna-v15';
  version: number;
  exportedAt: number;
  /** Pre-v22 Deck rows. Current exports omit this; a non-empty array is refused. */
  decks?: LegacyDeck[];
  cards: Card[];
  /** Question-mode domain records. Optional on backup versions before v11. */
  concepts?: Concept[];
  questions?: QuestionDefinition[];
  questionConcepts?: QuestionConceptSet[];
  questionAttempts?: QuestionAttempt[];
  /** Authored question-set content. Required from backup/snapshot version 12. */
  questionSets?: QuestionSetRecord[];
  /** Personal authored-set attempts. Required from backup/snapshot version 13. */
  questionSetAttempts?: QuestionSetAttemptRecord[];
  /** Durable AI teaching context. Optional so existing v11 backups remain valid. */
  agentMemories?: AgentMemory[];
  /** Canonical review events when exported from schema v20 or later. */
  reviewHistory?: ReviewHistoryEntry[];
  /** Target storage projections, optional while old backups are imported. */
  schedulingUnits?: SchedulingUnitRecord[];
  coursePerformance?: CoursePerformance[];
  schedulingPerformance?: SchedulingPerformance[];
  assets: BackupAsset[];
  sessionHistory: SessionHistoryEntry[];
  userPerformance: UserPerformance[];
  /** Pre-v22 Folder rows. Current exports omit this; a non-empty array is refused. */
  folders?: LegacyFolder[];
  // Course architecture tables. Optional so older backups still import cleanly.
  courses?: CourseRecord[];
  lessons?: Lesson[];
  notes?: Note[];
  lessonCards?: LessonCardLink[];
  lessonCardExposures?: LessonCardExposure[];
  lessonCompletions?: LessonCompletion[];
  practiceNodes?: PracticeNode[];
  practiceMilestones?: PracticeMilestone[];
  /** Full assessment records in current backups. */
  courseAssessments?: CourseAssessment[];
  revisionPlans?: RevisionPlan[];
  /** Legacy v6-and-earlier import boundary. Never emitted by current exports. */
  courseExamDates?: AssessmentDateCompatibility[];
  // Overlapping-cloze sequences. Optional so older backups still import cleanly.
  sequences?: Sequence[];
  // Image occlusions. Optional so older backups still import cleanly.
  occlusions?: Occlusion[];
  /**
   * Deletion receipts. Optional so pre-v10 backups import unchanged; an absent
   * array means none. Added at backup version 10 / schema v23.
   */
  tombstones?: Tombstone[];
  /** Distributed-course merge state, included from backup v11 onwards. */
  lineageIdMappings?: LineageIdMapping[];
  pendingMergeReviews?: PendingMergeReview[];
}
