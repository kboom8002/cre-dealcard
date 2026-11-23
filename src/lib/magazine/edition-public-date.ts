/**
 * src/lib/magazine/edition-public-date.ts — Newsletter Issue Date & Cadence Header SSOT
 *
 * Client + server safe pure helper.
 * Unifies:
 *  - Canonical public URL date (prefers actual `published_at` KST date over stale draft `issueDate`)
 *  - Cadence-aware display label (`monthly`: `YYYY년 M월호 (YYYY.MM.DD 발행)`, `weekly`: `YYYY년 M월 N주차 주간호 (YYYY.MM.DD 발행)`, `daily`: Korean full date)
 */
import { formatKoreanDate, parseIssueDate, todayKst, toKstDate } from "@/lib/magazine/kst";
import { deriveCadenceIssueMeta, type NewsletterCadence } from "@/lib/magazine/newsletter-cadence";

export function parseCadenceFromEdition(
  rawCadence?: unknown,
  rawEditionType?: unknown,
  editionLabel?: unknown,
): NewsletterCadence {
  for (const cand of [rawCadence, rawEditionType]) {
    if (cand === "daily" || cand === "weekly" || cand === "monthly") {
      return cand;
    }
  }
  if (typeof editionLabel === "string") {
    const trimmed = editionLabel.trim();
    if (/^\d{4}-\d{2}(?:-(?!\d{2}$)[A-Za-z0-9]+)?$/.test(trimmed) && !parseIssueDate(trimmed)) {
      return "monthly";
    }
    if (
      /^W\d{1,2}-\d{4}/i.test(trimmed) ||
      /^\d{4}-W\d{1,2}/i.test(trimmed) ||
      trimmed.includes("주간")
    ) {
      return "weekly";
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return "daily";
  }
  if (rawEditionType === "special" || rawCadence === "special") {
    return "daily";
  }
  return "monthly";
}

export function toPublishedKstDate(
  timestampRaw: unknown,
  fallbackDate?: unknown,
): string | null {
  if (typeof timestampRaw === "string" && timestampRaw.trim()) {
    const trimmed = timestampRaw.trim();
    if (parseIssueDate(trimmed)) return trimmed;
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) {
      return toKstDate(d);
    }
  }
  if (typeof fallbackDate === "string" && parseIssueDate(fallbackDate.trim())) {
    return fallbackDate.trim();
  }
  return null;
}

export function formatDotDate(dateStr: string | null | undefined): string {
  if (!dateStr || !parseIssueDate(dateStr)) return "";
  return dateStr.replace(/-/g, ".");
}

export interface EditionPublicDateAndHeaderInput {
  cadence?: unknown;
  editionType?: unknown;
  editionLabel?: unknown;
  issueDate?: unknown;
  publishedAt?: unknown;
  createdAt?: unknown;
  urlDate?: unknown;
  now?: Date;
}

export interface EditionPublicDateAndHeader {
  cadence: NewsletterCadence;
  canonicalUrlDate: string;
  publishedKstDate: string | null;
  issueLabel: string;
  displayDateLabel: string;
}

export function resolveEditionPublicDateAndHeader(
  input: EditionPublicDateAndHeaderInput,
): EditionPublicDateAndHeader {
  const cadence = parseCadenceFromEdition(
    input.cadence,
    input.editionType,
    input.editionLabel,
  );
  const labelStr =
    typeof input.editionLabel === "string" ? input.editionLabel.trim() : "";
  const validIssueDate =
    typeof input.issueDate === "string" && parseIssueDate(input.issueDate.trim())
      ? input.issueDate.trim()
      : null;
  const validUrlDate =
    typeof input.urlDate === "string" && parseIssueDate(input.urlDate.trim())
      ? input.urlDate.trim()
      : null;
  const publishedKstDate = toPublishedKstDate(input.publishedAt);
  const createdKstDate = toPublishedKstDate(input.createdAt);

  const canonicalUrlDate =
    publishedKstDate ||
    (parseIssueDate(labelStr) ? labelStr : null) ||
    validIssueDate ||
    validUrlDate ||
    createdKstDate ||
    todayKst(input.now);

  const anchorDate = validUrlDate || publishedKstDate || canonicalUrlDate;
  const dotDate = formatDotDate(publishedKstDate || canonicalUrlDate);

  if (cadence === "monthly") {
    const ymMatch = !parseIssueDate(labelStr)
      ? /^(\d{4})-(\d{2})(?:-(?!\d{2}$)[A-Za-z0-9]+)?$/.exec(labelStr)
      : null;
    const [ay, am] = anchorDate.split("-").map(Number);
    const meta = deriveCadenceIssueMeta("monthly", {
      year: ymMatch ? Number(ymMatch[1]) : ay,
      month: ymMatch ? Number(ymMatch[2]) : am,
    });
    return {
      cadence,
      canonicalUrlDate,
      publishedKstDate,
      issueLabel: meta.yearMonthLabel,
      displayDateLabel: dotDate
        ? `${meta.yearMonthLabel} · ${dotDate} 발행`
        : meta.yearMonthLabel,
    };
  }

  if (cadence === "weekly") {
    const meta = deriveCadenceIssueMeta("weekly", { dateStr: anchorDate });
    return {
      cadence,
      canonicalUrlDate,
      publishedKstDate,
      issueLabel: meta.yearMonthLabel,
      displayDateLabel: dotDate
        ? `${meta.yearMonthLabel} · ${dotDate} 발행`
        : meta.yearMonthLabel,
    };
  }

  const dailyAnchor = parseIssueDate(labelStr) ? labelStr : anchorDate;
  const dailyKorean = formatKoreanDate(dailyAnchor);
  return {
    cadence: "daily",
    canonicalUrlDate,
    publishedKstDate,
    issueLabel: dailyKorean,
    displayDateLabel: dailyKorean,
  };
}
