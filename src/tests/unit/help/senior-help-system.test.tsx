import { describe, it, expect } from "vitest";
import {
  BROKER_TUTORIAL_MODULES,
  BROKER_GLOSSARY_LIST,
  BROKER_MESSAGE_TEMPLATES,
  BROKER_FEEDBACK_SCENARIOS,
  POSTURE_GUIDE_ROWS,
} from "@/lib/tutorial/broker-tutorial-data";
import { SeniorHelpProvider, useSeniorHelp } from "@/components/help/SeniorHelpContext";
import { SeniorTermTooltip } from "@/components/help/SeniorTermTooltip";
import { KakaoTemplatePicker } from "@/components/help/KakaoTemplatePicker";
import { ContextualHelpDrawer } from "@/components/help/ContextualHelpDrawer";
import { QuickRemedyPopover } from "@/components/help/QuickRemedyPopover";
import { RentRollAiHelperModal } from "@/components/help/RentRollAiHelperModal";

describe("60s Broker In-App Contextual Help System (4-Tier Architecture)", () => {
  it("exports all 4-Tier Senior Help components and context hooks", () => {
    expect(typeof SeniorHelpProvider).toBe("function");
    expect(typeof useSeniorHelp).toBe("function");
    expect(typeof SeniorTermTooltip).toBe("function");
    expect(typeof KakaoTemplatePicker).toBe("function");
    expect(typeof ContextualHelpDrawer).toBe("function");
    expect(typeof QuickRemedyPopover).toBe("function");
    expect(typeof RentRollAiHelperModal).toBe("function");
  });

  it("maintains complete SSOT data backing for glossary, postures, Kakao templates, and 30-sec remedies", () => {
    expect(BROKER_TUTORIAL_MODULES.length).toBeGreaterThanOrEqual(10);
    expect(BROKER_GLOSSARY_LIST.length).toBeGreaterThanOrEqual(10);
    expect(POSTURE_GUIDE_ROWS.length).toBe(5);
    expect(BROKER_MESSAGE_TEMPLATES.length).toBe(6);
    expect(BROKER_FEEDBACK_SCENARIOS.length).toBe(6);

    const prepModule = BROKER_TUTORIAL_MODULES.find((m) => m.id === "module-prep");
    expect(prepModule).toBeDefined();
    const stepMethodA = prepModule?.steps.find((s) => s.id === "step-prep-3");
    expect(stepMethodA?.copySample?.text).toContain("[CREDEAL 렌트롤 변환 요청]");
  });
});
