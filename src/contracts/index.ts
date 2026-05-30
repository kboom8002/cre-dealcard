/**
 * contracts/index.ts
 *
 * Barrel re-export for all domain contracts.
 * Import from '@/contracts' for easy access:
 *
 * @example
 * ```ts
 * import { SpaceSSoTSchema, TenantFitResultSchema, TENANT_TYPES } from '@/contracts'
 * ```
 */

export * from "./enums";
export * from "./space";
export * from "./visual";
export * from "./tenant-fit";
export * from "./leasing-page";
export * from "./inquiry";
export * from "./handoff";
export * from "./events";
