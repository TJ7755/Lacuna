# Lacuna — version 0.2.10

## Unreleased

- Allocated lesson and note order indices inside their insert transactions, so concurrent
  creation in the same parent keeps distinct indices and stable listed order.
