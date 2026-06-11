import { pool } from "./db.js"

const migrate = async () => {
  const client = await pool.connect()

  try {
    console.log("Running migrations... 🔄")

    // ── Extensions ───────────────────────────────────
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto"
    `)

    // ── Users table ──────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `)

    // ── Events table ─────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        venue TEXT NOT NULL,
        starts_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `)

    // ── Seats table ──────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS seats (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id UUID REFERENCES events(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'available'
          CHECK (status IN ('available', 'reserved', 'booked')),
        price_paise INTEGER NOT NULL,
        version INTEGER NOT NULL DEFAULT 0,
        reserved_by UUID,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `)

    // ── Bookings table ───────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        seat_id UUID REFERENCES seats(id),
        status TEXT DEFAULT 'pending'
          CHECK (status IN ('pending', 'confirmed', 'cancelled')),
        amount_paise INTEGER NOT NULL,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `)

    // ── Pricing rules table ──────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS pricing_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        occupancy_min INTEGER NOT NULL,
        occupancy_max INTEGER NOT NULL,
        multiplier NUMERIC(4,2) NOT NULL,
        rule_name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `)

    // ── Time pricing rules table ─────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS time_pricing_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hours_before_min INTEGER NOT NULL,
        hours_before_max INTEGER NOT NULL,
        multiplier NUMERIC(4,2) NOT NULL,
        rule_name TEXT NOT NULL
      )
    `)

    // ── Category multipliers table ───────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS category_multipliers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        category TEXT UNIQUE NOT NULL,
        multiplier NUMERIC(4,2) NOT NULL
      )
    `)

    // ── Indexes ──────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_seats_event_id
      ON seats(event_id)
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_seats_event_status
      ON seats(event_id, status)
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_user_id
      ON bookings(user_id)
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_seat_id
      ON bookings(seat_id)
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bookings_expires
      ON bookings(expires_at)
      WHERE status = 'pending'
    `)

    // ── Seed data ────────────────────────────────────
    // only insert if table is empty
    // prevents duplicate data on every restart
    const existingRules = await client.query(
      "SELECT COUNT(*) FROM pricing_rules"
    )

    if (parseInt(existingRules.rows[0].count) === 0) {
      console.log("Seeding pricing rules...")

      await client.query(`
        INSERT INTO pricing_rules
          (occupancy_min, occupancy_max, multiplier, rule_name)
        VALUES
          (0,  40,  1.00, 'normal'),
          (40, 60,  1.20, 'moderate demand'),
          (60, 80,  1.50, 'high demand'),
          (80, 90,  1.80, 'very high demand'),
          (90, 100, 2.20, 'peak demand')
      `)

      await client.query(`
        INSERT INTO time_pricing_rules
          (hours_before_min, hours_before_max, multiplier, rule_name)
        VALUES
          (48, 999999, 1.00, 'advance booking'),
          (24, 48,     1.10, 'less than 2 days'),
          (6,  24,     1.25, 'less than 1 day'),
          (2,  6,      1.40, 'last few hours'),
          (0,  2,      0.80, 'last minute deal')
      `)

      await client.query(`
        INSERT INTO category_multipliers
          (category, multiplier)
        VALUES
          ('General',  1.00),
          ('Premium',  1.50),
          ('VIP',      2.00),
          ('Platinum', 3.00)
        ON CONFLICT (category) DO NOTHING
      `)

      console.log("✅ Seed data inserted")
    }

    console.log("✅ All migrations complete")

  } catch (error) {
    console.error("❌ Migration failed:", error.message)
    throw error

  } finally {
    client.release()
  }
}

export { migrate }

if (process.argv[1].includes("migrate.js")) {
  migrate()
}