-- external_news 테이블 확장: LLM 기반 뉴스 파이프라인 고도화
-- importance_score: AI 판단 CRE 적합성 점수 (1-10)
-- regions: 관련 권역 배열
-- topic: 뉴스 카테고리

ALTER TABLE external_news ADD COLUMN IF NOT EXISTS importance_score INTEGER DEFAULT 5;
ALTER TABLE external_news ADD COLUMN IF NOT EXISTS regions TEXT[] DEFAULT '{all}';
ALTER TABLE external_news ADD COLUMN IF NOT EXISTS topic VARCHAR(50);
