// Facade over companyfacts.js. The iXBRL instance parser is removed.
export {
  loadTaxonomy,
  sentenceFillAllowed,
  structuredMetric,
  conceptIndex,
  parseCompanyfacts,
  loadCompanyfactsFile,
  mappedFacts,
  taggedSlots,
  headlineGaps,
  valueText,
  groupDigits,
} from './companyfacts.js';
