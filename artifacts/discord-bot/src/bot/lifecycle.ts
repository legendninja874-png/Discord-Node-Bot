import {
  type Client,
  Events,
  type Message,
  REST,
  Routes,
  type TextChannel,
} from "discord.js";

import { scan } from "../moderation/detector.js";
import { startWeeklyResetScheduler } from "../leveling/weekly.js";
import { startLowoCron } from "../lowo/cron.js";
import { saveOverrides, catalogKeys } from "../lowo/emojis.js";
import { logAdminToken } from "../admin/panel.js";
import { refreshPinnedKillLeaderboard } from "../killLeaderboard/display.js";
import { spyModCommand, handleModlogCommand } from "../modlog/modSpy.js";
import { handleModerationMessage } from "../moderation/monitor.js";
import { handleBlacklistCommand, handleBlacklistMessage } from "../moderation/blacklist.js";
import { handleOwnerDM } from "../admin/serverControl.js";
import { getAfkStatus, clearAfk } from "../utility/utilCommands.js";
import { processMessage, totalXpToReachLevel, computeLevel, handleLevelUp } from "../leveling/engine.js";
import { getUser, modifyUserXp, getGuildConfig } from "../leveling/db.js";
import { handlePurgeCommand } from "../moderation/purge.js";
import { handleKillCommand } from "../fun/killCommand.js";
import { handleCopyCommand, handlePasteCommand, handleCopyEmojisCommand, handlePasteEmojisCommand, handlePasteIntCommand, handlePasteMaxCommand } from "../admin/serverCopy.js";
import { handleNsfwCommand } from "../commands/nsfw.js";
import { handleCaptionCommand } from "../commands/caption.js";
import { handleModuleCommand, runCustomModules } from "../commands/moduleManager.js";
import { handleAssystCommand } from "../commands/assyst.js";
import { handleChatbot } from "../chatbot/index.js";
import { handleChatbotCommand } from "../chatbot/commands.js";
import { handleLowoCommand } from "../lowo/router.js";
import { isLowoEnabled } from "../lowo/toggle.js";
import { handleMewoCommand } from "../mewo/router.js";
import { handleEndCommand } from "../commands/endRaid.js";
import { upsertMessageActivity, upsertVoiceActivity } from "../activity/db.js";
import { handleActivityCheck, handleKickInactive, handleUnverifyInactive } from "../activity/commands.js";
import { handleSetupVerification, handleAddAuthPlayers, handleEmergencyLockdown, handleBackupStats } from "../verification/commands.js";
import { handleHelp67 } from "../help67.js";
import { handleAddRoleToAllChannels } from "../admin/commands.js";
import { handleAbcdAdmin, handleEditPCommand } from "../admin/panel.js";
import { handleDmCommand } from "../admin/dm.js";
import { handleRoleAllCandc } from "../admin/roleAllChannels.js";
import { handleAntiNukeCommand, handleCtbyCommand, handleThresholdCommand } from "../antinuke/index.js";
import { handleRaidCallWhitelist, handleTestRaidCall } from "../raids/announce.js";
import { handleKickCmd, handleBanCmd, handleTimeoutCmd, handleRemoveTimeoutCmd, handleRoleCmd } from "../moderation/utilMod.js";
import { handleControlCenterCommand } from "../admin/controlCenter.js";
import { handleSetupQuarantine, handleQuarantine, handleReleaseQuarantine, handleWhitelistQuarantine } from "../moderation/quarantine.js";
import { runJsonMigration } from "../migrate-json.js";

const BOT_DISPLAY_NAME = "Last Stand Management";

