import { describe, it, expect, vi } from "vitest";
import { hashIp, logGateAccess } from "./gate-audit-logger";
import { expireGateRequests } from "./gate-expiry-cron";
import type { SupabaseClient } from "@supabase/supabase-js";

// recordEvent 모킹
vi.mock("@/domain/analytics/record-event", () => ({
  recordEvent: vi.fn().mockResolvedValue({ id: "mock-event-123" }),
}));

describe("Gate Audit Trail & Expiry", () => {
  describe("hashIp", () => {
    it("should hash IP using SHA-256 and return consistent hex string", () => {
      const ip = "127.0.0.1";
      const hash1 = hashIp(ip);
      const hash2 = hashIp(ip);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex is 64 chars
      expect(hash1).not.toBe(ip);
    });

    it("should return empty string for falsy input", () => {
      expect(hashIp("")).toBe("");
    });
  });

  describe("logGateAccess", () => {
    it("should insert log and trigger event successfully", async () => {
      // Supabase mock client
      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });
      const mockSupabase = { from: mockFrom } as unknown as SupabaseClient;

      const input = {
        gateRequestId: "req-111",
        accessorId: "user-222",
        buildingId: "bldg-333",
        accessedFields: ["price_band", "floor_info"],
        accessType: "view" as const,
        ipAddress: "192.168.1.100",
        userAgent: "Mozilla/5.0",
      };

      const result = await logGateAccess(mockSupabase, input);

      expect(result).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith("gate_access_log");
      expect(mockInsert).toHaveBeenCalledWith({
        gate_request_id: "req-111",
        accessor_id: "user-222",
        building_id: "bldg-333",
        accessed_fields: ["price_band", "floor_info"],
        access_type: "view",
        ip_hash: hashIp("192.168.1.100"),
        user_agent: "Mozilla/5.0",
      });
    });
  });

  describe("expireGateRequests", () => {
    it("should update and log expired gate requests", async () => {
      const expiredData = [
        { id: "req-expired-1", building_id: "bldg-x", requester_id: "user-a" },
        { id: "req-expired-2", building_id: "bldg-y", requester_id: "user-b" },
      ];

      // Chainable Mock
      const mockSelect = vi.fn().mockResolvedValue({ data: expiredData, error: null });
      const mockLt = vi.fn().mockReturnValue({ select: mockSelect });
      const mockEq2 = vi.fn().mockReturnValue({ lt: mockLt });
      const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 });
      const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate });
      const mockSupabase = { from: mockFrom } as unknown as SupabaseClient;

      const result = await expireGateRequests(mockSupabase);

      expect(result.success).toBe(true);
      expect(result.expiredCount).toBe(2);
      expect(mockFrom).toHaveBeenCalledWith("gate_requests");
      expect(mockUpdate).toHaveBeenCalledWith({ status: "expired", auto_expired: true });
      expect(mockEq1).toHaveBeenCalledWith("status", "approved");
      expect(mockEq2).toHaveBeenCalledWith("auto_expired", false);
    });
  });
});
