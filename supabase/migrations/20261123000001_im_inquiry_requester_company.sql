-- Wave 3 (A5-04): Persist buyer company/organization on public IM inquiry requests
ALTER TABLE IF EXISTS public.im_inquiry_requests
  ADD COLUMN IF NOT EXISTS requester_company text;
