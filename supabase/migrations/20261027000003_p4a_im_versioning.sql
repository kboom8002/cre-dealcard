-- ============================================================================
-- 20261027000003_p4a_im_versioning.sql
-- 목적  : Phase P4a-1 IM Version Management Schema
--         im_series, versioning columns in document_objects, im_input_snapshots,
--         im_approvals, im_renditions, im_studio_states, im_share_links,
--         RPCs (create_im_version, approve_im_version, seal_im_version) and
--         sealed version immutability trigger.
-- 근거  : docs/CREDEAL_무마찰UX_4대작업공간_개편_설계서.md §5.7, WP-P4a1-01
-- [롤백] supabase/migrations/_rollback/20261027000003_p4a_im_versioning_rollback.sql
-- ============================================================================

BEGIN;

-- 1. im_series 테이블 (IM 버전 묶음)
CREATE TABLE IF NOT EXISTS public.im_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES public.building_ssot_lite(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  label TEXT,
  purpose TEXT NOT NULL DEFAULT 'investment',
  audience_note TEXT,
  default_preset TEXT,
  latest_version_no INT NOT NULL DEFAULT 0,
  latest_approved_version_no INT,
  current_draft_version_id UUID,
  latest_approved_version_id UUID,
  published_version_id UUID,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS im_series_building_id_idx ON public.im_series(building_id);
CREATE INDEX IF NOT EXISTS im_series_owner_id_idx ON public.im_series(owner_id);

ALTER TABLE public.im_series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "im_series_select_owner"
  ON public.im_series FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "im_series_insert_owner"
  ON public.im_series FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "im_series_update_owner"
  ON public.im_series FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid());

