-- 00052_broker_memos_enhance.sql
-- 메모함 고도화: 수정 시각, 핀 고정, 태그, 딜카드 전환 추적

-- 1. updated_at 컬럼 추가
ALTER TABLE public.broker_memos 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. is_pinned 컬럼 추가 (중요 메모 상단 고정)
ALTER TABLE public.broker_memos 
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;

-- 3. tags 컬럼 추가 (사용자 정의 태그)
ALTER TABLE public.broker_memos 
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- 4. converted_to 컬럼 추가 (딜카드 전환 추적)
ALTER TABLE public.broker_memos 
  ADD COLUMN IF NOT EXISTS converted_to UUID;

-- 5. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_memo_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_memo_updated_at ON public.broker_memos;
CREATE TRIGGER trg_memo_updated_at
  BEFORE UPDATE ON public.broker_memos
  FOR EACH ROW EXECUTE FUNCTION update_memo_timestamp();

-- 6. 검색용 인덱스
CREATE INDEX IF NOT EXISTS idx_broker_memos_pinned ON public.broker_memos(is_pinned) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_broker_memos_updated_at ON public.broker_memos(updated_at DESC);
