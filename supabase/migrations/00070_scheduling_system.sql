-- ============================================================
-- 00052_scheduling_system.sql
-- Intelligent Scheduling System (Availability Slots, Bookings, Waitlists)
-- ============================================================

-- ── 1. availability_slots ────────────────────────────────────
-- SSoT for available time slots provided by a broker, owner, or expert.
CREATE TABLE IF NOT EXISTS availability_slots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  building_id     UUID REFERENCES building_ssot_lite(id) ON DELETE CASCADE,

  -- Time Info
  slot_date       DATE NOT NULL,
  slot_start      TIMESTAMPTZ NOT NULL,
  slot_end        TIMESTAMPTZ NOT NULL,
  slot_type       TEXT NOT NULL DEFAULT 'standard'
    CHECK (slot_type IN ('standard', 'site_tour', 'expert_consultation', 'buyer_meeting')),

  -- State Machine
  status          TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'held', 'confirmed', 'blocked', 'completed', 'cancelled')),
  held_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  held_until      TIMESTAMPTZ,

  -- Pricing (Gate protected)
  price_band      TEXT,
  exact_price     INTEGER,

  -- Metadata
  recurrence_rule TEXT,
  capacity        INTEGER DEFAULT 1,
  notes           TEXT,
  metadata        JSONB DEFAULT '{}',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Prevent overlapping slots for the same owner
  UNIQUE (owner_id, slot_start, slot_end)
);

CREATE INDEX IF NOT EXISTS availability_slots_owner_idx ON availability_slots(owner_id);
CREATE INDEX IF NOT EXISTS availability_slots_building_idx ON availability_slots(building_id);
CREATE INDEX IF NOT EXISTS availability_slots_date_idx ON availability_slots(slot_date);
CREATE INDEX IF NOT EXISTS availability_slots_status_idx ON availability_slots(status);

ALTER TABLE availability_slots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'availability_slots' AND policyname = 'availability_slots_read') THEN
    CREATE POLICY "availability_slots_read" ON availability_slots FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'availability_slots' AND policyname = 'availability_slots_write_own') THEN
    CREATE POLICY "availability_slots_write_own" ON availability_slots FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

CREATE OR REPLACE TRIGGER availability_slots_updated_at
  BEFORE UPDATE ON availability_slots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2. bookings ──────────────────────────────────────────────
-- State machine for reservations made by clients/buyers.
CREATE TABLE IF NOT EXISTS bookings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id         UUID NOT NULL REFERENCES availability_slots(id) ON DELETE CASCADE,
  requester_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  booked_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  buyer_intent_id UUID REFERENCES buyer_intent_lite(id) ON DELETE SET NULL,
  
  -- State Machine
  status          TEXT NOT NULL DEFAULT 'hold'
    CHECK (status IN ('hold', 'confirmed', 'completed', 'cancelled', 'no_show')),
  hold_expires_at TIMESTAMPTZ,
  confirmed_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  cancellation_reason TEXT,

  -- Integration
  gate_request_id UUID REFERENCES gate_requests(id) ON DELETE SET NULL,
  match_result_id UUID REFERENCES match_results(id) ON DELETE SET NULL,
  fit_score       INTEGER,

  -- Pricing
  quoted_price    INTEGER,
  deposit_amount  INTEGER,

  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bookings_slot_idx ON bookings(slot_id);
CREATE INDEX IF NOT EXISTS bookings_requester_idx ON bookings(requester_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON bookings(status);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bookings' AND policyname = 'bookings_read') THEN
    CREATE POLICY "bookings_read" ON bookings FOR SELECT TO authenticated USING (requester_id = auth.uid() OR booked_by = auth.uid() OR EXISTS (SELECT 1 FROM availability_slots s WHERE s.id = slot_id AND s.owner_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bookings' AND policyname = 'bookings_insert') THEN
    CREATE POLICY "bookings_insert" ON bookings FOR INSERT TO authenticated WITH CHECK (requester_id = auth.uid() OR booked_by = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bookings' AND policyname = 'bookings_update') THEN
    CREATE POLICY "bookings_update" ON bookings FOR UPDATE TO authenticated USING (requester_id = auth.uid() OR booked_by = auth.uid() OR EXISTS (SELECT 1 FROM availability_slots s WHERE s.id = slot_id AND s.owner_id = auth.uid()));
  END IF;
END $$;

CREATE OR REPLACE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 3. waitlist_entries ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS waitlist_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id           UUID NOT NULL REFERENCES availability_slots(id) ON DELETE CASCADE,
  requester_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  priority          INTEGER NOT NULL DEFAULT 0,
  notification_sent BOOLEAN DEFAULT false,
  status            TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'notified', 'converted', 'expired', 'cancelled')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS waitlist_entries_slot_idx ON waitlist_entries(slot_id);

ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'waitlist_entries' AND policyname = 'waitlist_entries_read') THEN
    CREATE POLICY "waitlist_entries_read" ON waitlist_entries FOR SELECT TO authenticated USING (requester_id = auth.uid() OR EXISTS (SELECT 1 FROM availability_slots s WHERE s.id = slot_id AND s.owner_id = auth.uid()));
  END IF;
END $$;

CREATE OR REPLACE TRIGGER waitlist_entries_updated_at
  BEFORE UPDATE ON waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
