// Throwaway large-course fixture; never inserted into the database.
const prototypeTopics = [
  [
    'Cells and enzymes',
    [
      'Life processes',
      'Animal cell structures',
      'Plant cell structures',
      'Enzymes as biological catalysts',
      'Temperature and enzyme activity',
      'A fair enzyme temperature comparison',
      'pH and enzyme activity',
      'A fair enzyme pH comparison',
      'From enzyme endpoint times to relative rates',
      'Constructing and reading an enzyme activity graph',
      'How strong is the enzyme evidence?',
    ],
  ],
  [
    'Respiration and transport',
    [
      'Respiration and ATP',
      'Aerobic respiration',
      'Anaerobic respiration',
      'Carbon dioxide from germinating seeds',
      'Heat from germinating seeds',
      'Diffusion across cell membranes',
      'Osmosis and cell water balance',
      'Active transport across membranes',
      'Factors affecting transport rates',
    ],
  ],
  [
    'Nutrition and digestion',
    [
      'Photosynthesis',
      'Limiting factors of photosynthesis',
      'Investigating light intensity',
      'Leaf structure',
      'Mineral requirements',
      'A balanced diet',
      'The alimentary canal',
      'Digestive enzymes',
      'Absorption in the small intestine',
    ],
  ],
  [
    'Organisms and exchange',
    [
      'Plant transport tissues',
      'Transpiration',
      'Measuring water uptake',
      'Blood composition',
      'The heart',
      'Blood vessels',
      'Coronary heart disease',
      'Gas exchange in humans',
      'Breathing and exercise',
      'Excretion and the kidney',
    ],
  ],
  [
    'Coordination and response',
    [
      'The nervous system',
      'Reflex actions',
      'The eye',
      'Hormones',
      'Blood glucose regulation',
      'Homeostasis',
      'Temperature regulation',
      'Plant responses',
      'Investigating phototropism',
    ],
  ],
  [
    'Inheritance and ecology',
    [
      'DNA and genes',
      'Protein synthesis',
      'Mitosis',
      'Meiosis',
      'Monohybrid inheritance',
      'Variation',
      'Natural selection',
      'Food webs',
      'Energy transfer',
      'Population sampling',
      'Nutrient cycles',
      'Human impacts on ecosystems',
    ],
  ],
] as const;

export const prototypeLessons = prototypeTopics.flatMap(([topic, names]) =>
  names.map((name) => ({ id: `prototype-${name}`, name, topic })),
);

export type PrototypeLesson = { id: string; name: string; topic?: string };