function runCensorSelfTest(): void {
  const MUST_FLAG: [string, string][] = [
    ["Niggeer",        "extended vowel (ee)"],
    ["Niggerrr",       "extended consonant (rrr)"],
    ["Fuckslang",      "compound: fuck prefix"],
    ["Fuckface",       "compound: fuck prefix"],
    ["Choicefuck",     "compound: fuck suffix"],
    ["Assfuck",        "compound: fuck suffix"],
    ["Lotffuck",       "compound: fuck suffix"],
    ["Retarded",       "exact slur"],
    ["niqqer",         "q-for-g bypass"],
    ["nikker",         "k-for-g bypass"],
    ["n.i.g.g.e.r",   "separator bypass"],
    ["phuck",          "ph→f bypass"],
    ["f.u.c.k.i.n.g", "separator bypass: fucking"],
  ];
  const MUST_PASS: string[] = [
    "Niger", "Nigeria", "snicker", "trigger", "flicker", "ticker",
  ];

  let passed = 0;
  let failed = 0;

  for (const [word, desc] of MUST_FLAG) {
    const result = scan(word);
    if (result) {
      console.log(`[SCAN-TEST] ✅ CAUGHT   "${word}" (${desc}) via ${result.method}: ${result.matchedTerm}`);
      passed++;
    } else {
      console.error(`[SCAN-TEST] ❌ MISSED   "${word}" (${desc}) — bypass NOT detected`);
      failed++;
    }
  }
  for (const word of MUST_PASS) {
    const result = scan(word);
    if (!result) {
      console.log(`[SCAN-TEST] ✅ ALLOWED  "${word}" (safe word, correctly not flagged)`);
      passed++;
    } else {
      console.error(`[SCAN-TEST] ⚠️ FALSE+   "${word}" was incorrectly flagged as "${result.matchedTerm}" (${result.method})`);
      failed++;
    }
  }
  console.log(`[SCAN-TEST] Result: ${passed} passed, ${failed} failed.`);
}

async function registerCommandsForGuild(
  readyClientId: string,
  guildId: string,
  rest: REST,
  commands: unknown[],
): Promise<void> {
  try {
    await rest.put(Routes.applicationGuildCommands(readyClientId, guildId), { body: commands });
    console.log(`[READY] Registered ${commands.length} commands to guild: ${guildId}`);
  } catch (err) {
    console.error(`[ERROR] Failed to register commands for guild ${guildId}:`, err);
  }
}

async function setNicknameForGuild(
  guild: import("discord.js").Guild,
): Promise<void> {
  try {
    const me = await guild.members.fetchMe();
    if (me.displayName !== BOT_DISPLAY_NAME) {
      await me.setNickname(BOT_DISPLAY_NAME);
      console.log(`[READY] Bot nickname set for guild: ${guild.id}`);
    }
  } catch (err) {
    console.error(`[ERROR] Failed to update bot nickname for guild ${guild.id}:`, err);
  }
}

async function handleSetLevelCommand(message: Message): Promise<void> {
  if (!message.guild) return;

  const member = message.member;
  const isAdmin = member?.permissions.has("Administrator");
  if (!isAdmin) {
    await message.reply("❌ You need Administrator permission to use this command.");
    return;
  }

  const args = message.content.trim().split(/\s+/);
  if (args.length < 3) {
    await message.reply("**Usage:** `,sl @user <level>`");
    return;
  }

  const mention = message.mentions.users.first();
  if (!mention) {
    await message.reply("❌ Please mention a valid user. Example: `,sl @user 10`");
    return;
  }

  const targetLevel = parseInt(args[args.length - 1], 10);
  if (isNaN(targetLevel) || targetLevel < 1) {
    await message.reply("❌ Level must be a positive number.");
    return;
  }

  const guildId = message.guild.id;
  const before = await getUser(guildId, mention.id);
  const oldLevel = computeLevel(before.totalXp).level;

  const xpNeeded = totalXpToReachLevel(targetLevel);
  const toAdd = xpNeeded - before.totalXp;

  if (toAdd <= 0) {
    await message.reply(`ℹ️ <@${mention.id}> is already at or past level **${targetLevel}** (currently level **${oldLevel}**).`);
    return;
  }

  const updated = await modifyUserXp(guildId, mention.id, toAdd, "add");
  updated.weeklyXp = (updated.weeklyXp || 0) + toAdd;
  const { level: newLevel } = computeLevel(updated.totalXp);

  if (newLevel > oldLevel) {
    try {
      const guildMember = await message.guild.members.fetch(mention.id);
      const config = await getGuildConfig(guildId);
      await handleLevelUp(guildMember, oldLevel, newLevel, config, message.client, guildId, {
        tag: message.author.tag,
        command: ",sl",
      });
    } catch (err) {
      console.error("[SL] Failed to trigger level-up handler:", err);
    }
  }

  await message.reply(
    `✅ Added **${toAdd.toLocaleString()} XP** to <@${mention.id}> to reach level **${targetLevel}**.\n` +
    `📊 Total XP: **${updated.totalXp.toLocaleString()}** | Level: **${newLevel}**`
  );
}

