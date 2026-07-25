// src/schema/index.ts
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
var botKvTable = pgTable("bot_kv", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
var activityTrackerTable = pgTable("activity_tracker", {
  userId: text("user_id").primaryKey(),
  lastMessage: timestamp("last_message", { withTimezone: true }),
  lastVoice: timestamp("last_voice", { withTimezone: true }),
  totalMessages: integer("total_messages").notNull().default(0)
});
var authBackupsTable = pgTable("auth_backups", {
  userId: text("user_id").notNull(),
  guildId: text("guild_id").notNull().default(""),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiry: timestamp("token_expiry", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow()
});
var botSequencesTable = pgTable("bot_sequences", {
  name: text("name").primaryKey(),
  value: integer("value").notNull().default(0)
});
var economyUsersTable = pgTable("economy_users", {
  userId: text("user_id").primaryKey(),
  balance: bigint("balance", { mode: "number" }).notNull().default(0),
  bank: bigint("bank", { mode: "number" }).notNull().default(0),
  lastDaily: bigint("last_daily", { mode: "number" }).notNull().default(0),
  lastWeekly: bigint("last_weekly", { mode: "number" }).notNull().default(0),
  lastWork: bigint("last_work", { mode: "number" }).notNull().default(0),
  lastRob: bigint("last_rob", { mode: "number" }).notNull().default(0),
  lastCrime: bigint("last_crime", { mode: "number" }).notNull().default(0),
  lastInvest: bigint("last_invest", { mode: "number" }).notNull().default(0),
  inventory: jsonb("inventory").notNull().default([]),
  investAmount: bigint("invest_amount", { mode: "number" }).notNull().default(0),
  investAt: bigint("invest_at", { mode: "number" }).notNull().default(0),
  totalEarned: bigint("total_earned", { mode: "number" }).notNull().default(0)
});
var killLeaderboardPlayersTable = pgTable("kill_leaderboard_players", {
  id: serial("id").primaryKey(),
  rank: integer("rank").notNull(),
  displayName: text("display_name").notNull().default(""),
  robloxUsername: text("roblox_username").notNull().default(""),
  discordUsername: text("discord_username").notNull().default(""),
  position: text("position").notNull().default("Clan Member"),
  killCount: integer("kill_count").notNull().default(0),
  stage: text("stage").notNull().default(""),
  avatarUrl: text("avatar_url").notNull().default("")
});
var killPinnedMessagesTable = pgTable("kill_pinned_messages", {
  guildId: text("guild_id").primaryKey(),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id").notNull()
});
var leaderboardPlayersTable = pgTable("leaderboard_players", {
  id: serial("id").primaryKey(),
  position: integer("position").notNull(),
  displayName: text("display_name").notNull().default(""),
  robloxUsername: text("roblox_username").notNull().default(""),
  discordUsername: text("discord_username").notNull().default(""),
  country: text("country").notNull().default(""),
  avatarUrl: text("avatar_url").notNull().default(""),
  stageRank: text("stage_rank").notNull().default("")
});
var leaderboardPinnedMessagesTable = pgTable("leaderboard_pinned_messages", {
  guildId: text("guild_id").primaryKey(),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id").notNull()
});
var mewoEnabledChannelsTable = pgTable("mewo_enabled_channels", {
  channelId: text("channel_id").primaryKey()
});
var mewoTagsTable = pgTable("mewo_tags", {
  guildId: text("guild_id").notNull(),
  name: text("name").notNull(),
  content: text("content").notNull().default(""),
  createdBy: text("created_by").notNull().default(""),
  createdByTag: text("created_by_tag").notNull().default(""),
  createdAt: text("created_at").notNull().default("")
}, (t) => [primaryKey({ columns: [t.guildId, t.name] })]);
var mewoTimezonesTable = pgTable("mewo_timezones", {
  userId: text("user_id").primaryKey(),
  timezone: text("timezone").notNull().default("UTC")
});
var mewoEmbedColorsTable = pgTable("mewo_embed_colors", {
  userId: text("user_id").primaryKey(),
  color: text("color").notNull()
});
var mewoAiUsageTable = pgTable("mewo_ai_usage", {
  userId: text("user_id").primaryKey(),
  chatgpt: integer("chatgpt").notNull().default(0),
  llama: integer("llama").notNull().default(0),
  deepseek: integer("deepseek").notNull().default(0),
  resetDate: text("reset_date").notNull().default("")
});
var mewoWalletsTable = pgTable("mewo_wallets", {
  userId: text("user_id").primaryKey(),
  balance: bigint("balance", { mode: "number" }).notNull().default(0),
  dailyDate: text("daily_date").notNull().default(""),
  streak: integer("streak").notNull().default(0),
  lastClaimDate: text("last_claim_date").notNull().default("")
});
var censorGuildConfigTable = pgTable("censor_guild_config", {
  guildId: text("guild_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  modLogChannelId: text("mod_log_channel_id")
});
var censorUserFlagsTable = pgTable("censor_user_flags", {
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  count: integer("count").notNull().default(0),
  lastFlag: text("last_flag").notNull().default(""),
  totalLifetime: integer("total_lifetime").notNull().default(0)
}, (t) => [primaryKey({ columns: [t.guildId, t.userId] })]);
var raidResultsTable = pgTable("raid_results", {
  id: text("id").primaryKey(),
  clanName: text("clan_name").notNull().default(""),
  opponentClan: text("opponent_clan").notNull().default(""),
  result: text("result").notNull().default(""),
  topPerformers: text("top_performers").notNull().default(""),
  notes: text("notes").notNull().default(""),
  endedBy: text("ended_by").notNull().default(""),
  endedById: text("ended_by_id").notNull().default(""),
  timestamp: text("timestamp").notNull().default(""),
  guildId: text("guild_id").notNull().default(""),
  raidNumber: integer("raid_number").notNull().default(0)
});
var rulesMessagesTable = pgTable("rules_messages", {
  guildId: text("guild_id").primaryKey(),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id").notNull()
});
var tournamentsTable = pgTable("tournaments", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull().default(""),
  channelId: text("channel_id").notNull().default(""),
  messageId: text("message_id").notNull().default(""),
  about: text("about").notNull().default(""),
  rules: text("rules").notNull().default(""),
  gameLink: text("game_link").notNull().default(""),
  prize: text("prize").notNull().default(""),
  pingRoleId: text("ping_role_id").notNull().default(""),
  tournamentDate: text("tournament_date").notNull().default(""),
  tournamentTime: text("tournament_time").notNull().default(""),
  hostId: text("host_id").notNull().default(""),
  hostTag: text("host_tag").notNull().default(""),
  maxParticipants: integer("max_participants").notNull().default(0),
  entryRequirement: text("entry_requirement").notNull().default(""),
  notes: text("notes"),
  registrationDeadline: text("registration_deadline"),
  closed: boolean("closed").notNull().default(false),
  createdById: text("created_by_id").notNull().default(""),
  createdByTag: text("created_by_tag").notNull().default(""),
  createdAt: text("created_at").notNull().default("")
});
var tournamentParticipantsTable = pgTable("tournament_participants", {
  tournamentId: text("tournament_id").notNull(),
  userId: text("user_id").notNull(),
  userTag: text("user_tag").notNull().default(""),
  joinedAt: text("joined_at").notNull().default("")
}, (t) => [primaryKey({ columns: [t.tournamentId, t.userId] })]);
var trainingLogsTable = pgTable("training_logs", {
  id: text("id").primaryKey(),
  host: text("host").notNull().default(""),
  durationCompleted: text("duration_completed").notNull().default(""),
  mvp: text("mvp").notNull().default(""),
  notes: text("notes").notNull().default(""),
  endedBy: text("ended_by").notNull().default(""),
  endedById: text("ended_by_id").notNull().default(""),
  timestamp: text("timestamp").notNull().default(""),
  guildId: text("guild_id").notNull().default(""),
  sessionNumber: integer("session_number").notNull().default(0)
});
var warnsTable = pgTable("warns", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  userTag: text("user_tag").notNull().default(""),
  moderatorId: text("moderator_id").notNull().default(""),
  moderatorTag: text("moderator_tag").notNull().default(""),
  reason: text("reason").notNull().default(""),
  timestamp: text("timestamp").notNull().default(""),
  guildId: text("guild_id").notNull()
});
var promotionsTable = pgTable("promotions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  userTag: text("user_tag").notNull().default(""),
  moderatorId: text("moderator_id").notNull().default(""),
  moderatorTag: text("moderator_tag").notNull().default(""),
  type: text("type").notNull().default("promote"),
  newRank: text("new_rank").notNull().default(""),
  timestamp: text("timestamp").notNull().default(""),
  guildId: text("guild_id").notNull()
});
var attendancesTable = pgTable("attendances", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  userTag: text("user_tag").notNull().default(""),
  event: text("event").notNull().default(""),
  markedById: text("marked_by_id").notNull().default(""),
  markedByTag: text("marked_by_tag").notNull().default(""),
  timestamp: text("timestamp").notNull().default(""),
  guildId: text("guild_id").notNull()
});
var mvpsTable = pgTable("mvps", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  userTag: text("user_tag").notNull().default(""),
  event: text("event").notNull().default(""),
  reason: text("reason").notNull().default(""),
  awardedById: text("awarded_by_id").notNull().default(""),
  awardedByTag: text("awarded_by_tag").notNull().default(""),
  timestamp: text("timestamp").notNull().default(""),
  guildId: text("guild_id").notNull()
});
var antiNukeWhitelistTable = pgTable("antinuke_whitelist", {
  guildId: text("guild_id").primaryKey(),
  userIds: text("user_ids").array().notNull().default([]),
  immuneIds: text("immune_ids").array().notNull().default([])
});
var antiNukeConfigTable = pgTable("antinuke_config", {
  guildId: text("guild_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  logChannelId: text("log_channel_id"),
  logPingIds: text("log_ping_ids").array().notNull().default([]),
  thresholds: jsonb("thresholds").notNull().default({})
});
var lowoGuildSettingsTable = pgTable("lowo_guild_settings", {
  guildId: text("guild_id").primaryKey(),
  whitelistMode: boolean("whitelist_mode").notNull().default(false),
  allowedChannels: text("allowed_channels").array().notNull().default([]),
  dynamicMode: boolean("dynamic_mode").notNull().default(false)
});
var lowoEmojiOverridesTable = pgTable("lowo_emoji_overrides", {
  guildId: text("guild_id").primaryKey(),
  overrides: jsonb("overrides").notNull().default({})
});
var dashboardAuditLogsTable = pgTable("dashboard_audit_logs", {
  id: text("id").primaryKey(),
  action: text("action").notNull(),
  userId: text("user_id").notNull(),
  username: text("username").notNull().default(""),
  before: jsonb("before").notNull().default({}),
  after: jsonb("after").notNull().default({}),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
var insertDashboardAuditLogSchema = createInsertSchema(dashboardAuditLogsTable);
var selectDashboardAuditLogSchema = createSelectSchema(dashboardAuditLogsTable);
var insertBotKvSchema = createInsertSchema(botKvTable);
var selectBotKvSchema = createSelectSchema(botKvTable);
var insertActivitySchema = createInsertSchema(activityTrackerTable);
var selectActivitySchema = createSelectSchema(activityTrackerTable);
var insertAuthBackupSchema = createInsertSchema(authBackupsTable);
var selectAuthBackupSchema = createSelectSchema(authBackupsTable);
export {
  activityTrackerTable,
  antiNukeConfigTable,
  antiNukeWhitelistTable,
  attendancesTable,
  authBackupsTable,
  botKvTable,
  botSequencesTable,
  censorGuildConfigTable,
  censorUserFlagsTable,
  dashboardAuditLogsTable,
  economyUsersTable,
  insertActivitySchema,
  insertAuthBackupSchema,
  insertBotKvSchema,
  insertDashboardAuditLogSchema,
  killLeaderboardPlayersTable,
  killPinnedMessagesTable,
  leaderboardPinnedMessagesTable,
  leaderboardPlayersTable,
  lowoEmojiOverridesTable,
  lowoGuildSettingsTable,
  mewoAiUsageTable,
  mewoEmbedColorsTable,
  mewoEnabledChannelsTable,
  mewoTagsTable,
  mewoTimezonesTable,
  mewoWalletsTable,
  mvpsTable,
  promotionsTable,
  raidResultsTable,
  rulesMessagesTable,
  selectActivitySchema,
  selectAuthBackupSchema,
  selectBotKvSchema,
  selectDashboardAuditLogSchema,
  tournamentParticipantsTable,
  tournamentsTable,
  trainingLogsTable,
  warnsTable
};
