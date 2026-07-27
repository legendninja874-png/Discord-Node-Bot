import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  EmbedBuilder,
  TextChannel,
  Message,
  GuildMember,
} from "discord.js";
import { addWarn, getWarns, removeWarns, addPromotion, addAttendance, addMvp } from "./store.js";

const ADMIN = PermissionFlagsBits.ManageGuild;
const MOD   = PermissionFlagsBits.ModerateMembers;

const HR  = "⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯";
const DOT = " · · · · · · · · · · · · · · · ";

const HOUR = 60 * 60 * 1000;

function timeoutDuration(count: number): number | null {
  if (count === 3) return 1 * HOUR;
  if (count === 4) return 12 * HOUR;
  if (count >= 5)  return 24 * HOUR;
  return null;
}

function timeoutLabel(count: number): string | null {
  if (count === 3) return "1 Hour Timeout";
  if (count === 4) return "12 Hour Timeout";
  if (count >= 5)  return "24 Hour Timeout";
  return null;
}

function findChannel(interaction: ChatInputCommandInteraction, ...keywords: string[]): TextChannel | null {
  const guild = interaction.guild;
  if (!guild) return null;
  for (const kw of keywords) {
    const found = guild.channels.cache.find(
      (c) => c.isTextBased() && c.name.toLowerCase().includes(kw.toLowerCase())
    ) as TextChannel | undefined;
    if (found) return found;
  }
  return null;
}

export const announceData = new SlashCommandBuilder()
  .setName("announce")
  .setDescription("Broadcast an official clan announcement.")
  .setDefaultMemberPermissions(ADMIN)
  .addStringOption((o) =>
    o.setName("title").setDescription("Announcement title").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("message").setDescription("Announcement body / content").setRequired(true)
  )
  .addChannelOption((o) =>
    o.setName("channel").setDescription("Target channel (defaults to current)").setRequired(false)
  )
  .addRoleOption((o) =>
    o.setName("ping_role").setDescription("Role to ping (optional)").setRequired(false)
  );

