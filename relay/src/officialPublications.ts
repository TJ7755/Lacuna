/** Relay-operator retention policy, independent of the public catalogue and request bodies. */
const officialShareIds = new Set([
  '6fb10671c70197caeff8616f80697ac5', // Biology
  'daf16de2b88b97fa236948559ede6c4c', // Chemistry
  '52fe58acd2fcece40c1d10ffbf08276f', // Physics
  '31178fee8489ffcf1748c1dc5c570be5', // History
  '9a44358aa0d59d1f1fbd02b30c38b746', // aqa-8461
  '40aab20ad7ab21811e1059b47522cc3a', // aqa-8462
  'e0da40253700207827f2b26455bd9ed6', // aqa-8463
  '819c37db9ae88c45631f51348b7b44f2', // cambridge-0610
  '40d06cbdd6fc0170da1faa1e1192e3fb', // cambridge-0620
  '6f78a8e5f86fd26bf5be39ff96a13733', // cambridge-0625
  '4e756f914aea44bfe8312b2e9cb83843', // cambridge-0970
  '6d31d711f32f4c3ee59884e86d2a7d7f', // cambridge-0971
  'f59cf55a906edfede13902ca7bfda358', // edexcel-1bi0
  '79c53406f469e40ec6949746d6879167', // edexcel-1ch0
  '6ab9bb362064a8f661737b11b634b6d1', // edexcel-1ph0
  'b9079bf89fcc37a4dfaa4f665c8ea236', // ocr-j247
  '96fbd96735ce0d4efe7d05675eb6cb72', // ocr-j248
  'c93779cc47d65de9af9fd421914b06bb', // ocr-j249
  '405b448b4804d48c3bd80a4d3ccfd85d', // ocr-j257
  'ae447daf5e1b587fd7e725dd1db8ec27', // ocr-j258
  'e8bdbfc18b3270faa77cc341e876bf26', // ocr-j259
  'b01c1050191588212cff4cc28131fa10', // pearson-4ph1
  '91edc6fda3742ffe8ce963c3ae848e41', // aqa-8464
  'e85fc39e709074d58669c2d8bfd723bb', // aqa-8062
]);

export function isOfficialPublication(id: string): boolean {
  return officialShareIds.has(id);
}
