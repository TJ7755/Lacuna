import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { Deck } from '../../db/repositories/decks';
import { useDeckStore } from '../../store/decks';
import { UI } from '../../ui-strings';
import { DeckRow } from './DeckRow';
import { RenameDeckModal } from './RenameDeckModal';
import { DeleteDeckModal } from './DeleteDeckModal';
import styles from './DeckTree.module.css';

// ---------------------------------------------------------------------------
// Tree builder
// ---------------------------------------------------------------------------

type DeckNode = Deck & { children: DeckNode[] };

function buildTree(decks: Deck[]): DeckNode[] {
  const byParent = new Map<string | null, Deck[]>();

  for (const deck of decks) {
    const key = deck.parent_id;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(deck);
  }

  const buildNodes = (parentId: string | null): DeckNode[] => {
    const children = byParent.get(parentId) ?? [];
    return children
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((deck) => ({ ...deck, children: buildNodes(deck.id) }));
  };

  return buildNodes(null);
}

// ---------------------------------------------------------------------------
// Recursive node renderer
// ---------------------------------------------------------------------------

interface TreeNodeProps {
  node: DeckNode;
  cardCounts: Record<string, number>;
  expanded: Set<string>;
  highlightedDeckIds?: Set<string>;
  onToggle: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onRename: (id: string) => void;
}

function TreeNode({
  node,
  cardCounts,
  expanded,
  highlightedDeckIds,
  onToggle,
  onDelete,
  onRename,
}: TreeNodeProps) {
  const navigate = useNavigate();
  const isExpanded = expanded.has(node.id);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <DeckRow
        deck={node}
        cardCount={cardCounts[node.id] ?? 0}
        hasChildren={hasChildren}
        isExpanded={isExpanded}
        highlighted={highlightedDeckIds?.has(node.id)}
        onToggle={() => onToggle(node.id)}
        onNavigate={() => navigate(`/decks/${node.id}`)}
        onDelete={() => onDelete(node.id, node.name)}
        onRename={() => onRename(node.id)}
      />

      <AnimatePresence initial={false}>
        {isExpanded && hasChildren && (
          <motion.div
            key={`children-${node.id}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
            className={styles.children}
          >
            {node.children.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                cardCounts={cardCounts}
                expanded={expanded}
                highlightedDeckIds={highlightedDeckIds}
                onToggle={onToggle}
                onDelete={onDelete}
                onRename={onRename}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeckTree
// ---------------------------------------------------------------------------

interface DeckTreeProps {
  decks: Deck[];
  highlightedDeckIds?: Set<string>;
}

export function DeckTree({ decks, highlightedDeckIds }: DeckTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renamingDeckId, setRenamingDeckId] = useState<string | null>(null);
  const [deletingDeck, setDeletingDeck] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const { cardCounts } = useDeckStore();

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDelete = (id: string, name: string) => {
    setDeletingDeck({ id, name });
  };

  const handleRename = (id: string) => {
    setRenamingDeckId(id);
  };

  const tree = buildTree(decks);

  if (tree.length === 0) {
    return <p>{UI.decks.empty}</p>;
  }

  const renamingDeck = renamingDeckId
    ? decks.find((d) => d.id === renamingDeckId)
    : null;

  return (
    <>
      <div className={styles.tree} role="tree">
        {tree.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            cardCounts={cardCounts}
            expanded={expanded}
            highlightedDeckIds={highlightedDeckIds}
            onToggle={toggleExpanded}
            onDelete={handleDelete}
            onRename={handleRename}
          />
        ))}
      </div>

      {renamingDeckId && renamingDeck && (
        <RenameDeckModal
          isOpen={true}
          deckId={renamingDeckId}
          currentName={renamingDeck.name}
          onClose={() => setRenamingDeckId(null)}
        />
      )}

      {deletingDeck && (
        <DeleteDeckModal
          isOpen={true}
          deckId={deletingDeck.id}
          deckName={deletingDeck.name}
          onClose={() => setDeletingDeck(null)}
        />
      )}
    </>
  );
}
