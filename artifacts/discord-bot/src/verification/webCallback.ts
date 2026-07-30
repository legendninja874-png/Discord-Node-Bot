import type { IncomingMessage, ServerResponse } from "http";
import { getPool } from "../persistence.js";

const CLIENT_ID     = process.env.DISCORD_CLIENT_ID     ?? "";
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET ?? "";
const REDIRECT_URI  = process.env.OAUTH_REDIRECT_URI    ?? "";

function basicAuth(): string {
  return Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
}

interface DiscordRole { id: string; name: string; }

async function getGuildRoles(guildId: string, botToken: string): Promise<DiscordRole[]> {
  try {
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${botToken}` },
    });
    if (!res.ok) return [];
    return (await res.json()) as DiscordRole[];
  } catch { return []; }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── Shared CSS + animated background ──────────────────────────────────────
const BASE_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: #060710;
    color: #e2e8f0;
    font-family: 'Inter', system-ui, sans-serif;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    overflow: hidden;
    position: relative;
  }

  /* Animated gradient orbs */
  .orb {
    position: fixed;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.18;
    animation: drift linear infinite;
    pointer-events: none;
    z-index: 0;
  }
  .orb-1 { width: 500px; height: 500px; background: radial-gradient(circle, #00ffff, transparent); top: -150px; left: -150px; animation-duration: 18s; }
  .orb-2 { width: 400px; height: 400px; background: radial-gradient(circle, #7c3aed, transparent); bottom: -100px; right: -100px; animation-duration: 22s; animation-direction: reverse; }
  .orb-3 { width: 300px; height: 300px; background: radial-gradient(circle, #2563eb, transparent); top: 40%; left: 50%; animation-duration: 15s; animation-delay: -7s; }

  @keyframes drift {
    0%   { transform: translate(0,    0)    scale(1); }
    33%  { transform: translate(40px, -30px) scale(1.05); }
    66%  { transform: translate(-20px, 40px) scale(0.95); }
    100% { transform: translate(0,    0)    scale(1); }
  }

  /* Card */
  .wrap {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 440px;
    animation: fadeUp .55s cubic-bezier(.16,1,.3,1) both;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(28px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .badge {
    text-align: center;
    font-size: .7rem;
    font-weight: 700;
    letter-spacing: .22em;
    text-transform: uppercase;
    color: #00ffff;
    opacity: .55;
    margin-bottom: 1.6rem;
  }

  .card {
    background: rgba(255,255,255,.035);
    backdrop-filter: blur(24px) saturate(180%);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 20px;
    padding: 2.8rem 2.2rem 2.4rem;
    box-shadow:
      0 0 0 1px rgba(0,255,255,.06) inset,
      0 32px 80px rgba(0,0,0,.55),
      0 0 120px rgba(0,255,255,.04);
    text-align: center;
  }

  .icon-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    margin-bottom: 1.5rem;
  }
  .icon-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 1.5px solid rgba(0,255,255,.3);
    animation: ring-pulse 2.4s ease-in-out infinite;
  }
  .icon-ring-2 {
    position: absolute;
    inset: -10px;
    border-radius: 50%;
    border: 1px solid rgba(0,255,255,.12);
    animation: ring-pulse 2.4s ease-in-out infinite .5s;
  }
  @keyframes ring-pulse {
    0%,100% { transform: scale(1);   opacity: 1; }
    50%      { transform: scale(1.12); opacity: .4; }
  }
  .icon-inner {
    font-size: 2rem;
    position: relative;
    z-index: 1;
    filter: drop-shadow(0 0 12px rgba(0,255,255,.6));
  }

  h1 {
    font-size: 1.35rem;
    font-weight: 700;
    color: #fff;
    margin-bottom: .6rem;
    letter-spacing: -.01em;
    line-height: 1.25;
  }

  p {
    color: #64748b;
    font-size: .9rem;
    line-height: 1.7;
  }
  p strong { color: #94a3b8; }

  .divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(0,255,255,.15), transparent);
    margin: 1.6rem 0;
  }

  .hint {
    text-align: center;
    font-size: .75rem;
    color: #334155;
    margin-top: 1.4rem;
  }
  .hint strong { color: #475569; }

  a { color: #00ffff; text-decoration: none; }
`;

// ── Status page (success / error / cancelled) ─────────────────────────────
function sendHtml(res: ServerResponse, status: number, title: string, body: string, isSuccess = false): void {
  const icon = isSuccess ? "✅" : status >= 500 ? "⚠️" : "❌";
  const glowColor = isSuccess ? "#00ffff" : status >= 500 ? "#ff4444" : "#f59e0b";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title} — Last Stand</title>
  <style>
    ${BASE_STYLES}
    .icon-ring, .icon-ring-2 { border-color: ${glowColor}44; }
    .icon-inner { filter: drop-shadow(0 0 14px ${glowColor}88); }
  </style>
</head>
<body>
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>
  <div class="orb orb-3"></div>

  <div class="wrap">
    <div class="badge">Last Stand</div>
    <div class="card">
      <div class="icon-wrap">
        <div class="icon-ring"></div>
        <div class="icon-ring-2"></div>
        <span class="icon-inner">${icon}</span>
      </div>
      <h1>${title}</h1>
      <div class="divider"></div>
      <p>${body}</p>
    </div>
    <div class="hint">Need help? Contact <strong>EoN</strong></div>
  </div>
</body>
</html>`;

  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

// ── Confirmation page ──────────────────────────────────────────────────────
function sendConfirmPage(res: ServerResponse, code: string, guildId: string): void {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Verify — Last Stand</title>
  <style>
    ${BASE_STYLES}

    .subtitle {
      color: #475569;
      font-size: .82rem;
      margin-top: .35rem;
      margin-bottom: 0;
      line-height: 1.55;
    }

    .buttons {
      display: flex;
      gap: .75rem;
      margin-top: 1.8rem;
    }

    .btn {
      flex: 1;
      padding: .8rem 1rem;
      border: none;
      border-radius: 12px;
      font-family: inherit;
      font-size: .95rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform .15s, box-shadow .15s, opacity .15s;
      letter-spacing: .01em;
    }
    .btn:active { transform: scale(.97); }

    .btn-yes {
      background: linear-gradient(135deg, #00e5ff, #0091ff);
      color: #020b14;
      box-shadow: 0 0 24px rgba(0,229,255,.25), 0 4px 12px rgba(0,0,0,.3);
    }
    .btn-yes:hover {
      box-shadow: 0 0 36px rgba(0,229,255,.45), 0 6px 20px rgba(0,0,0,.4);
      transform: translateY(-1px);
    }

    .btn-no {
      background: rgba(255,255,255,.06);
      color: #64748b;
      border: 1px solid rgba(255,255,255,.08);
    }
    .btn-no:hover {
      background: rgba(255,255,255,.09);
      color: #94a3b8;
      transform: translateY(-1px);
    }

    /* Shimmer on Yes button */
    .btn-yes::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 12px;
      background: linear-gradient(105deg, transparent 40%, rgba(255,255,255,.25) 50%, transparent 60%);
      background-size: 200% 100%;
      animation: shimmer 2.8s ease-in-out infinite 1s;
    }
    .btn-yes { position: relative; overflow: hidden; }

    @keyframes shimmer {
      0%   { background-position: 200% center; }
      100% { background-position: -200% center; }
    }

    form { flex: 1; display: flex; }
    form .btn { width: 100%; }
  </style>
</head>
<body>
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>
  <div class="orb orb-3"></div>

  <div class="wrap">
    <div class="badge">Last Stand</div>
    <div class="card">
      <div class="icon-wrap">
        <div class="icon-ring"></div>
        <div class="icon-ring-2"></div>
        <span class="icon-inner">🛡️</span>
      </div>
      <h1>Do you want to verify?</h1>
      <div class="divider"></div>
      <p>This will grant you access to the Last Stand server as a verified member.</p>
      <p class="subtitle">By clicking <strong>Yes</strong>, you authorise Last Stand to confirm your identity.</p>
      <div class="buttons">
        <form method="POST" action="/api/oauth/confirm">
          <input type="hidden" name="code"     value="${escapeHtml(code)}"/>
          <input type="hidden" name="guild_id" value="${escapeHtml(guildId)}"/>
          <button type="submit" class="btn btn-yes">✅ Yes, verify me</button>
        </form>
        <form method="GET" action="/api/oauth/cancel">
          <button type="submit" class="btn btn-no">✕ No thanks</button>
        </form>
      </div>
    </div>
    <div class="hint">Need help? Contact <strong>EoN</strong></div>
  </div>
</body>
</html>`;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

// ── GET /api/oauth/callback ────────────────────────────────────────────────
export async function handleOAuthCallback(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url     = new URL(req.url ?? "/", `https://${req.headers.host}`);
  const code    = url.searchParams.get("code");
  const guildId = url.searchParams.get("state");

  if (!code) {
    sendHtml(res, 400, "Verification Failed", "Something didn't go right. Head back to the server and try again.");
    return;
  }
  if (!guildId) {
    sendHtml(res, 400, "Invalid Link", "This verification link isn't valid. Ask an admin to re-post the verification panel.");
    return;
  }
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    sendHtml(res, 500, "Something Went Wrong", "Verification isn't set up correctly on our end. Contact <strong>EoN</strong>.");
    return;
  }

  sendConfirmPage(res, code, guildId);
}

// ── POST /api/oauth/confirm ────────────────────────────────────────────────
export async function handleOAuthConfirm(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    sendHtml(res, 500, "Something Went Wrong", "Verification isn't set up correctly on our end. Contact <strong>EoN</strong>.");
    return;
  }

  const body = await new Promise<string>((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
    req.on("end",  () => resolve(data));
    req.on("error", reject);
  });

  const params  = new URLSearchParams(body);
  const code    = params.get("code");
  const guildId = params.get("guild_id");

  if (!code || !guildId) {
    sendHtml(res, 400, "Verification Failed", "Something didn't go right. Head back to the server and try again.");
    return;
  }

  try {
    // 1. Exchange code for tokens
    const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:  `Basic ${basicAuth()}`,
      },
      body: new URLSearchParams({
        grant_type:   "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      console.error("[OAUTH] Token exchange failed:", tokenRes.status, await tokenRes.text());
      sendHtml(res, 400, "Verification Failed", "Couldn't complete the verification. Try clicking Verify again, or contact <strong>EoN</strong> if it keeps happening.");
      return;
    }

    const tokens = (await tokenRes.json()) as {
      access_token:  string;
      refresh_token: string;
      expires_in:    number;
    };

    // 2. Get user identity
    const userRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userRes.ok) {
      sendHtml(res, 400, "Verification Failed", "Couldn't reach your Discord profile. Try again, or contact <strong>EoN</strong>.");
      return;
    }
    const user = (await userRes.json()) as { id: string; username: string };

    // 2b. Check if already verified for this guild
    if (process.env.DATABASE_URL) {
      try {
        const existing = await getPool().query(
          `SELECT 1 FROM auth_backups WHERE user_id = $1 AND guild_id = $2 LIMIT 1`,
          [user.id, guildId],
        );
        if ((existing.rowCount ?? 0) > 0) {
          sendHtml(res, 200, "Already verified.", "You're already verified in this server — no action needed.", true);
          return;
        }
      } catch {
        // DB check failed — proceed with normal verification flow
      }
    }

    // 3. Store token backup (per user + guild)
    const expiry = new Date(Date.now() + tokens.expires_in * 1000);
    const ipAddress =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      null;
    const userAgent = (req.headers["user-agent"] as string | undefined) ?? null;

    if (process.env.DATABASE_URL) {
      try {
        await getPool().query(
          `INSERT INTO auth_backups (user_id, access_token, refresh_token, token_expiry, guild_id, ip_address, user_agent, verified_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (user_id, guild_id) DO UPDATE
           SET access_token  = EXCLUDED.access_token,
               refresh_token = EXCLUDED.refresh_token,
               token_expiry  = EXCLUDED.token_expiry,
               ip_address    = EXCLUDED.ip_address,
               user_agent    = EXCLUDED.user_agent,
               verified_at   = NOW()`,
          [user.id, tokens.access_token, tokens.refresh_token, expiry.toISOString(), guildId, ipAddress, userAgent],
        );
      } catch (dbErr) {
        console.error("[OAUTH] DB insert failed (verification still proceeds):", dbErr);
      }
    }

    const botToken = process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN ?? "";

    // 4. Load config (for role IDs) + stored role snapshot from DB in parallel
    let verifiedRoleId:   string | null = null;
    let unverifiedRoleId: string | null = null;
    let storedRoles:      string[]      = [];

    if (process.env.DATABASE_URL) {
      try {
        const pool = getPool();
        const [cfgRes, rolesRes] = await Promise.all([
          pool.query<{ value: { verifiedRoleId: string; unverifiedRoleId: string } }>(
            `SELECT value FROM bot_kv WHERE key = $1`,
            [`auth_verify_config:${guildId}`],
          ),
          pool.query<{ roles: string[] }>(
            `SELECT roles FROM member_role_snapshots WHERE user_id = $1 AND guild_id = $2`,
            [user.id, guildId],
          ),
        ]);
        verifiedRoleId   = cfgRes.rows[0]?.value?.verifiedRoleId   ?? null;
        unverifiedRoleId = cfgRes.rows[0]?.value?.unverifiedRoleId ?? null;
        storedRoles      = rolesRes.rows[0]?.roles ?? [];
      } catch { /* fall through to name-based lookup */ }
    }

    // Fallback: if no config stored in DB (e.g. ?setupverification was used instead of
    // ?setupauthverification, or DB is unavailable), look up roles by conventional names.
    if (!verifiedRoleId || !unverifiedRoleId) {
      const guildRoles = await getGuildRoles(guildId, botToken);
      if (!verifiedRoleId) {
        const r = guildRoles.find(r =>
          r.name.toLowerCase() === "verified" ||
          r.name.toLowerCase() === "clan members" ||
          r.name.toLowerCase() === "member",
        );
        verifiedRoleId = r?.id ?? null;
      }
      if (!unverifiedRoleId) {
        const r = guildRoles.find(r => r.name.toLowerCase() === "unverified");
        unverifiedRoleId = r?.id ?? null;
      }
    }

    // 5. Build final role list: previous roles + verified, minus unverified
    const skipIds = new Set<string>([unverifiedRoleId].filter((id): id is string => !!id));
    const finalRoles = [
      ...storedRoles.filter(id => !skipIds.has(id)),
      ...(verifiedRoleId ? [verifiedRoleId] : []),
    ];

    const addBody: Record<string, unknown> = { access_token: tokens.access_token };
    if (finalRoles.length > 0) addBody.roles = finalRoles;

    const addRes = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members/${user.id}`,
      {
        method:  "PUT",
        headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
        body:    JSON.stringify(addBody),
      },
    );

    if (addRes.ok || addRes.status === 201 || addRes.status === 204) {
      // 204 = already in guild, PUT roles are ignored → PATCH to apply them
      if (addRes.status === 204 && finalRoles.length > 0) {
        await fetch(
          `https://discord.com/api/v10/guilds/${guildId}/members/${user.id}`,
          {
            method:  "PATCH",
            headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
            body:    JSON.stringify({ roles: finalRoles }),
          },
        ).catch(() => {});
      }
      // Belt-and-suspenders: explicitly strip the unverified role
      if (unverifiedRoleId) {
        await fetch(
          `https://discord.com/api/v10/guilds/${guildId}/members/${user.id}/roles/${unverifiedRoleId}`,
          { method: "DELETE", headers: { Authorization: `Bot ${botToken}` } },
        ).catch(() => {});
      }
    }

    console.log(`[OAUTH] Verified ${user.username} (${user.id}) for guild ${guildId}`);
    sendHtml(res, 200, "You're verified.", "Head back to the server — you're good to go.", true);
  } catch (err) {
    console.error("[OAUTH] Unexpected error:", err);
    sendHtml(res, 500, "Something Went Wrong", "Something on our end went wrong. Contact <strong>EoN</strong> and let them know.");
  }
}

// ── GET /api/oauth/cancel ──────────────────────────────────────────────────
export function handleOAuthCancel(_req: IncomingMessage, res: ServerResponse): void {
  sendHtml(res, 200, "Verification Cancelled", "No problem — you can verify any time by clicking the button in the server.");
}
