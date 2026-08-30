export const loadAiPanel = () =>
  import('./AiPanel').then((module) => ({ default: module.AiPanel }));
