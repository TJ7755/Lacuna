import { buildCatalogue } from './catalogue';
import biology from './entries/pearson-edexcel-international-gcse-4bi1.json';

export const specificationCatalogue = buildCatalogue([biology]);

export function findSpecification(id: string) {
  return specificationCatalogue.get(id);
}
