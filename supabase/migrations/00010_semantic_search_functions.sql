/**
 * Semantic Search Functions — G-D + G-I
 * pgvector-based cosine similarity search
 * Run after pgvector extension is enabled in Supabase
 */

-- G-D: 유사 딜 CasePack 검색
create or replace function search_similar_deals(
  query_embedding  vector(1536),
  match_threshold  float   default 0.70,
  match_count      int     default 5,
  exclude_id       uuid    default null
)
returns table (
  id              uuid,
  task            text,
  knowledge       text,
  warning         text,
  situation       text,
  source_event_type text,
  similarity      float
)
language sql stable as $$
  select
    id, task, knowledge, warning, situation, source_event_type,
    1 - (embedding <=> query_embedding) as similarity
  from deal_casepacks
  where embedding is not null
    and (exclude_id is null or id != exclude_id)
    and 1 - (embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;

-- G-I: 유사 IM 프로젝트 검색
create or replace function search_similar_ims(
  query_embedding  vector(1536),
  match_threshold  float   default 0.70,
  match_count      int     default 3,
  outcome_filter   text    default null  -- 'success'|'failed'|null
)
returns table (
  id               uuid,
  outcome          text,
  outcome_notes    text,
  readiness_score  integer,
  similarity       float
)
language sql stable as $$
  select
    id, outcome, outcome_notes, readiness_score,
    1 - (embedding <=> query_embedding) as similarity
  from im_projects
  where embedding is not null
    and (outcome_filter is null or outcome = outcome_filter)
    and 1 - (embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;
