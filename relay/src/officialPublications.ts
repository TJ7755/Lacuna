/** Relay-operator retention policy, independent of the public catalogue and request bodies. */
const officialShareIds = new Set([
  '6fb10671c70197caeff8616f80697ac5', // Biology
  'daf16de2b88b97fa236948559ede6c4c', // Chemistry
  '52fe58acd2fcece40c1d10ffbf08276f', // Physics
  '31178fee8489ffcf1748c1dc5c570be5', // History
]);

export function isOfficialPublication(id: string): boolean {
  return officialShareIds.has(id);
}
