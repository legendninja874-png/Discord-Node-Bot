import type { Client, Guild } from "discord.js";
import { EmbedBuilder, TextChannel } from "discord.js";
import { clearActions, getConfig } from "./store.js";
import type { ActionType } from "./store.js";

const quarantineActive = new Set<string>();

export async function quarantine(
  client:        Client,
  guild:         Guild,
  executorId:    string,
  isBotExecutor: boolean,
  action:        ActionType,
  details:       string,
): Promise<boolean> {
  const key = `${guild.id}:${executorId}`;
  if (quarantineActive.has(key)) return false;
  quarantineActive.add(key);
  clearActions(guild.id, executorId);

  console.warn(
    `[ANTINUKE] Quarantine | Guild: ${guild.name} (${guild.id}) | Executor: ${executorId} | Bot: ${isBotExecutor} | Action: ${action}`,
  );

  const config          = await getConfig(guild.id);
  const effectivePunish = isBotExecutor ? "ban" : config.punishAction;
  const actionsTaken: string[] = [];

  // ── Punish ────────────────────────────────────────────────────────────────
  if (effectivePunish === "ban") {
    if (isBotExecutor) {
      try {
        await guild.bans.create(executorId, {
          reason: `Anti-Nuke: rogue bot — ${action}`,
          // Delete the past 7 days of messages from this bot
          deleteMessageSeconds: 604_800,
        });
        actionsTaken.push("• Banned (bot — instant ban, 7-day message purge)");
      } catch (e) {
        console.error("[ANTINUKE] Bot ban failed:", (e as Error).message);
        actionsTaken.push("• Ban failed — check permissions / role hierarchy");
      }
    } else {
      const member = guild.members.cache.get(executorId)
        ?? await guild.members.fetch(executorId).catch(() => null);

      await Promise.all([
        member
          ? member.roles.set([], "Anti-Nuke: roles stripped").catch(() => {})
          : Promise.resolve(),
        guild.bans.create(executorId, {
          reason: `Anti-Nuke: threshold exceeded — ${action}`,
          deleteMessageSeconds: 0,
        }).catch(e => {
          console.error("[ANTINUKE] Ban failed:", (e as Error).message);
        }),
      ]);
      actionsTaken.push("• Roles stripped + banned");
    }

  } else if (effectivePunish === "kick") {
    const member = guild.members.cache.get(executorId)
      ?? await guild.members.fetch(executorId).catch(() => null);

    if (member) {
      await member.roles.set([], "Anti-Nuke: instant strip before kick").catch(() => null);
      await member.kick(`Anti-Nuke: threshold exceeded — ${action}`).catch(async () => {
        await member.roles.set([], "Anti-Nuke: kick failed, stripping as fallback").catch(() => {});
        actionsTaken.push("• Kick failed — stripped roles as fallback");
        return;
      });
      actionsTaken.push("• Roles stripped + kicked");
    } else {
      actionsTaken.push("• Member not found");
    }

  } else {
    // strip
    const member = guild.members.cache.get(executorId)
      ?? await guild.members.fetch(executorId).catch(() => null);

    if (member) {
      await member.roles.set([], "Anti-Nuke: automated quarantine — roles stripped").catch(e => {
        console.error("[ANTINUKE] Strip failed:", (e as Error).message);
      });
      actionsTaken.push("• All roles stripped");
    } else {
      actionsTaken.push("• Member not found");
    }
  }

  // ── Webhook cleanup (webhookCreate action only) ───────────────────────────
  // Only fires when the quarantine was triggered by excessive webhook creation.
  // We scope deletion to webhooks actually owned by the offender rather than
  // nuking everything created in the past 2 minutes, which could catch
  // legitimate webhooks created by other admins around the same time.
  if (action === "webhookCreate") {
    try {
      const all     = await guild.fetchWebhooks();
      let   deleted = 0;
      for (const wh of all.values()) {
        if (wh.owner?.id === executorId) {
          await wh.delete("Anti-Nuke: rogue webhook cleanup").catch(() => {});
          deleted++;
        }
      }
      if (deleted > 0) actionsTaken.push(`• Deleted ${deleted} webhook(s) owned by offender`);
    } catch (e) {
      console.error("[ANTINUKE] Webhook cleanup failed:", e);
    }
  }

  // ── Log + DM — fully async, never blocks punishment ──────────────────────
  const embed = new EmbedBuilder()
    .setColor(0xFF0000)
    .setTitle("A nigga tried nuking us😂")
    .addFields(
      { name: "Who",           value: `<@${executorId}> (\`${executorId}\`)`, inline: false },
      { name: "What they did", value: details,                                 inline: false },
      { name: "Punishment",    value: effectivePunish,                         inline: false },
    )
    .setFooter({ text: guild.name })
    .setTimestamp();

  void (async () => {
    if (config.logChannelId) {
      try {
        const ch = await client.channels.fetch(config.logChannelId);
        if (ch && !ch.isDMBased() && ch.isTextBased()) {
          const pingIds = config.logPingIds ?? [];
          const content = pingIds.length > 0 ? pingIds.map(id => `<@${id}>`).join(" ") : undefined;
          await (ch as TextChannel).send({ content, embeds: [embed] });
        }
      } catch (e) {
        console.error("[ANTINUKE] Log channel send failed:", (e as Error).message);
      }
    }

    try {
      const owner = await guild.fetchOwner();
      await owner.send({
        content: `some random ass nigga got caught in **${guild.name}**`,
        embeds:  [embed],
      });
    } catch { /* DMs closed */ }
  })();

  setTimeout(() => quarantineActive.delete(key), 60_000);
  return true;
}