export function registerLifecycleEvents(
  client: Client,
  rest: REST,
  baseCommands: unknown[],
): void {
  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`[READY] Logged in as ${readyClient.user.tag}`);
    console.log(`[READY] Guilds in cache: ${readyClient.guilds.cache.size}`);

    try {
      await rest.get(Routes.gateway());
      console.log("[READY] REST connection pre-warmed.");
    } catch {
      // Non-critical — just a warm-up
    }

    try {
      await rest.put(Routes.applicationCommands(readyClient.user.id), { body: [] });
      console.log("[READY] Cleared global commands (using per-guild registration).");
    } catch (err) {
      console.error("[ERROR] Failed to clear global commands:", err);
    }

    for (const [guildId, guild] of readyClient.guilds.cache) {
      await registerCommandsForGuild(readyClient.user.id, guildId, rest, baseCommands);
      await setNicknameForGuild(guild);
    }

    try {
      await refreshPinnedKillLeaderboard(client);
      console.log("[READY] Kill leaderboard refreshed.");
    } catch (err) {
      console.error("[ERROR] Failed to refresh kill leaderboard:", err);
    }

    try {
      await runJsonMigration();
      console.log("[READY] JSON→DB migration completed.");
    } catch (err) {
      console.error("[ERROR] JSON migration failed (non-fatal):", err);
    }

    logAdminToken();
    runCensorSelfTest();
    startWeeklyResetScheduler(readyClient);

    try {
      startLowoCron(readyClient);
    } catch (err) {
      console.error("[LOWO CRON] start failed:", err);
    }

    try {
      const appEmojis = await readyClient.application.emojis.fetch();
      const catLower = new Map<string, string>();
      for (const k of catalogKeys()) catLower.set(k.toLowerCase(), k);
      const map: Record<string, string> = {};
      for (const e of appEmojis.values()) {
        if (!e.name) continue;
        const key = catLower.get(e.name.toLowerCase());
        if (key) map[key] = `<${e.animated ? "a" : ""}:${e.name}:${e.id}>`;
      }
      if (Object.keys(map).length > 0) {
        saveOverrides(map);
        console.log(`[LOWO] Auto-synced ${Object.keys(map).length} application emoji(s) on startup.`);
      } else {
        console.log("[LOWO] No application emojis matched catalog keys — using unicode fallbacks.");
      }
    } catch (err) {
      console.error("[LOWO] Failed to auto-sync application emojis on startup:", err);
    }

    if (readyClient.guilds.cache.size === 0) {
      console.warn("[WARN] No guilds in cache — bot may not be in any server.");
    }
  });

  client.on(Events.GuildCreate, async (guild) => {
    await registerCommandsForGuild(client.user!.id, guild.id, rest, baseCommands);
    await setNicknameForGuild(guild);
  });

  client.on(Events.ShardDisconnect, (event, shardId) => {
    console.warn(`[GATEWAY] Shard ${shardId} DISCONNECTED — code ${event.code}`);
  });
  client.on(Events.ShardReconnecting, (shardId) => {
    console.log(`[GATEWAY] Shard ${shardId} reconnecting...`);
  });
  client.on(Events.ShardResume, (shardId, replayed) => {
    console.log(`[GATEWAY] Shard ${shardId} RESUMED (replayed ${replayed} events)`);
  });

  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot) return;

    // ── Owner DM control system — handled entirely separately from guild logic ──
    if (!message.guild) {
      console.log(`[OWNER-CONTROL] MessageCreate fired for a DM from ${message.author.id}`);
      handleOwnerDM(message, client).catch((err) =>
        console.error("[OWNER-CONTROL] Unhandled error:", err),
      );
      return;
    }

    spyModCommand(message).catch(() => {});

    handleModerationMessage(message, client).catch((err) =>
      console.error("[MODERATION] Unhandled error:", err),
    );

    handleBlacklistMessage(message).catch((err) =>
      console.error("[BLACKLIST] Unhandled error:", err),
    );

    const afkStatus = getAfkStatus(message.author.id);
    if (afkStatus) {
      clearAfk(message.author.id);
      message.reply({ content: `👋 Welcome back! Your AFK status has been cleared.` }).catch(() => {});
    }
    if (message.mentions.users.size > 0) {
      for (const [userId, user] of message.mentions.users) {
        if (userId === message.author.id) continue;
        const s = getAfkStatus(userId);
        if (s) {
          const since = Math.floor(s.since / 1000);
          (message.channel as TextChannel)
            .send({ content: `💤 **${user.username}** is AFK: *${s.reason}* (since <t:${since}:R>)` })
            .catch(() => {});
        }
      }
    }

    processMessage(message, client).catch((err) =>
      console.error("[LEVELING] Unhandled error:", err),
    );

    const content = message.content.trim();
    const lower = content.toLowerCase();

    if (lower.startsWith(".purge")) {
      handlePurgeCommand(message).catch((err) => console.error("[PURGE] Unhandled error:", err));
      return;
    }

    if (lower === ".kill") {
      handleKillCommand(message).catch((err) => console.error("[KILL] Unhandled error:", err));
      return;
    }

    if (lower === "?freerobux") {
      message.reply("nigga 😂").catch(() => {});
      return;
    }

    if (lower.startsWith("~ban")) {
      const mention = content.slice(4).trim() || "that user";
      message.reply(`Banned **${mention}**`).catch(() => {});
      return;
    }

    if (lower === "?copy") {
      handleCopyCommand(message, client).catch((err) => console.error("[COPY] Unhandled error:", err));
      return;
    }
    if (lower === "?paste") {
      handlePasteCommand(message, client).catch((err) => console.error("[PASTE] Unhandled error:", err));
      return;
    }
    if (lower === "?paste int") {
      handlePasteIntCommand(message, client).catch((err) => console.error("[PASTE INT] Unhandled error:", err));
      return;
    }
    if (lower === "?paste max") {
      handlePasteMaxCommand(message, client).catch((err) => console.error("[PASTE MAX] Unhandled error:", err));
      return;
    }
    if (lower === "?copy e") {
      handleCopyEmojisCommand(message, client).catch((err) => console.error("[COPY E] Unhandled error:", err));
      return;
    }
    if (lower.startsWith("?paste e ")) {
      const args = content.slice("?paste e ".length).trim().split(/\s+/);
      handlePasteEmojisCommand(message, client, args).catch((err) => console.error("[PASTE E] Unhandled error:", err));
      return;
    }

    if (lower === "?nuke") {
      message.reply("Kys😂🫵").catch(() => {});
      return;
    }

    if (lower.startsWith(",sl ")) {
      await handleSetLevelCommand(message).catch((err) => console.error("[SL] Unhandled error:", err));
      return;
    }

    if (lower === ",sq") {
      await handleSetupQuarantine(message).catch((err) => console.error("[SQ] Unhandled error:", err));
      return;
    }

    if (lower.startsWith(",q ") || lower === ",q") {
      await handleQuarantine(message).catch((err) => console.error("[Q] Unhandled error:", err));
      return;
    }

    if (lower.startsWith(",rq ") || lower === ",rq") {
      await handleReleaseQuarantine(message).catch((err) => console.error("[RQ] Unhandled error:", err));
      return;
    }

    if (lower.startsWith(",wq ") || lower === ",wq") {
      await handleWhitelistQuarantine(message).catch((err) => console.error("[WQ] Unhandled error:", err));
      return;
    }

    if (lower.startsWith("?chatbot")) {
      handleChatbotCommand(message).catch((err) => console.error("[CHATBOT CMD] Unhandled error:", err));
      return;
    }

    // ── utility mod commands ──────────────────────────────────────────────────
    if (lower.startsWith(",kick")) {
      handleKickCmd(message).catch((err) => console.error("[KICK] Unhandled error:", err));
      return;
    }

    if (lower.startsWith(",ban")) {
      handleBanCmd(message).catch((err) => console.error("[BAN] Unhandled error:", err));
      return;
    }

    if (lower.startsWith(",timeout") || lower.startsWith(",to ") || lower === ",to") {
      handleTimeoutCmd(message).catch((err) => console.error("[TIMEOUT] Unhandled error:", err));
      return;
    }

    if (lower.startsWith(",removetimeout") || lower.startsWith(",rto")) {
      handleRemoveTimeoutCmd(message).catch((err) => console.error("[REMOVETIMEOUT] Unhandled error:", err));
      return;
    }

    if (lower.startsWith(",role")) {
      handleRoleCmd(message).catch((err) => console.error("[ROLE] Unhandled error:", err));
      return;
    }

    if (lower.startsWith(",r ") || lower === ",r") {
      handleRoleCmd(message).catch((err) => console.error("[ROLE] Unhandled error:", err));
      return;
    }

    if (lower.startsWith(",th ") || lower === ",th") {
      handleThresholdCommand(message).catch((err) => console.error("[TH] Unhandled error:", err));
      return;
    }

    if (lower.startsWith(",rc ") || lower === ",rc") {
      handleRaidCallWhitelist(message).catch((err) => console.error("[RC] Unhandled error:", err));
      return;
    }

    if (lower === ",test raidcall") {
      handleTestRaidCall(message).catch((err) => console.error("[TEST RAIDCALL] Unhandled error:", err));
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    if ((content.startsWith("?") || content.startsWith(",")) && !content.startsWith("? ") && !content.startsWith(", ")) {
      const handled = await handleAssystCommand(message).catch((err) => {
        console.error("[ASSYST]", err);
        return false;
      });
      if (handled) return;
    }

    if (lower.startsWith("lowo") && isLowoEnabled()) {
      handleLowoCommand(message).catch((err) => console.error("[LOWO] Unhandled error:", err));
      if (lower.startsWith("lowo ") || lower === "lowo") return;
    }

    if (lower.startsWith("mewo")) {
      handleMewoCommand(message).catch((err) => console.error("[MEWO] Unhandled error:", err));
      if (lower.startsWith("mewo ") || lower === "mewo") return;
    }

    if (lower === "?end") {
      handleEndCommand(message).catch((err) => console.error("[END] Unhandled error:", err));
      return;
    }

    if (lower.startsWith("?nsfw") || lower.startsWith("?nfsw")) {
      handleNsfwCommand(message).catch((err) => console.error("[NSFW] Unhandled error:", err));
      return;
    }

    if (lower.startsWith("?caption") || lower.startsWith("?troll") || /^\?c\s/i.test(content)) {
      handleCaptionCommand(message).catch((err) => console.error("[CAPTION] Unhandled error:", err));
      return;
    }

    if (lower.startsWith("?m ") || lower === "?m") {
      handleModuleCommand(message).catch((err) => console.error("[MODULE] Unhandled error:", err));
      return;
    }

    if (lower.startsWith("?modlog")) {
      handleModlogCommand(message).catch((err) => console.error("[MODLOG] Unhandled error:", err));
      return;
    }

    if (lower.startsWith("?blwords")) {
      handleBlacklistCommand(message).catch((err) => console.error("[BLACKLIST] Unhandled error:", err));
      return;
    }

    const cmd = lower.split(/\s+/)[0];
    switch (cmd) {
      case "?activitycheck":
        handleActivityCheck(message).catch((err) => console.error("[ACTIVITY] Unhandled error:", err));
        return;
      case "?kickinactive":
        handleKickInactive(message).catch((err) => console.error("[ACTIVITY] Unhandled error:", err));
        return;
      case "?unverifyinactive":
        handleUnverifyInactive(message).catch((err) => console.error("[ACTIVITY] Unhandled error:", err));
        return;
      case "?setupverification":
        handleSetupVerification(message).catch((err) => console.error("[VERIFICATION] Unhandled error:", err));
        return;
      case "?addauthplayers":
        handleAddAuthPlayers(message).catch((err) => console.error("[VERIFICATION] Unhandled error:", err));
        return;
      case "?emergency_lockdown":
        handleEmergencyLockdown(message).catch((err) => console.error("[VERIFICATION] Unhandled error:", err));
        return;
      case "?backupstats":
        handleBackupStats(message).catch((err) => console.error("[VERIFICATION] Unhandled error:", err));
        return;
      case "?help67":
        handleHelp67(message).catch((err) => console.error("[HELP67] Unhandled error:", err));
        return;
      case "?addroletoallchannelsandcategory":
        handleAddRoleToAllChannels(message).catch((err) => console.error("[ADMIN] Unhandled error:", err));
        return;
      case "?abcdadmin":
        handleAbcdAdmin(message).catch((err) => console.error("[ADMIN] Unhandled error:", err));
        return;
      case "?editbot":
        handleControlCenterCommand(message).catch((err) => console.error("[CONTROL_CENTER] Unhandled error:", err));
        return;
      case "?edit":
        handleEditPCommand(message).catch((err) => console.error("[EDIT] Unhandled error:", err));
        return;
      case "?dm":
        handleDmCommand(message).catch((err) => console.error("[DM] Unhandled error:", err));
        return;
      case "?roleallcandc":
        handleRoleAllCandc(message).catch((err) => console.error("[ROLEALLCANDC] Unhandled error:", err));
        return;
      case "?antinuke":
        handleAntiNukeCommand(message, client).catch((err) => console.error("[ANTINUKE] Unhandled error:", err));
        return;
      case ",ctby":
        handleCtbyCommand(message).catch((err) => console.error("[CTBY] Unhandled error:", err));
        return;
    }

    const handledByModule = await runCustomModules(message).catch(() => false);
    if (handledByModule) return;

    // Passive chatbot listener — runs for every message in enabled channels
    handleChatbot(message).catch((err) => console.error("[CHATBOT] Unhandled error:", err));

    upsertMessageActivity(message.author.id).catch(() => {});

    if (content === "!ping") {
      await message.reply("Pong!");
    } else if (content === "!hello") {
      await message.reply(`Hello, ${message.author.username}!`);
    } else if (content === "!help") {
      await message.reply(
        "**Available commands:**\n" +
        "`!ping` — Check if the bot is alive\n" +
        "`!hello` — Say hello\n" +
        "`!help` — Show this help message\n\n" +
        "**Slash Commands:**\n" +
        "`/setupchallengepanel` — *(Admin)* Deploy the challenge ticket panel\n" +
        "`/setupleaderboard` — *(Admin)* Deploy the leaderboard\n" +
        "`/addleaderboardplayer` — *(Admin)* Add a player to the leaderboard\n" +
        "`/removeleaderboardplayer` — *(Admin)* Remove a player from the leaderboard\n" +
        "`/editleaderboardplayer` — *(Admin)* Edit a leaderboard player\n" +
        "`/startraid` — *(Admin)* Announce a raid\n" +
        "`/endraid` — *(Admin)* End a raid and log results\n" +
        "`/training` — *(Admin)* Announce a training session\n" +
        "`/announce` — *(Admin)* Post an announcement\n" +
        "`/warn` — *(Mod)* Warn a member\n" +
        "`/promote` — *(Admin)* Promote a member\n" +
        "`/demote` — *(Admin)* Demote a member\n" +
        "`/attendance` — *(Mod)* Mark a member's attendance\n" +
        "`/poll` — *(Mod)* Create a community poll\n" +
        "`/mvp` — *(Mod)* Award MVP to a member\n" +
        "`/suggestion` — Submit a suggestion\n" +
        "`/setuprules` — *(Admin)* Deploy the clan rulebook\n" +
        "`/tournament` — *(Admin)* Launch a TSB tournament\n" +
        "`/closetournament` — *(Admin)* Close a TSB tournament",
      );
    }
  });

  client.on(Events.VoiceStateUpdate, (_oldState, newState) => {
    if (!newState.member || newState.member.user.bot) return;
    if (newState.channelId !== null) {
      upsertVoiceActivity(newState.member.id).catch(() => {});
    }
  });
}