-- 2. document_objects: 2-Tier 버전 관리 컬럼 확장
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_objects' AND column_name='series_id') THEN
    ALTER TABLE public.document_objects ADD COLUMN series_id UUID REFERENCES public.im_series(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_objects' AND column_name='version_no') THEN
    ALTER TABLE public.document_objects ADD COLUMN version_no INT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_objects' AND column_name='parent_version_id') THEN
    ALTER TABLE public.document_objects ADD COLUMN parent_version_id UUID REFERENCES public.document_objects(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_objects' AND column_name='origin') THEN
    ALTER TABLE public.document_objects ADD COLUMN origin TEXT DEFAULT 'generate';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_objects' AND column_name='generation_job_id') THEN
    ALTER TABLE public.document_objects ADD COLUMN generation_job_id TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_objects' AND column_name='input_snapshot_id') THEN
    ALTER TABLE public.document_objects ADD COLUMN input_snapshot_id UUID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_objects' AND column_name='content_hash') THEN
    ALTER TABLE public.document_objects ADD COLUMN content_hash TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_objects' AND column_name='doc_hash') THEN
    ALTER TABLE public.document_objects ADD COLUMN doc_hash TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_objects' AND column_name='sealed_at') THEN
    ALTER TABLE public.document_objects ADD COLUMN sealed_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_objects' AND column_name='seal_hash') THEN
    ALTER TABLE public.document_objects ADD COLUMN seal_hash TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_objects' AND column_name='superseded_by') THEN
    ALTER TABLE public.document_objects ADD COLUMN superseded_by UUID REFERENCES public.document_objects(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='document_objects' AND column_name='label') THEN
    ALTER TABLE public.document_objects ADD COLUMN label TEXT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS document_objects_series_id_idx ON public.document_objects(series_id);
CREATE UNIQUE INDEX IF NOT EXISTS document_objects_series_version_idx
  ON public.document_objects(series_id, version_no)
  WHERE series_id IS NOT NULL AND version_no IS NOT NULL;

-- status check 제약조건에 'superseded' 추가
ALTER TABLE public.document_objects
  DROP CONSTRAINT IF EXISTS document_objects_status_check;

ALTER TABLE public.document_objects
  ADD CONSTRAINT document_objects_status_check
  CHECK (status IN (
    'draft',
    'disclosure_checked',
    'broker_reviewed',
    'approved_internal',
    'shared_external',
    'archived',
    'published',
    'revision_needed',
    'superseded'
  ));

-- 3. im_input_snapshots 테이블 (생성 시점 입력 스냅샷)
CREATE TABLE IF NOT EXISTS public.im_input_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID REFERENCES public.building_ssot_lite(id) ON DELETE CASCADE,
  series_id UUID REFERENCES public.im_series(id) ON DELETE CASCADE,
  version_no INT,
  request JSONB NOT NULL DEFAULT '{}',
  building_state JSONB NOT NULL DEFAULT '{}',
  external_refs JSONB DEFAULT '{}',
  model_version TEXT,
  prompt_version TEXT,
  code_version TEXT,
  policy_version TEXT,
  input_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS im_input_snapshots_series_idx ON public.im_input_snapshots(series_id);

ALTER TABLE public.im_input_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "im_input_snapshots_select_authenticated"
  ON public.im_input_snapshots FOR SELECT
  TO authenticated
  USING (true);

-- 4. im_approvals 테이블 (Append-Only 불변 승인 원장)
CREATE TABLE IF NOT EXISTS public.im_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES public.document_objects(id) ON DELETE CASCADE,
  series_id UUID REFERENCES public.im_series(id) ON DELETE CASCADE,
  version_no INT,
  event TEXT NOT NULL DEFAULT 'approve'
    CHECK (event IN ('approve', 'reject', 'revoke', 'file_approve', 'override_v12', 'self_publish')),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by TEXT,
  target_hash TEXT,
  content_hash TEXT,
  doc_hash TEXT,
  release_tier TEXT NOT NULL DEFAULT 'fact_om',
  policy_version TEXT NOT NULL DEFAULT '2026-08-31',
  gate_result JSONB DEFAULT '{}',
  notes TEXT,
  reason TEXT,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS im_approvals_version_idx ON public.im_approvals(version_id);
CREATE INDEX IF NOT EXISTS im_approvals_series_idx ON public.im_approvals(series_id);

ALTER TABLE public.im_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "im_approvals_select_authenticated"
  ON public.im_approvals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "im_approvals_insert_authenticated"
  ON public.im_approvals FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 5. im_renditions 테이블 (PPTX/PDF 렌디션 및 바이너리 SHA256 핀)
CREATE TABLE IF NOT EXISTS public.im_renditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES public.document_objects(id) ON DELETE CASCADE,
  series_id UUID REFERENCES public.im_series(id) ON DELETE CASCADE,
  version_no INT,
  rendition_type TEXT NOT NULL DEFAULT 'pptx',
  format TEXT NOT NULL DEFAULT 'pptx',
  storage_path TEXT,
  file_path TEXT,
  file_sha256 TEXT NOT NULL,
  preset TEXT,
  theme TEXT,
  renderer_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS im_renditions_version_idx ON public.im_renditions(version_id);
CREATE INDEX IF NOT EXISTS im_renditions_file_sha256_idx ON public.im_renditions(file_sha256);

ALTER TABLE public.im_renditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "im_renditions_select_authenticated"
  ON public.im_renditions FOR SELECT
  TO authenticated
  USING (true);

-- 6. im_studio_states 테이블 (버전별 스튜디오 캔버스 상태)
CREATE TABLE IF NOT EXISTS public.im_studio_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL UNIQUE REFERENCES public.document_objects(id) ON DELETE CASCADE,
  series_id UUID REFERENCES public.im_series(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}',
  slides JSONB DEFAULT '[]',
  lock_version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS im_studio_states_version_idx ON public.im_studio_states(version_id);

ALTER TABLE public.im_studio_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "im_studio_states_select_authenticated"
  ON public.im_studio_states FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "im_studio_states_all_authenticated"
  ON public.im_studio_states FOR ALL
  TO authenticated
  USING (true);

-- 7. im_share_links 테이블 (공유 링크 및 버전 고정)
CREATE TABLE IF NOT EXISTS public.im_share_links (
  token TEXT PRIMARY KEY,
  series_id UUID NOT NULL REFERENCES public.im_series(id) ON DELETE CASCADE,
  version_id UUID REFERENCES public.document_objects(id) ON DELETE SET NULL,
  pinned_version_no INT,
  mode TEXT NOT NULL DEFAULT 'follow_latest'
    CHECK (mode IN ('pinned', 'follow_latest')),
  recipient_id UUID,
  watermark_policy TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS im_share_links_series_idx ON public.im_share_links(series_id);
CREATE INDEX IF NOT EXISTS im_share_links_version_idx ON public.im_share_links(version_id);

ALTER TABLE public.im_share_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "im_share_links_select_all"
  ON public.im_share_links FOR SELECT
  TO authenticated
  USING (true);

-- 8. im_pro_grants 테이블에 version_id 컬럼 추가 (테이블 존재 시)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='im_pro_grants') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='im_pro_grants' AND column_name='version_id') THEN
      ALTER TABLE public.im_pro_grants ADD COLUMN version_id UUID REFERENCES public.document_objects(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- 9. Stored Procedures: create_im_version
CREATE OR REPLACE FUNCTION public.create_im_version(
  p_series_id UUID,
  p_origin TEXT DEFAULT 'generate',
  p_title TEXT DEFAULT 'Mobile IM',
  p_body JSONB DEFAULT '{}',
  p_broker_id UUID DEFAULT NULL
)
RETURNS TABLE (
  new_version_id UUID,
  new_version_no INT
) AS $$
DECLARE
  v_building_id UUID;
  v_owner_id UUID;
  v_next_version_no INT;
  v_inserted_id UUID;
BEGIN
  -- 묶음 행 잠금 (동시성 OCC 방어)
  SELECT building_id, owner_id, COALESCE(latest_version_no, 0) + 1
  INTO v_building_id, v_owner_id, v_next_version_no
  FROM public.im_series
  WHERE id = p_series_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Series with id % not found', p_series_id;
  END IF;

  -- 새 문서 객체 생성
  INSERT INTO public.document_objects (
    building_id,
    owner_id,
    broker_id,
    document_type,
    title,
    body,
    status,
    series_id,
    version_no,
    origin
  ) VALUES (
    v_building_id,
    v_owner_id,
    COALESCE(p_broker_id, v_owner_id),
    'mobile_im_lite',
    p_title,
    p_body,
    'draft',
    p_series_id,
    v_next_version_no,
    p_origin
  )
  RETURNING id INTO v_inserted_id;

  -- 시리즈 최신 버전 번호 및 현재 초안 포인터 갱신
  UPDATE public.im_series
  SET latest_version_no = v_next_version_no,
      current_draft_version_id = v_inserted_id,
      updated_at = now()
  WHERE id = p_series_id;

  RETURN QUERY SELECT v_inserted_id, v_next_version_no;
END;
$$ LANGUAGE plpgsql;

-- 10. Stored Procedure: approve_im_version
CREATE OR REPLACE FUNCTION public.approve_im_version(
  p_version_id UUID,
  p_expected_content_hash TEXT,
  p_actor_id UUID DEFAULT NULL,
  p_release_tier TEXT DEFAULT 'fact_om',
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_doc RECORD;
  v_series_id UUID;
  v_version_no INT;
  v_prev_published_id UUID;
BEGIN
  SELECT id, series_id, version_no, status, content_hash
  INTO v_doc
  FROM public.document_objects
  WHERE id = p_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document % not found', p_version_id;
  END IF;

  v_series_id := v_doc.series_id;
  v_version_no := v_doc.version_no;

  -- 이전 공개 버전 superseded 처리
  IF v_series_id IS NOT NULL THEN
    SELECT published_version_id INTO v_prev_published_id
    FROM public.im_series
    WHERE id = v_series_id;

    IF v_prev_published_id IS NOT NULL AND v_prev_published_id <> p_version_id THEN
      UPDATE public.document_objects
      SET status = 'superseded',
          superseded_by = p_version_id,
          updated_at = now()
      WHERE id = v_prev_published_id;
    END IF;
  END IF;

  -- 문서 승인 상태로 갱신 및 봉인 (body는 절대 수정하지 않음)
  UPDATE public.document_objects
  SET status = 'published',
      sealed_at = now(),
      seal_hash = p_expected_content_hash,
      content_hash = COALESCE(content_hash, p_expected_content_hash),
      updated_at = now()
  WHERE id = p_version_id;

  -- 불변 승인 원장 기록
  INSERT INTO public.im_approvals (
    version_id,
    series_id,
    version_no,
    event,
    actor_id,
    target_hash,
    content_hash,
    release_tier,
    notes,
    approved_at
  ) VALUES (
    p_version_id,
    v_series_id,
    v_version_no,
    'approve',
    p_actor_id,
    p_expected_content_hash,
    p_expected_content_hash,
    p_release_tier,
    p_notes,
    now()
  );

  -- 시리즈 포인터 갱신
  IF v_series_id IS NOT NULL THEN
    UPDATE public.im_series
    SET latest_approved_version_no = v_version_no,
        latest_approved_version_id = p_version_id,
        published_version_id = p_version_id,
        updated_at = now()
    WHERE id = v_series_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 11. Stored Procedure: seal_im_version
CREATE OR REPLACE FUNCTION public.seal_im_version(p_version_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE public.document_objects
  SET sealed_at = COALESCE(sealed_at, now()),
      seal_hash = COALESCE(seal_hash, content_hash),
      updated_at = now()
  WHERE id = p_version_id;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 12. 봉인 버전 불변성 트리거 (Sealed Immutability Trigger)
CREATE OR REPLACE FUNCTION public.check_sealed_im_document()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.sealed_at IS NOT NULL THEN
    IF OLD.body IS DISTINCT FROM NEW.body OR OLD.title IS DISTINCT FROM NEW.title THEN
      RAISE EXCEPTION 'SEALED_VERSION_IMMUTABLE: Cannot mutate body or title of sealed document %', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sealed_im_document ON public.document_objects;
CREATE TRIGGER trg_sealed_im_document
  BEFORE UPDATE ON public.document_objects
  FOR EACH ROW
  EXECUTE FUNCTION public.check_sealed_im_document();

COMMIT;