export async function executeAnnounce(interaction: ChatInputCommandInteraction): Promise<void> {
  const title    = interaction.options.getString("title", true);
  const message  = interaction.options.getString("message", true);
  const target   = interaction.options.getChannel("channel") as TextChannel | null;
  const pingRole = interaction.options.getRole("ping_role");

  const channel = (target ?? interaction.channel) as TextChannel | null;
  if (!channel || !("send" in channel)) {
    await interaction.editReply({ content: "❌ Cannot post in that channel." });
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x1d4ed8)
    .setAuthor({
      name: "LAST STAND  ·  OFFICIAL ANNOUNCEMENT",
      iconURL: interaction.guild?.iconURL() ?? undefined,
    })
    .setTitle(`📢  ${title.toUpperCase()}`)
    .setDescription(
      `${HR}\n\n${message}\n\n${HR}`
    )
    .setFooter({
      text: `Posted by ${interaction.user.tag}  ·  Last Stand (LS)`,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setTimestamp();

  await channel.send({ content: pingRole ? `${pingRole}` : undefined, embeds: [embed] });
  await interaction.editReply({ content: `✅ Announcement posted to ${channel}.` });
}

export const warnData = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("Issue a formal warning to a server member.")
  .setDefaultMemberPermissions(MOD)
  .addUserOption((o) =>
    o.setName("user").setDescription("Member to warn").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("reason").setDescription("Reason for the warning").setRequired(true)
  );

export async function executeWarn(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user", true);
  const reason = interaction.options.getString("reason", true);

  if (target.bot) {
    await interaction.editReply({ content: "❌ You cannot warn bots." });
    return;
  }

  addWarn({
    id: `${Date.now()}`,
    userId: target.id,
    userTag: target.tag,
    moderatorId: interaction.user.id,
    moderatorTag: interaction.user.tag,
    reason,
    timestamp: new Date().toISOString(),
    guildId: interaction.guildId ?? "",
  });

  const history = await getWarns(target.id, interaction.guildId ?? "");
  const warnCount = history.length;

  // Fetch member for timeout + DM
  let member: GuildMember | null = null;
  try {
    member = await interaction.guild?.members.fetch(target.id) ?? null;
  } catch { /* not in server */ }

  // Auto-timeout ladder
  const duration = timeoutDuration(warnCount);
  const label    = timeoutLabel(warnCount);
  let timedOut   = false;
  if (duration !== null && member) {
    try {
      await member.timeout(duration, `Warn #${warnCount} — ${reason}`);
      timedOut = true;
    } catch { /* missing perms or above hierarchy */ }
  }

  // DM the target
  if (member) {
    const dmEmbed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle("❗ Punishment Issued")
      .setDescription(
        "You received a punishment from staff for breaking server rules. " +
        "Please review the rules and check the details below."
      )
      .addFields(
        { name: "• Punishment", value: label ?? "Warning", inline: false },
        { name: "• Moderator", value: `<@${interaction.user.id}>`, inline: false },
        { name: "• Reason", value: reason, inline: false },
        { name: "• Total Warns", value: `${warnCount}`, inline: false },
        { name: "• Schedule", value: "3 warns → **1 Hour** · 4 warns → **12 Hour** · 5+ warns → **24 Hour**", inline: false },
      )
      .setFooter({ text: `${interaction.guild?.name ?? "Server"} Moderation Team` })
      .setTimestamp();
    try { await target.send({ embeds: [dmEmbed] }); } catch { /* DMs disabled */ }
  }

  const actionValue = label
    ? (timedOut
        ? `⏱️ **${label}** applied.`
        : `⏱️ **${label}** — could not apply *(check bot role/permissions)*.`)
    : "DM notification sent.";

  const embed = new EmbedBuilder()
    .setColor(warnCount >= 5 ? 0xE74C3C : warnCount >= 3 ? 0xE67E22 : 0xF1C40F)
    .setAuthor({
      name: "LAST STAND  ·  MODERATION LOG",
      iconURL: interaction.guild?.iconURL() ?? undefined,
    })
    .setTitle("⚠️  FORMAL WARNING ISSUED")
    .setDescription(
      `${HR}\n` +
      `▸  **MEMBER** ${DOT} <@${target.id}>\n` +
      `▸  **ISSUED BY** ${DOT} <@${interaction.user.id}>\n` +
      `▸  **TOTAL WARNINGS** ${DOT} \`${warnCount}\`\n` +
      `${HR}\n` +
      `**REASON**\n> ${reason}`
    )
    .addFields(
      { name: "• Action", value: actionValue, inline: true },
      { name: "• Schedule", value: "3 = 1hr · 4 = 12hr · 5+ = 24hr", inline: true },
    )
    .setThumbnail(target.displayAvatarURL())
    .setFooter({ text: `Last Stand (LS)  ·  Moderation System` })
    .setTimestamp();

  const channel = interaction.channel as TextChannel | null;
  if (channel) await channel.send({ embeds: [embed] });
  await interaction.editReply({ content: `✅ Warning issued to **${target.tag}**. (${warnCount} total)` });
}

export const clearwarnsData = new SlashCommandBuilder()
  .setName("clearwarns")
  .setDescription("Remove warnings from a server member.")
  .setDefaultMemberPermissions(MOD)
  .addUserOption((o) =>
    o.setName("user").setDescription("Member to clear warns for").setRequired(true)
  )
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("Number of warns to remove (default: all)").setRequired(false).setMinValue(1)
  );

export async function executeClearWarns(interaction: ChatInputCommandInteraction): Promise<void> {
  const target  = interaction.options.getUser("user", true);
  const current = await getWarns(target.id, interaction.guildId ?? "");

  if (current.length === 0) {
    await interaction.editReply({ content: `ℹ️ **${target.tag}** has no warnings on record.` });
    return;
  }

  const amount   = interaction.options.getInteger("amount") ?? current.length;
  const removed  = await removeWarns(target.id, interaction.guildId ?? "", amount);
  const newTotal = Math.max(0, current.length - removed);

  const nextThreshold =
    newTotal === 0 ? "No warnings — clean record"
    : newTotal < 3 ? `${3 - newTotal} more warn(s) until 1-hour timeout`
    : newTotal < 4 ? "1 more warn until 12-hour timeout"
    : newTotal < 5 ? "1 more warn until 24-hour timeout"
    : "At/above 5 — next warn = 24-hour timeout";

  const embed = new EmbedBuilder()
    .setColor(0x2ECC71)
    .setAuthor({
      name: "LAST STAND  ·  MODERATION LOG",
      iconURL: interaction.guild?.iconURL() ?? undefined,
    })
    .setTitle("✅  WARNINGS CLEARED")
    .setDescription(
      `${HR}\n` +
      `▸  **MEMBER** ${DOT} <@${target.id}>\n` +
      `▸  **ACTIONED BY** ${DOT} <@${interaction.user.id}>\n` +
      `${HR}`
    )
    .addFields(
      { name: "• Removed", value: `${removed}`, inline: true },
      { name: "• New Total", value: `${newTotal}`, inline: true },
      { name: "• Next Threshold", value: nextThreshold, inline: false },
    )
    .setThumbnail(target.displayAvatarURL())
    .setFooter({ text: `Last Stand (LS)  ·  Moderation System` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

export const promoteData = new SlashCommandBuilder()
  .setName("promote")
  .setDescription("Promote a clan member to a new rank.")
  .setDefaultMemberPermissions(ADMIN)
  .addUserOption((o) =>
    o.setName("user").setDescription("Member to promote").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("rank").setDescription("New rank / title").setRequired(true)
  );

export async function executePromote(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user", true);
  const rank   = interaction.options.getString("rank", true);

  addPromotion({
    id: `${Date.now()}`,
    userId: target.id,
    userTag: target.tag,
    moderatorId: interaction.user.id,
    moderatorTag: interaction.user.tag,
    type: "promote",
    newRank: rank,
    timestamp: new Date().toISOString(),
    guildId: interaction.guildId ?? "",
  });

  const embed = new EmbedBuilder()
    .setColor(0x15803d)
    .setAuthor({
      name: "LAST STAND  ·  RANK REGISTRY",
      iconURL: interaction.guild?.iconURL() ?? undefined,
    })
    .setTitle("🎖  RANK PROMOTION CONFIRMED")
    .setDescription(
      `${HR}\n` +
      `▸  **MEMBER** ${DOT} <@${target.id}>\n` +
      `▸  **NEW RANK** ${DOT} \`${rank}\`\n` +
      `▸  **PROMOTED BY** ${DOT} <@${interaction.user.id}>\n` +
      `${HR}`
    )
    .setThumbnail(target.displayAvatarURL())
    .setFooter({ text: `Last Stand (LS)  ·  Rank Registry` })
    .setTimestamp();

  const channel = interaction.channel as TextChannel | null;
  if (channel) await channel.send({ embeds: [embed] });
  await interaction.editReply({ content: `✅ **${target.tag}** promoted to **${rank}**.` });
}

export const demoteData = new SlashCommandBuilder()
  .setName("demote")
  .setDescription("Demote a clan member to a lower rank.")
  .setDefaultMemberPermissions(ADMIN)
  .addUserOption((o) =>
    o.setName("user").setDescription("Member to demote").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("rank").setDescription("New rank / title").setRequired(true)
  );

export async function executeDemote(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user", true);
  const rank   = interaction.options.getString("rank", true);

  addPromotion({
    id: `${Date.now()}`,
    userId: target.id,
    userTag: target.tag,
    moderatorId: interaction.user.id,
    moderatorTag: interaction.user.tag,
    type: "demote",
    newRank: rank,
    timestamp: new Date().toISOString(),
    guildId: interaction.guildId ?? "",
  });

  const embed = new EmbedBuilder()
    .setColor(0xb91c1c)
    .setAuthor({
      name: "LAST STAND  ·  RANK REGISTRY",
      iconURL: interaction.guild?.iconURL() ?? undefined,
    })
    .setTitle("📉  RANK DEMOTION CONFIRMED")
    .setDescription(
      `${HR}\n` +
      `▸  **MEMBER** ${DOT} <@${target.id}>\n` +
      `▸  **NEW RANK** ${DOT} \`${rank}\`\n` +
      `▸  **DEMOTED BY** ${DOT} <@${interaction.user.id}>\n` +
      `${HR}`
    )
    .setThumbnail(target.displayAvatarURL())
    .setFooter({ text: `Last Stand (LS)  ·  Rank Registry` })
    .setTimestamp();

  const channel = interaction.channel as TextChannel | null;
  if (channel) await channel.send({ embeds: [embed] });
  await interaction.editReply({ content: `✅ **${target.tag}** demoted to **${rank}**.` });
}

export const attendanceData = new SlashCommandBuilder()
  .setName("attendance")
  .setDescription("Log a member's attendance for an event.")
  .setDefaultMemberPermissions(MOD)
  .addStringOption((o) =>
    o.setName("event").setDescription("Event name").setRequired(true)
  )
  .addUserOption((o) =>
    o.setName("user").setDescription("Member to mark as present").setRequired(true)
  );

export async function executeAttendance(interaction: ChatInputCommandInteraction): Promise<void> {
  const event  = interaction.options.getString("event", true);
  const target = interaction.options.getUser("user", true);

  addAttendance({
    id: `${Date.now()}`,
    userId: target.id,
    userTag: target.tag,
    event,
    markedById: interaction.user.id,
    markedByTag: interaction.user.tag,
    timestamp: new Date().toISOString(),
    guildId: interaction.guildId ?? "",
  });

  const embed = new EmbedBuilder()
    .setColor(0x0369a1)
    .setAuthor({
      name: "LAST STAND  ·  ATTENDANCE REGISTRY",
      iconURL: interaction.guild?.iconURL() ?? undefined,
    })
    .setTitle("✅  ATTENDANCE LOGGED")
    .setDescription(
      `${HR}\n` +
      `▸  **MEMBER** ${DOT} <@${target.id}>\n` +
      `▸  **EVENT** ${DOT} \`${event}\`\n` +
      `▸  **LOGGED BY** ${DOT} <@${interaction.user.id}>\n` +
      `${HR}`
    )
    .setFooter({ text: `Last Stand (LS)  ·  Attendance System` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

export const pollData = new SlashCommandBuilder()
  .setName("poll")
  .setDescription("Launch a community vote or poll.")
  .setDefaultMemberPermissions(MOD)
  .addStringOption((o) =>
    o.setName("question").setDescription("Poll question").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("option1").setDescription("Option A").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("option2").setDescription("Option B").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("option3").setDescription("Option C (optional)").setRequired(false)
  )
  .addStringOption((o) =>
    o.setName("option4").setDescription("Option D (optional)").setRequired(false)
  );

export async function executePoll(interaction: ChatInputCommandInteraction): Promise<void> {
  const question = interaction.options.getString("question", true);
  const rawOptions = [
    interaction.options.getString("option1", true),
    interaction.options.getString("option2", true),
    interaction.options.getString("option3"),
    interaction.options.getString("option4"),
  ].filter((o): o is string => o !== null);

  const emojis  = ["🇦", "🇧", "🇨", "🇩"];
  const labels  = ["A", "B", "C", "D"];

  const optionsText = rawOptions
    .map((opt, i) => `${emojis[i]}  \`${labels[i]}\`  —  **${opt}**`)
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor(0x7c3aed)
    .setAuthor({
      name: "LAST STAND  ·  COMMUNITY VOTE",
      iconURL: interaction.guild?.iconURL() ?? undefined,
    })
    .setTitle(`📊  ${question}`)
    .setDescription(
      `${HR}\n\n${optionsText}\n\n${HR}\n*Cast your vote by reacting below.*`
    )
    .setFooter({
      text: `Poll by ${interaction.user.tag}  ·  Last Stand (LS) pay eon btw`,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setTimestamp();

  const channel = interaction.channel as TextChannel | null;
  if (!channel) {
    await interaction.editReply({ content: "❌ Cannot post in this channel." });
    return;
  }

  const msg: Message = await channel.send({ embeds: [embed] });
  for (let i = 0; i < rawOptions.length; i++) {
    await msg.react(emojis[i]).catch(() => {});
  }

  await interaction.editReply({ content: "✅ Poll launched." });
}

export const mvpData = new SlashCommandBuilder()
  .setName("mvp")
  .setDescription("Award MVP recognition to a standout member.")
  .setDefaultMemberPermissions(MOD)
  .addUserOption((o) =>
    o.setName("user").setDescription("MVP recipient").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("event").setDescription("Event or match name").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("reason").setDescription("Reason for the MVP award").setRequired(true)
  );

export async function executeMvp(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user", true);
  const event  = interaction.options.getString("event", true);
  const reason = interaction.options.getString("reason", true);

  addMvp({
    id: `${Date.now()}`,
    userId: target.id,
    userTag: target.tag,
    event,
    reason,
    awardedById: interaction.user.id,
    awardedByTag: interaction.user.tag,
    timestamp: new Date().toISOString(),
    guildId: interaction.guildId ?? "",
  });

  const embed = new EmbedBuilder()
    .setColor(0xb45309)
    .setAuthor({
      name: "LAST STAND  ·  PERFORMANCE BOARD",
      iconURL: interaction.guild?.iconURL() ?? undefined,
    })
    .setTitle("🏆  MVP OF THE SESSION")
    .setDescription(
      `${HR}\n` +
      `▸  **PLAYER** ${DOT} <@${target.id}>\n` +
      `▸  **EVENT** ${DOT} \`${event}\`\n` +
      `▸  **AWARDED BY** ${DOT} <@${interaction.user.id}>\n` +
      `${HR}\n` +
      `**CITATION**\n` +
      `> ${reason}`
    )
    .setThumbnail(target.displayAvatarURL())
    .setFooter({ text: `Last Stand (LS)  ·  Performance Board` })
    .setTimestamp();

  const channel = interaction.channel as TextChannel | null;
  if (channel) await channel.send({ embeds: [embed] });
  await interaction.editReply({ content: `✅ MVP awarded to **${target.tag}**.` });
}

export const suggestionData = new SlashCommandBuilder()
  .setName("suggestion")
  .setDescription("Submit a suggestion for the clan or server.")
  .addStringOption((o) =>
    o.setName("suggestion").setDescription("Your suggestion").setRequired(true)
  );

export async function executeSuggestion(interaction: ChatInputCommandInteraction): Promise<void> {
  const suggestion = interaction.options.getString("suggestion", true);

  const embed = new EmbedBuilder()
    .setColor(0x0891b2)
    .setAuthor({
      name: "LAST STAND  ·  SUGGESTIONS BOARD",
      iconURL: interaction.guild?.iconURL() ?? undefined,
    })
    .setTitle("💡  NEW SUGGESTION SUBMITTED")
    .setDescription(
      `${HR}\n\n` +
      `${suggestion}\n\n` +
      `${HR}\n` +
      `▸  **SUBMITTED BY** ${DOT} <@${interaction.user.id}>`
    )
    .setThumbnail(interaction.user.displayAvatarURL())
    .setFooter({ text: `Last Stand (LS)  ·  Suggestions Board` })
    .setTimestamp();

  const suggestionsChannel = findChannel(interaction, "suggestions", "suggest");
  const channel = (suggestionsChannel ?? interaction.channel) as TextChannel | null;

  if (!channel) {
    await interaction.editReply({ content: "❌ Could not find a channel to post in." });
    return;
  }

  const msg: Message = await channel.send({ embeds: [embed] });
  await msg.react("✅").catch(() => {});
  await msg.react("❌").catch(() => {});

  await interaction.editReply({
    content: suggestionsChannel
      ? `✅ Suggestion posted to ${suggestionsChannel}.`
      : "✅ Suggestion posted.",
  });
}
