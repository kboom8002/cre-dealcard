/**
 * 회귀 보호 (2026-10-16 운영 500): 독자 뷰어 서버 렌더 경로가 isomorphic-dompurify(jsdom)를 끌어오면
 * Vercel 런타임에서 `ERR_REQUIRE_ESM`(html-encoding-sniffer → @exodus/bytes)으로 모듈 로딩이 실패해
 * `/magazine/{slug}/{date}` 가 전부 500 이 된다. 로컬 Node 24 에서는 재현되지 않으므로 정적 가드로 막는다.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { briefingParaToSafeHtml } from "@/components/magazine/viewer-primitives";

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("viewer: jsdom 의존성 금지", () => {
  it("(magazine) 라우트·components/magazine 은 isomorphic-dompurify/jsdom 을 import 하지 않는다", () => {
    const roots = [path.join("src", "app", "(magazine)"), path.join("src", "components", "magazine")];
    const offenders = roots
      .filter((r) => fs.existsSync(r))
      .flatMap((r) => walk(r))
      .filter((f) => /from\s+["'](isomorphic-dompurify|jsdom)["']|require\(["'](isomorphic-dompurify|jsdom)["']\)/.test(fs.readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("briefingParaToSafeHtml", () => {
  it("사용자 입력의 태그·속성은 이스케이프된다", () => {
    const html = briefingParaToSafeHtml('<img src=x onerror="alert(1)"><script>alert(2)</script>');
    expect(html).not.toMatch(/<img|<script/i);
    expect(html).toContain("&lt;img");
  });
  it("** 강조 안의 주입도 무력화된다", () => {
    const html = briefingParaToSafeHtml("**<b onclick=x>굵게</b>**");
    expect(html).toMatch(/^<strong class="text-white font-bold">&lt;b onclick=/);
    expect(html).not.toMatch(/<b /);
  });
  it("퍼센트·억 강조 마크업은 유지된다", () => {
    const html = briefingParaToSafeHtml("공실률 3.5% 하락, 거래액 120억");
    expect(html).toContain('<span class="text-indigo-200 font-bold font-mono">3.5%</span>');
    expect(html).toContain('<span class="text-emerald-200 font-bold">120억</span>');
  });
});
