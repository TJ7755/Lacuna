import type {
  DBCore,
  DBCoreMutateRequest,
  DBCoreMutateResponse,
  DBCoreTransaction,
  Middleware,
} from 'dexie';
import type { ReviewHistoryEntry } from './reviewHistory';

export const REVIEW_ACTIVITY_TABLE = 'reviewActivity';

export interface ReviewActivityRow {
  cardId: string;
  timestamps: number[];
}

type RuntimeTransaction = DBCoreTransaction & { mode?: IDBTransactionMode };

function successfulIndexes(response: DBCoreMutateResponse, length: number): number[] {
  return Array.from({ length }, (_, index) => index).filter((index) => !response.failures[index]);
}

function primaryKeys(request: DBCoreMutateRequest): unknown[] {
  if (request.type === 'delete') return [...request.keys];
  if (request.type === 'deleteRange') return [];
  return request.keys
    ? [...request.keys]
    : request.values.map((value) => (value as ReviewHistoryEntry).id);
}

function applyDeltas(
  rows: (ReviewActivityRow | undefined)[],
  cardIds: string[],
  removed: Map<string, number[]>,
  added: Map<string, number[]>,
): ReviewActivityRow[] {
  return cardIds.flatMap((cardId, index) => {
    const timestamps = [...(rows[index]?.timestamps ?? [])];
    for (const timestamp of removed.get(cardId) ?? []) {
      const position = timestamps.indexOf(timestamp);
      if (position >= 0) timestamps.splice(position, 1);
    }
    for (const timestamp of added.get(cardId) ?? []) timestamps.push(timestamp);
    timestamps.sort((a, b) => a - b);
    return timestamps.length > 0 ? [{ cardId, timestamps }] : [];
  });
}

function addDelta(target: Map<string, number[]>, entry: ReviewHistoryEntry): void {
  const values = target.get(entry.cardId) ?? [];
  values.push(entry.timestamp);
  target.set(entry.cardId, values);
}

export const reviewActivityProjectionMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'ReviewActivityProjection',
  level: 0.5,
  create(downCore) {
    const queues = new WeakMap<DBCoreTransaction, Promise<DBCoreMutateResponse>>();
    return {
      ...downCore,
      transaction(stores, mode, options) {
        const expanded =
          mode === 'readwrite' &&
          stores.includes('reviewHistory') &&
          !stores.includes(REVIEW_ACTIVITY_TABLE)
            ? [...stores, REVIEW_ACTIVITY_TABLE]
            : stores;
        return downCore.transaction(expanded, mode, options);
      },
      table(tableName) {
        const downTable = downCore.table(tableName);
        if (tableName !== 'reviewHistory') return downTable;
        return {
          ...downTable,
          mutate(request) {
            if ((request.trans as RuntimeTransaction).mode === 'versionchange') {
              return downTable.mutate(request);
            }

            const execute = async (): Promise<DBCoreMutateResponse> => {
              const activityTable = downCore.table(REVIEW_ACTIVITY_TABLE);
              if (request.type === 'deleteRange' && request.range.type === 3) {
                const response = await downTable.mutate(request);
                if (response.numFailures > 0) return response;
                const projectionResponse = await activityTable.mutate({
                  type: 'deleteRange',
                  trans: request.trans,
                  range: request.range,
                });
                if (projectionResponse.numFailures > 0)
                  throw new Error('Review activity clear failed.');
                return response;
              }

              const keys = primaryKeys(request);
              const oldEntries: (ReviewHistoryEntry | undefined)[] =
                request.type === 'add'
                  ? []
                  : request.type === 'deleteRange'
                    ? ((
                        await downTable.query({
                          trans: request.trans,
                          values: true,
                          query: { index: downTable.schema.primaryKey, range: request.range },
                        })
                      ).result as ReviewHistoryEntry[])
                    : ((await downTable.getMany({ trans: request.trans, keys })) as (
                        ReviewHistoryEntry | undefined
                      )[]);
              const response = await downTable.mutate(request);
              const itemCount =
                request.type === 'deleteRange'
                  ? oldEntries.length
                  : request.type === 'delete'
                    ? request.keys.length
                    : request.values.length;
              const successful =
                request.type === 'deleteRange'
                  ? response.numFailures === 0
                    ? Array.from({ length: itemCount }, (_, index) => index)
                    : []
                  : successfulIndexes(response, itemCount);
              const removed = new Map<string, number[]>();
              const added = new Map<string, number[]>();
              if (request.type === 'deleteRange') {
                for (const index of successful) addDelta(removed, oldEntries[index]!);
              } else {
                // IndexedDB applies repeated primary keys in request order. Project
                // only the final successful operation and remove the original once.
                const finalIndexByKey = new Map<unknown, number>();
                for (const index of successful) finalIndexByKey.set(keys[index], index);
                for (const index of finalIndexByKey.values()) {
                  const oldEntry = oldEntries[index];
                  if (oldEntry) addDelta(removed, oldEntry);
                  if (request.type === 'add' || request.type === 'put') {
                    addDelta(added, request.values[index] as ReviewHistoryEntry);
                  }
                }
              }
              const cardIds = [...new Set([...removed.keys(), ...added.keys()])];
              if (cardIds.length === 0) return response;
              const rows = (await activityTable.getMany({
                trans: request.trans,
                keys: cardIds,
              })) as (ReviewActivityRow | undefined)[];
              const nextRows = applyDeltas(rows, cardIds, removed, added);
              const retainedIds = new Set(nextRows.map((row) => row.cardId));
              const deletedIds = cardIds.filter((cardId) => !retainedIds.has(cardId));
              if (nextRows.length > 0) {
                const projectionResponse = await activityTable.mutate({
                  type: 'put',
                  trans: request.trans,
                  values: nextRows,
                });
                if (projectionResponse.numFailures > 0)
                  throw new Error('Review activity update failed.');
              }
              if (deletedIds.length > 0) {
                const projectionResponse = await activityTable.mutate({
                  type: 'delete',
                  trans: request.trans,
                  keys: deletedIds,
                });
                if (projectionResponse.numFailures > 0)
                  throw new Error('Review activity delete failed.');
              }
              return response;
            };

            const previous = queues.get(request.trans);
            const pending = previous ? previous.then(execute) : execute();
            const guarded = pending.catch((error) => {
              try {
                request.trans.abort();
              } catch {
                // Preserve the projection error if IndexedDB has already aborted.
              }
              throw error;
            });
            queues.set(request.trans, guarded);
            return guarded;
          },
        };
      },
    };
  },
};
