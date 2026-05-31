import { describe, it, expect } from "vitest";
import { validateLeaseTransition } from "@/domain/pipeline/lease-pipeline-fsm";

describe("Lease Pipeline FSM Validation", () => {
  it("should block invalid transition from listing_created to Viewing", () => {
    const enteredAt = new Date().toISOString();
    const result = validateLeaseTransition("listing_created", "viewing", {}, enteredAt);
    expect(result.valid).toBe(false);
  });

  it("should fail validation from listing_created to matching if required fields are missing", () => {
    const enteredAt = new Date().toISOString();
    const result = validateLeaseTransition("listing_created", "matching", {}, enteredAt);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("lease_space_id");
  });

  it("should pass validation from listing_created to matching when required fields are present", () => {
    const enteredAt = new Date().toISOString();
    const result = validateLeaseTransition(
      "listing_created",
      "matching",
      { lease_space_id: "space-123" },
      enteredAt
    );
    expect(result.valid).toBe(true);
    expect(result.missing.length).toBe(0);
  });

  it("should flag hold warning when state is stuck for longer than contract days", () => {
    // listing_created -> matching hold limit is 7 days. Let's make it 8 days ago.
    const enteredAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const result = validateLeaseTransition(
      "listing_created",
      "matching",
      { lease_space_id: "space-123" },
      enteredAt
    );
    expect(result.valid).toBe(true);
    expect(result.holdWarning).toBe(true);
    expect(result.holdDays).toBe(8);
  });

  it("should allow any state transition to expired without required fields", () => {
    const enteredAt = new Date().toISOString();
    const result = validateLeaseTransition("negotiation", "expired", {}, enteredAt);
    expect(result.valid).toBe(true);
    expect(result.missing.length).toBe(0);
  });
});
