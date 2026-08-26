import { buildA01Cover } from './a01-cover';
import { buildA02StatGrid } from './a02-stat-grid';
import { buildA03LargeTable } from './a03-large-table';
import { buildA04Asymmetric75 } from './a04-asymmetric-7-5';
import { buildA05Asymmetric74 } from './a05-asymmetric-7-4';
import { buildA06Diagram } from './a06-diagram';
import { buildA07ThreeBlock } from './a07-three-block';
import { buildA08DualTable } from './a08-dual-table';
import { buildA09Process } from './a09-process';
import { buildA10Closing } from './a10-closing';
import { buildA11RoomSpec } from './a11-room-spec';
import { buildA12Ownership } from './a12-ownership';
import { buildA13Operating } from './a13-operating';
import { buildA14Gallery } from './a14-gallery';
import { buildA15Thesis } from './a15-thesis';
import { buildA16InvestmentStructure } from './a16-investment-structure';
import { buildA17PreCompletionMarketing } from './a17-pre-completion-marketing';

export * from './a01-cover'; // For Types
export { buildA15Thesis, type ThesisPillar } from './a15-thesis';
export { buildA16InvestmentStructure } from './a16-investment-structure';
export { buildA17PreCompletionMarketing } from './a17-pre-completion-marketing';

/** D30 M-17: SLIDE_ARCHETYPE_REGISTRY — PPTX 빌더 레지스트리 (17종)
 * archetype-registry.ts의 ALL_ARCHETYPES(편성 25종)와 구분 */
export const SLIDE_ARCHETYPE_REGISTRY: Record<string, any> = {
  A01: buildA01Cover,
  A02: buildA02StatGrid,
  A03: buildA03LargeTable,
  A04: buildA04Asymmetric75,
  A05: buildA05Asymmetric74,
  A06: buildA06Diagram,
  A07: buildA07ThreeBlock,
  A08: buildA08DualTable,
  A09: buildA09Process,
  A10: buildA10Closing,
  A11: buildA11RoomSpec,
  A12: buildA12Ownership,
  A13: buildA13Operating,
  A14: buildA14Gallery,
  A15: buildA15Thesis,
  A16: buildA16InvestmentStructure,
  A17: buildA17PreCompletionMarketing,
};

/** @deprecated D30 M-17: SLIDE_ARCHETYPE_REGISTRY로 개명됨 */
export const ARCHETYPE_REGISTRY = SLIDE_ARCHETYPE_REGISTRY;
