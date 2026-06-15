-- 00051_broker_memos.sql

CREATE TABLE IF NOT EXISTS public.broker_memos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    memo_text TEXT NOT NULL,
    routing_type TEXT,
    routing_summary TEXT,
    status TEXT NOT NULL DEFAULT 'saved' CHECK (status IN ('saved', 'converted', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.broker_memos ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can insert own memos" 
    ON public.broker_memos FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own memos" 
    ON public.broker_memos FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own memos" 
    ON public.broker_memos FOR UPDATE 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own memos" 
    ON public.broker_memos FOR DELETE 
    USING (auth.uid() = user_id);

-- Indices
CREATE INDEX IF NOT EXISTS idx_broker_memos_user_id ON public.broker_memos(user_id);
CREATE INDEX IF NOT EXISTS idx_broker_memos_status ON public.broker_memos(status);
CREATE INDEX IF NOT EXISTS idx_broker_memos_created_at ON public.broker_memos(created_at DESC);
