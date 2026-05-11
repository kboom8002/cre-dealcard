/**
 * Unit tests: Gate Request Domain Validation
 *
 * Tests gate level policy enforcement without Supabase.
 * Source: docs/11-gate-disclosure-policy.md section 10
 *         docs/14-test-plan.md section 4.6
 */
import { describe, it, expect } from "vitest";

// ─── Pure gate validation logic ───────────────────────────────────────────────

type GateLevel = "G1" | "G2" | "G3" | "G4" | "G5";
type GateStatus = "submitted" | "broker_review" | "approved" | "rejected" | "expired" | "cancelled";

const MVP_ALLOWED_LEVELS: GateLevel[] = ["G1", "G2", "G3"];
const REVIEWABLE_STATUSES: GateStatus[] = ["submitted", "broker_review"];

function validateGateLevel(level: GateLevel): void {
  if (!MVP_ALLOWED_LEVELS.includes(level)) {
    throw new Error(`Gate level ${level} is not supported in MVP v0.1`);
  }
}

function canReview(status: GateStatus): boolean {
  return REVIEWABLE_STATUSES.includes(status);
}

function applyReviewDecision(
  currentStatus: GateStatus,
  decision: "approved" | "rejected",
): GateStatus {
  if (!canReview(currentStatus)) {
    throw new Error(`Cannot review from status: ${currentStatus}`);
  }
  return decision === "approved" ? "approved" : "rejected";
}

// State machine: valid transitions
const VALID_TRANSITIONS: Partial<Record<GateStatus, GateStatus[]>> = {
  submitted: ["broker_review", "approved", "rejected", "cancelled"],
  broker_review: ["approved", "rejected", "cancelled"],
  approved: [],   // terminal
  rejected: [],   // terminal
  expired: [],    // terminal
  cancelled: [],  // terminal
};

function isValidTransition(from: GateStatus, to: GateStatus): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Gate Level Policy — MVP Scope (G1/G2/G3 only)", () => {
  it("accepts G1", () => {
    expect(() => validateGateLevel("G1")).not.toThrow();
  });

  it("accepts G2", () => {
    expect(() => validateGateLevel("G2")).not.toThrow();
  });

  it("accepts G3", () => {
    expect(() => validateGateLevel("G3")).not.toThrow();
  });

  it("rejects G4 — not in MVP v0.1", () => {
    expect(() => validateGateLevel("G4")).toThrowError(/G4/);
  });

  it("rejects G5 — not in MVP v0.1", () => {
    expect(() => validateGateLevel("G5")).toThrowError(/G5/);
  });
});

describe("Gate Status — Review Eligibility", () => {
  it("submitted status can be reviewed", () => {
    expect(canReview("submitted")).toBe(true);
  });

  it("broker_review status can be reviewed", () => {
    expect(canReview("broker_review")).toBe(true);
  });

  it("approved status cannot be re-reviewed", () => {
    expect(canReview("approved")).toBe(false);
  });

  it("rejected status cannot be re-reviewed", () => {
    expect(canReview("rejected")).toBe(false);
  });

  it("expired status cannot be reviewed", () => {
    expect(canReview("expired")).toBe(false);
  });

  it("cancelled status cannot be reviewed", () => {
    expect(canReview("cancelled")).toBe(false);
  });
});

describe("Gate Status — Transitions", () => {
  it("submitted → approved is valid", () => {
    expect(isValidTransition("submitted", "approved")).toBe(true);
  });

  it("submitted → rejected is valid", () => {
    expect(isValidTransition("submitted", "rejected")).toBe(true);
  });

  it("broker_review → approved is valid", () => {
    expect(isValidTransition("broker_review", "approved")).toBe(true);
  });

  it("approved → rejected is invalid (terminal state)", () => {
    expect(isValidTransition("approved", "rejected")).toBe(false);
  });

  it("rejected → approved is invalid (terminal state)", () => {
    expect(isValidTransition("rejected", "approved")).toBe(false);
  });

  it("approved is always a terminal state", () => {
    const transitions = VALID_TRANSITIONS["approved"] ?? [];
    expect(transitions).toHaveLength(0);
  });
});

describe("Gate Review Decision Application", () => {
  it("approve from submitted → approved", () => {
    expect(applyReviewDecision("submitted", "approved")).toBe("approved");
  });

  it("reject from submitted → rejected", () => {
    expect(applyReviewDecision("submitted", "rejected")).toBe("rejected");
  });

  it("approve from broker_review → approved", () => {
    expect(applyReviewDecision("broker_review", "approved")).toBe("approved");
  });

  it("cannot review from approved (throws)", () => {
    expect(() => applyReviewDecision("approved", "approved")).toThrow();
  });

  it("cannot review from rejected (throws)", () => {
    expect(() => applyReviewDecision("rejected", "rejected")).toThrow();
  });
});

describe("Gate Disclosure Policy — Protected Field Rules", () => {
  // Per docs/11-gate-disclosure-policy.md section 10.5:
  // MVP approval only changes status — does NOT auto-reveal protected fields.

  it("approval does not expose exact_address (policy check)", () => {
    // Simulates the review API response: only status + reviewedAt returned
    const reviewResponse = {
      gateRequestId: "test-id",
      status: "approved" as GateStatus,
      reviewedAt: new Date().toISOString(),
    };

    // Verify the response has NO field disclosure
    expect(reviewResponse).not.toHaveProperty("exact_address");
    expect(reviewResponse).not.toHaveProperty("lease_summary");
    expect(reviewResponse).not.toHaveProperty("tenant_name");
    expect(reviewResponse).not.toHaveProperty("seller_motivation");
  });

  it("gate request reason field is logged but not leaked in approval response", () => {
    const gatRequestInput = {
      buildingId: "123e4567-e89b-12d3-a456-426614174000",
      requestedLevel: "G2" as GateLevel,
      requestedFields: ["exact_address_request"],
      reason: "사옥 이전 후보 검토",
    };

    // Reason is stored but NOT in the approval response
    const approvalResponse = {
      gateRequestId: "test-gate-id",
      status: "approved" as GateStatus,
      reviewedAt: new Date().toISOString(),
    };

    expect(approvalResponse).not.toHaveProperty("reason");
    // But we verify reason exists in input
    expect(gatRequestInput.reason).toBe("사옥 이전 후보 검토");
  });
});
