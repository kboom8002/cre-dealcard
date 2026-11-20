-- Ensure external_reports.url has a unique index so future upserts and dedup queries stay fast & safe.
-- Safe & idempotent: deduplicates any pre-existing duplicate URLs (if any) before creating the unique index.
DELETE FROM public.external_reports a
USING public.external_reports b
WHERE a.ctid < b.ctid
  AND a.url IS NOT NULL
  AND a.url = b.url;

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_reports_url_unique
  ON public.external_reports (url);
