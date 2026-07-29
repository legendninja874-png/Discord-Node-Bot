import { getPool } from "../persistence.js";

export interface AuthBackupRow {
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_expiry: Date;
  guild_id: string;
}

/**
 * Snapshot a member's role IDs so they can be fully restored after verification.
 * Uses a dedicated table so it works even before a member has an OAuth token.
 */
export async function saveRoleSnapshot(
  userId: string,
  guildId: string,
  roleIds: string[],
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  await getPool().query(
    `INSERT INTO member_role_snapshots (user_id, guild_id, roles)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, guild_id) DO UPDATE SET roles = $3::jsonb`,
    [userId, guildId, JSON.stringify(roleIds)],
  );
}

/** Returns the stored role IDs for a member, or [] if none recorded. */
export async function getStoredRoles(userId: string, guildId: string): Promise<string[]> {
  if (!process.env.DATABASE_URL) return [];
  const res = await getPool().query<{ roles: string[] }>(
    `SELECT roles FROM member_role_snapshots WHERE user_id = $1 AND guild_id = $2`,
    [userId, guildId],
  );
  return res.rows[0]?.roles ?? [];
}

export async function updateAuthTokens(
  userId: string,
  guildId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const expiry = new Date(Date.now() + expiresIn * 1000);
  await getPool().query(
    `UPDATE auth_backups
     SET access_token  = $3,
         refresh_token = $4,
         token_expiry  = $5
     WHERE user_id = $1 AND guild_id = $2`,
    [userId, guildId, accessToken, refreshToken, expiry.toISOString()],
  );
}

export async function getAllAuthBackups(guildId: string): Promise<AuthBackupRow[]> {
  if (!process.env.DATABASE_URL) return [];
  const res = await getPool().query<AuthBackupRow>(
    `SELECT user_id, access_token, refresh_token, token_expiry, guild_id
     FROM auth_backups
     WHERE guild_id = $1`,
    [guildId],
  );
  return res.rows;
}

export async function getAuthBackupCount(guildId: string): Promise<number> {
  if (!process.env.DATABASE_URL) return 0;
  const res = await getPool().query<{ count: string }>(
    `SELECT COUNT(*)::TEXT AS count FROM auth_backups WHERE guild_id = $1`,
    [guildId],
  );
  return parseInt(res.rows[0]?.count ?? "0", 10);
}
