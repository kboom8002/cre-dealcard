import { describe, it, expect } from "vitest";
import { ALL_VIBE_TEMPLATES, getTemplateById } from "../vibe-templates";
import { matchTemplates, computeComplementaryVibe } from "../vibe-complement";
import type { Vibe7D } from "../vibe-vector";

describe("Vibe Card System Tests", () => {
  it("should have exactly 32 preset templates", () => {
    expect(ALL_VIBE_TEMPLATES.length).toBe(32);
  });

  it("should populate bgImageUrl for all templates pointing to Supabase Storage", () => {
    for (const tmpl of ALL_VIBE_TEMPLATES) {
      expect(tmpl.css.bgImageUrl).toBeDefined();
      expect(tmpl.css.bgImageUrl).toContain(
        "https://vwbmaulavgjwezffbxgi.supabase.co/storage/v1/object/public/vibe-backgrounds/"
      );
      
      const expectedFileName = `${tmpl.id.toLowerCase().replace("-", "_")}.png`;
      expect(tmpl.css.bgImageUrl).toContain(expectedFileName);
    }
  });

  it("should retrieve a template by ID", () => {
    const tmpl = getTemplateById("CC-01");
    expect(tmpl).toBeDefined();
    expect(tmpl?.id).toBe("CC-01");
    expect(tmpl?.vtiFamily).toBe("Calm-Care");
  });

  it("should match templates using complementary vector engine", () => {
    // Calm-Care profile photo vibe
    const photoVibe: Vibe7D = {
      warmth: 0.85,
      energy: 0.35,
      polish: 0.70,
      authentic: 0.90,
      heritage: 0.80,
      futuristic: 0.20,
      playful: 0.30
    };

    // Calculate complement vector
    const complementVibe = computeComplementaryVibe(photoVibe);
    expect(complementVibe).toBeDefined();
    expect(complementVibe.energy).toBeGreaterThan(photoVibe.energy); // should boost low energy
    expect(complementVibe.warmth).toBeLessThan(photoVibe.warmth);    // should dilute high warmth

    // Match templates
    const matches = matchTemplates(photoVibe, complementVibe, ALL_VIBE_TEMPLATES, 3);
    expect(matches.length).toBe(3);
    expect(matches[0].template).toBeDefined();
    expect(matches[0].score).toBeGreaterThan(0);
  });
});