/**
 * Lenient quarantine — applied when a WHITELISTED user crosses the higher
 * lenient threshold. Always strips roles (never bans or kicks).
 * Posts a distinct warning embed to the log channel.
 * Does NOT trigger auto-restore — owner should review manually.
 */
export async function lenientQuarantine(
  client:    Client,
  guild:     Guild,
  executorId: string,
  action:    ActionType,
  details:   string,
): Promise<boolean> {
  const key = `lenient:${guild.id}:${executorId}`;
  if (quarantineActive.has(key)) return false;
  quarantineActive.add(key);
  clearActions(guild.id, executorId);

  console.warn(
    `[ANTINUKE] Lenient quarantine | Guild: ${guild.name} (${guild.id}) | Executor: ${executorId} | Action: ${action}`,
  );

  const config = await getConfig(guild.id);

  // Always strip — never ban/kick a whitelisted user
  const member = guild.members.cache.get(executorId)
    ?? await guild.members.fetch(executorId).catch(() => null);

  if (member) {
    await member.roles.set([], "Anti-Nuke: whitelisted user exceeded lenient threshold — roles stripped").catch(e => {
      console.error("[ANTINUKE] Lenient strip failed:", (e as Error).message);
    });
  }

  const embed = new EmbedBuilder()
    .setColor(0xFF8C00)
    .setTitle("⚠️ WHITELISTED USER WENT ROGUE")
    .setDescription(
      `<@${executorId}> is on the **lenient whitelist** but exceeded the extended threshold for \`${action}\`.\n\n` +
      `**Action:** ${details}\n\n` +
      `Their roles have been **stripped**. Review and restore manually if needed.\n` +
      `Use \`?antinuke restore <@${executorId}>\` to give roles back.`,
    )
    .addFields(
      { name: "User",       value: `<@${executorId}> (\`${executorId}\`)`,   inline: true  },
      { name: "Trigger",    value: `\`${action}\``,                           inline: true  },
      { name: "Punishment", value: "Roles stripped (whitelist — strip only)", inline: false },
    )
    .setFooter({ text: guild.name })
    .setTimestamp();

  void (async () => {
    if (config.logChannelId) {
      try {
        const ch = await client.channels.fetch(config.logChannelId);
        if (ch && !ch.isDMBased() && ch.isTextBased()) {
          const pingIds = config.logPingIds ?? [];
          const content = pingIds.length > 0 ? pingIds.map(id => `<@${id}>`).join(" ") : undefined;
          await (ch as TextChannel).send({ content, embeds: [embed] });
        }
      } catch (e) {
        console.error("[ANTINUKE] Lenient log send failed:", (e as Error).message);
      }
    }

    try {
      const owner = await guild.fetchOwner();
      await owner.send({
        content: `⚠️ A whitelisted staff member went rogue in **${guild.name}** — their roles have been stripped.`,
        embeds:  [embed],
      });
    } catch { /* DMs closed */ }
  })();

  setTimeout(() => quarantineActive.delete(key), 60_000);
  return true;
}
