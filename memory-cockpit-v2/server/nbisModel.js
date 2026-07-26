// nbisModel.js — thin wrapper (Path 2A S3). Logic in thinModel.js.
// Nebius desk payloads from compiled ontology pack (+ vault house view).
// Decision-support only.
import { createThinModel, NBIS_MODEL_PROFILE } from './thinModel.js';

const m = createThinModel(NBIS_MODEL_PROFILE);

export const meta = m.meta;
export const book = m.book;
export const refreshBook = m.refreshBook;
export const overview = m.overview;
export const risks = m.risks;
export const riskDetail = m.riskDetail;
export const house = m.house;
export const quote = m.quote;
export const sources = m.sources;
export const writeMeta = m.writeMeta;
