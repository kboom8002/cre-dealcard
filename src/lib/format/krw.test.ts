import { describe, it, expect } from "vitest";
import { formatKrwManwon, formatKrwWon } from "./krw";

describe("krw format helpers", () => {
  it("formats manwon correctly", () => {
    expect(formatKrwManwon(150000)).toBe("15억원");
    expect(formatKrwManwon(152500)).toBe("15억 2,500만원");
    expect(formatKrwManwon(500)).toBe("500만원");
    expect(formatKrwManwon(0)).toBe("미정");
    expect(formatKrwManwon(null)).toBe("미정");
  });

  it("formats won correctly", () => {
    expect(formatKrwWon(1500000000)).toBe("15억원");
    expect(formatKrwWon(1525000000)).toBe("15억 2,500만원");
    expect(formatKrwWon(5000000)).toBe("500만원");
  });
});
