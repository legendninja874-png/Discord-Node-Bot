import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
const useDb = !!DATABASE_URL;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL?.includes("sslmode=disable")
        ? false
        : { rejectUnauthorized: false },
      max: 10,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
    });
  }
  return pool;
}

async function ensureSchema(): Promise<void> {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS bot_kv (
      key        TEXT PRIMARY KEY,
      value      JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS activity_tracker (
      user_id        TEXT PRIMARY KEY,
      last_message   TIMESTAMPTZ,
      last_voice     TIMESTAMPTZ,
      total_messages INT NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS auth_backups (
      user_id       TEXT NOT NULL,
      access_token  TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      token_expiry  TIMESTAMPTZ NOT NULL,
      guild_id      TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS bot_sequences (
      name  TEXT PRIMARY KEY,
      value INT  NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS economy_users (
      user_id       TEXT   PRIMARY KEY,
      balance       BIGINT NOT NULL DEFAULT 0,
      bank          BIGINT NOT NULL DEFAULT 0,
      last_daily    BIGINT NOT NULL DEFAULT 0,
      last_weekly   BIGINT NOT NULL DEFAULT 0,
      last_work     BIGINT NOT NULL DEFAULT 0,
      last_rob      BIGINT NOT NULL DEFAULT 0,
      last_crime    BIGINT NOT NULL DEFAULT 0,
      last_invest   BIGINT NOT NULL DEFAULT 0,
      inventory     JSONB  NOT NULL DEFAULT '[]'::jsonb,
      invest_amount BIGINT NOT NULL DEFAULT 0,
      invest_at     BIGINT NOT NULL DEFAULT 0,
      total_earned  BIGINT NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS kill_leaderboard_players (
      id               SERIAL PRIMARY KEY,
      rank             INT  NOT NULL,
      display_name     TEXT NOT NULL DEFAULT '',
      roblox_username  TEXT NOT NULL DEFAULT '',
      discord_username TEXT NOT NULL DEFAULT '',
      position         TEXT NOT NULL DEFAULT 'Clan Member',
      kill_count       INT  NOT NULL DEFAULT 0,
      stage            TEXT NOT NULL DEFAULT '',
      avatar_url       TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS kill_pinned_messages (
      guild_id   TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leaderboard_players (
      id               SERIAL PRIMARY KEY,
      position         INT  NOT NULL,
      display_name     TEXT NOT NULL DEFAULT '',
      roblox_username  TEXT NOT NULL DEFAULT '',
      discord_username TEXT NOT NULL DEFAULT '',
      country          TEXT NOT NULL DEFAULT '',
      avatar_url       TEXT NOT NULL DEFAULT '',
      stage_rank       TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS leaderboard_pinned_messages (
      guild_id   TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mewo_enabled_channels (
      channel_id TEXT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS mewo_tags (
      guild_id       TEXT NOT NULL,
      name           TEXT NOT NULL,
      content        TEXT NOT NULL DEFAULT '',
      created_by     TEXT NOT NULL DEFAULT '',
      created_by_tag TEXT NOT NULL DEFAULT '',
      created_at     TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (guild_id, name)
    );

    CREATE TABLE IF NOT EXISTS mewo_timezones (
      user_id  TEXT PRIMARY KEY,
      timezone TEXT NOT NULL DEFAULT 'UTC'
    );

    CREATE TABLE IF NOT EXISTS mewo_embed_colors (
      user_id TEXT PRIMARY KEY,
      color   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mewo_ai_usage (
      user_id    TEXT PRIMARY KEY,
      chatgpt    INT  NOT NULL DEFAULT 0,
      llama      INT  NOT NULL DEFAULT 0,
      deepseek   INT  NOT NULL DEFAULT 0,
      reset_date TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS mewo_wallets (
      user_id         TEXT   PRIMARY KEY,
      balance         BIGINT NOT NULL DEFAULT 0,
      daily_date      TEXT   NOT NULL DEFAULT '',
      streak          INT    NOT NULL DEFAULT 0,
      last_claim_date TEXT   NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS censor_guild_config (
      guild_id            TEXT    PRIMARY KEY,
      enabled             BOOLEAN NOT NULL DEFAULT FALSE,
      mod_log_channel_id  TEXT
    );

    CREATE TABLE IF NOT EXISTS censor_user_flags (
      guild_id       TEXT NOT NULL,
      user_id        TEXT NOT NULL,
      count          INT  NOT NULL DEFAULT 0,
      last_flag      TEXT NOT NULL DEFAULT '',
      total_lifetime INT  NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS raid_results (
      id             TEXT PRIMARY KEY,
      clan_name      TEXT NOT NULL DEFAULT '',
      opponent_clan  TEXT NOT NULL DEFAULT '',
      result         TEXT NOT NULL DEFAULT '',
      top_performers TEXT NOT NULL DEFAULT '',
      notes          TEXT NOT NULL DEFAULT '',
      ended_by       TEXT NOT NULL DEFAULT '',
      ended_by_id    TEXT NOT NULL DEFAULT '',
      timestamp      TEXT NOT NULL DEFAULT '',
      guild_id       TEXT NOT NULL DEFAULT '',
      raid_number    INT  NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS rules_messages (
      guild_id   TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tournaments (
      id                    TEXT    PRIMARY KEY,
      guild_id              TEXT    NOT NULL DEFAULT '',
      channel_id            TEXT    NOT NULL DEFAULT '',
      message_id            TEXT    NOT NULL DEFAULT '',
      about                 TEXT    NOT NULL DEFAULT '',
      rules                 TEXT    NOT NULL DEFAULT '',
      game_link             TEXT    NOT NULL DEFAULT '',
      prize                 TEXT    NOT NULL DEFAULT '',
      ping_role_id          TEXT    NOT NULL DEFAULT '',
      tournament_date       TEXT    NOT NULL DEFAULT '',
      tournament_time       TEXT    NOT NULL DEFAULT '',
      host_id               TEXT    NOT NULL DEFAULT '',
      host_tag              TEXT    NOT NULL DEFAULT '',
      max_participants      INT     NOT NULL DEFAULT 0,
      entry_requirement     TEXT    NOT NULL DEFAULT '',
      notes                 TEXT,
      registration_deadline TEXT,
      closed                BOOLEAN NOT NULL DEFAULT FALSE,
      created_by_id         TEXT    NOT NULL DEFAULT '',
      created_by_tag        TEXT    NOT NULL DEFAULT '',
      created_at            TEXT    NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS tournament_participants (
      tournament_id TEXT NOT NULL,
      user_id       TEXT NOT NULL,
      user_tag      TEXT NOT NULL DEFAULT '',
      joined_at     TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (tournament_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS training_logs (
      id                 TEXT PRIMARY KEY,
      host               TEXT NOT NULL DEFAULT '',
      duration_completed TEXT NOT NULL DEFAULT '',
      mvp                TEXT NOT NULL DEFAULT '',
      notes              TEXT NOT NULL DEFAULT '',
      ended_by           TEXT NOT NULL DEFAULT '',
      ended_by_id        TEXT NOT NULL DEFAULT '',
      timestamp          TEXT NOT NULL DEFAULT '',
      guild_id           TEXT NOT NULL DEFAULT '',
      session_number     INT  NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS warns (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL,
      user_tag      TEXT NOT NULL DEFAULT '',
      moderator_id  TEXT NOT NULL DEFAULT '',
      moderator_tag TEXT NOT NULL DEFAULT '',
      reason        TEXT NOT NULL DEFAULT '',
      timestamp     TEXT NOT NULL DEFAULT '',
      guild_id      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS promotions (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL,
      user_tag      TEXT NOT NULL DEFAULT '',
      moderator_id  TEXT NOT NULL DEFAULT '',
      moderator_tag TEXT NOT NULL DEFAULT '',
      type          TEXT NOT NULL DEFAULT 'promote',
      new_rank      TEXT NOT NULL DEFAULT '',
      timestamp     TEXT NOT NULL DEFAULT '',
      guild_id      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendances (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL,
      user_tag      TEXT NOT NULL DEFAULT '',
      event         TEXT NOT NULL DEFAULT '',
      marked_by_id  TEXT NOT NULL DEFAULT '',
      marked_by_tag TEXT NOT NULL DEFAULT '',
      timestamp     TEXT NOT NULL DEFAULT '',
      guild_id      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mvps (
      id             TEXT PRIMARY KEY,
      user_id        TEXT NOT NULL,
      user_tag       TEXT NOT NULL DEFAULT '',
      event          TEXT NOT NULL DEFAULT '',
      reason         TEXT NOT NULL DEFAULT '',
      awarded_by_id  TEXT NOT NULL DEFAULT '',
      awarded_by_tag TEXT NOT NULL DEFAULT '',
      timestamp      TEXT NOT NULL DEFAULT '',
      guild_id       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS antinuke_whitelist (
      guild_id   TEXT   PRIMARY KEY,
      user_ids   TEXT[] NOT NULL DEFAULT '{}',
      immune_ids TEXT[] NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS antinuke_config (
      guild_id       TEXT    PRIMARY KEY,
      enabled        BOOLEAN NOT NULL DEFAULT FALSE,
      log_channel_id TEXT,
      log_ping_ids   TEXT[]  NOT NULL DEFAULT '{}',
      thresholds     JSONB   NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS lowo_guild_settings (
      guild_id         TEXT    PRIMARY KEY,
      whitelist_mode   BOOLEAN NOT NULL DEFAULT FALSE,
      allowed_channels TEXT[]  NOT NULL DEFAULT '{}',
      dynamic_mode     BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS lowo_emoji_overrides (
      guild_id  TEXT  PRIMARY KEY,
      overrides JSONB NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS leveling_users (
      guild_id             TEXT   NOT NULL,
      user_id              TEXT   NOT NULL,
      xp                   INT    NOT NULL DEFAULT 0,
      level                INT    NOT NULL DEFAULT 0,
      total_xp             INT    NOT NULL DEFAULT 0,
      weekly_xp            INT    NOT NULL DEFAULT 0,
      last_message_at      BIGINT NOT NULL DEFAULT 0,
      last_message_content TEXT   NOT NULL DEFAULT '',
      PRIMARY KEY (guild_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS leveling_configs (
      guild_id              TEXT    PRIMARY KEY,
      enabled               BOOLEAN NOT NULL DEFAULT true,
      xp_min                INT     NOT NULL DEFAULT 15,
      xp_max                INT     NOT NULL DEFAULT 25,
      cooldown              INT     NOT NULL DEFAULT 60,
      level_up_channel_id   TEXT,
      announcements         BOOLEAN NOT NULL DEFAULT true,
      ping_on_level_up      BOOLEAN NOT NULL DEFAULT true,
      keep_old_roles        BOOLEAN NOT NULL DEFAULT true,
      blacklisted_channels  TEXT[]  NOT NULL DEFAULT '{}',
      whitelisted_channels  TEXT[]  NOT NULL DEFAULT '{}',
      server_multiplier     FLOAT   NOT NULL DEFAULT 1.0,
      role_multipliers      JSONB   NOT NULL DEFAULT '{}',
      event_multiplier      FLOAT   NOT NULL DEFAULT 1.0,
      anti_spam_enabled     BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS leveling_level_roles (
      guild_id  TEXT NOT NULL,
      level     INT  NOT NULL,
      role_name TEXT NOT NULL,
      PRIMARY KEY (guild_id, level)
    );

    CREATE TABLE IF NOT EXISTS leveling_meta (
      key         TEXT   PRIMARY KEY,
      int_val     BIGINT,
      json_val    JSONB
    );

    CREATE TABLE IF NOT EXISTS blacklisted_words (
      guild_id    TEXT   NOT NULL,
      word        TEXT   NOT NULL,
      timeout_ms  BIGINT NOT NULL,
      added_by    TEXT   NOT NULL DEFAULT '',
      created_at  TEXT   NOT NULL DEFAULT '',
      PRIMARY KEY (guild_id, word)
    );
  `);

  await db.query(`ALTER TABLE auth_backups DROP CONSTRAINT IF EXISTS auth_backups_pkey;`).catch(() => {});
  await db.query(`ALTER TABLE auth_backups ADD PRIMARY KEY (user_id, guild_id);`).catch(() => {});
  await db.query(`ALTER TABLE auth_backups ADD COLUMN IF NOT EXISTS ip_address  TEXT;`).catch(() => {});
  await db.query(`ALTER TABLE auth_backups ADD COLUMN IF NOT EXISTS user_agent  TEXT;`).catch(() => {});
  await db.query(`ALTER TABLE auth_backups ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ DEFAULT NOW();`).catch(() => {});

  // Antinuke: add immune_ids column if it was created before this column existed
  await db.query(`ALTER TABLE antinuke_whitelist ADD COLUMN IF NOT EXISTS immune_ids TEXT[] NOT NULL DEFAULT '{}';`).catch(() => {});

  // Antinuke: add punish_action column — was previously smuggled into the thresholds JSONB
  await db.query(`ALTER TABLE antinuke_config ADD COLUMN IF NOT EXISTS punish_action TEXT NOT NULL DEFAULT 'strip';`).catch(() => {});
  // Antinuke: add log_ping_ids column if missing (older deploys may not have it)
  await db.query(`ALTER TABLE antinuke_config ADD COLUMN IF NOT EXISTS log_ping_ids TEXT[] NOT NULL DEFAULT '{}';`).catch(() => {});

  // Role snapshots — stores every member's roles before setup so they can be restored on verify
  await db.query(`
    CREATE TABLE IF NOT EXISTS member_role_snapshots (
      user_id  TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      roles    JSONB NOT NULL DEFAULT '[]',
      PRIMARY KEY (user_id, guild_id)
    );
  `).catch(() => {});
}

export async function initPersistence(): Promise<void> {
  if (!useDb) {
    console.log("[PERSISTENCE] DATABASE_URL not set — in-memory only (data lost on restart).");
    return;
  }
  console.log("[PERSISTENCE] Initializing Postgres-backed persistence...");
  await ensureSchema();
  console.log("[PERSISTENCE] Schema ready.");
}

export async function flushAll(): Promise<void> {
  // Stores write directly to Postgres — no pending queue to flush.
}

export function isUsingDatabase(): boolean {
  return useDb;
}

export async function pingDb(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  if (!useDb) return { ok: false, error: "DATABASE_URL not set" };
  try {
    const start = Date.now();
    await getPool().query("SELECT 1");
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
