import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedGhostDemands } from "./ghost-demand-seeder";

describe("seedGhostDemands", () => {
  let mockSupabase: any;
  let mockChain: any;
  const brokerId = "test-broker-id";

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup flexible fluent chain mock for Supabase
    mockChain = {
      select: vi.fn().mockImplementation(() => mockChain),
      insert: vi.fn().mockImplementation(() => mockChain),
      eq: vi.fn().mockImplementation(() => mockChain),
      contains: vi.fn().mockImplementation(() => mockChain),
      single: vi.fn().mockImplementation(() => mockChain),
      maybeSingle: vi.fn().mockImplementation(() => mockChain),
    };

    mockSupabase = {
      from: vi.fn().mockImplementation(() => mockChain),
    };
  });

  it("should seed all 5 ghost buyers if they do not exist", async () => {
    // 1) First, mock the duplicate check to return null (meaning they don't exist yet)
    // 2) Second, mock the insert resolution
    let duplicateCheck = true;

    mockChain.then = vi.fn().mockImplementation((resolve) => {
      if (duplicateCheck) {
        // First calls of 'then' will resolve the select checks to null
        resolve({ data: null, error: null });
        duplicateCheck = false; // toggle for next calls or inserts
      } else {
        // Subsequent calls are insert resolutions
        resolve({ data: { id: "mocked-buyer-intent-id" }, error: null });
        duplicateCheck = true; // reset for next item loop
      }
      return mockChain;
    });

    const summary = await seedGhostDemands(mockSupabase, brokerId);

    expect(summary.seededCount).toBe(5);
    expect(summary.buyers.length).toBe(5);
    expect(summary.buyers[0].name).toContain("한강코퍼레이션");
    expect(mockSupabase.from).toHaveBeenCalledWith("buyer_intent_lite");
  });

  it("should skip seeding if buyers already exist for the broker", async () => {
    // Mock the duplicate check to return an existing buyer object
    mockChain.then = vi.fn().mockImplementation((resolve) => {
      resolve({ data: { id: "existing-buyer-id" }, error: null });
      return mockChain;
    });

    const summary = await seedGhostDemands(mockSupabase, brokerId);

    expect(summary.seededCount).toBe(0);
    expect(summary.buyers.length).toBe(0);
  });
});
