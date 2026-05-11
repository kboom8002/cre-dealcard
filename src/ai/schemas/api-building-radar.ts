/**
 * API request/response schemas for /api/public/building-radar
 * Source: docs/08-api-contracts.md sections 5-6
 */
import { z } from "zod/v4";

export const UserPurposeEnum = z.enum([
  "sell_consideration",
  "buy_consideration",
  "owner_user_hq",
  "broker_work",
  "investment_learning",
]);
export type UserPurpose = z.infer<typeof UserPurposeEnum>;

export const PublicBuildingRadarGenerateRequest = z.object({
  input: z.string().min(2),
  inputType: z.enum(["address", "manual_text"]).default("address"),
  userPurpose: UserPurposeEnum,
});
export type PublicRadarGenerateReq = z.infer<
  typeof PublicBuildingRadarGenerateRequest
>;

export const PublicBuildingRadarGenerateResponse = z.object({
  buildingId: z.string().uuid(),
  reportId: z.string().uuid(),
  status: z.enum(["completed", "queued"]),
});

export const PublicBuildingRadarResultResponse = z.object({
  building: z.object({
    id: z.string().uuid(),
    areaSignal: z.string().nullable(),
    assetType: z.string().nullable(),
    priceBand: z.string().nullable(),
    status: z.string(),
  }),
  report: z.object({
    id: z.string().uuid(),
    title: z.string().nullable(),
    body: z.record(z.string(), z.any()),
    markdown: z.string().nullable(),
    status: z.string(),
    createdAt: z.string(),
  }),
});
