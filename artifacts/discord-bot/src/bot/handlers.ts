import type { ChatInputCommandInteraction, ButtonInteraction, Client } from "discord.js";

import { execute as setupPanelExecute } from "../commands/setupChallengePanel.js";
import { executeSetupLeaderboard } from "../leaderboard/display.js";
import {
  executeAddPlayer,
  executeRemovePlayer,
  executeEditPlayer,
} from "../leaderboard/commands.js";
import { executeSetupMobileLeaderboard } from "../leaderboard/mobileDisplay.js";
import {
  executeAddMobilePlayer,
  executeRemoveMobilePlayer,
  executeEditMobilePlayer,
} from "../leaderboard/mobileCommands.js";
import { executeSetupKillLeaderboard } from "../killLeaderboard/display.js";
import {
  executeAddKillPlayer,
  executeEditKillPlayer,
  executeMoveKillPlayer,
  executeRemoveKillPlayer,
} from "../killLeaderboard/commands.js";
import { executeStartRaid, executeEndRaid } from "../raids/index.js";
import { executeRaidCall } from "../raids/announce.js";
import { executeTraining } from "../training/index.js";
import {
  executeAnnounce,
  executeWarn,
  executeClearWarns,
  executeAttendance,
  executePoll,
  executeMvp,
  executeSuggestion,
} from "../utility/index.js";
import { executePromote, executeDemote } from "../promotions/index.js";
import { executeBackupDb } from "../utility/backup.js";
import { executeSetupRules } from "../rules/index.js";
import { executeTournament, executeCloseTournament } from "../tournament/index.js";
import { executeCensor, executeStopCensor } from "../moderation/commands.js";
import {
  executeRank,
  executeLeaderboard,
  executeWeeklyLb,
  executeAddXp,
  executeRemoveXp,
  executeSetXp,
  executeResetXp,
  executeExportData,
  executeSetLevelRole,
  executeRemoveLevelRole,
  executeSetXpCooldown,
  executeSetXpRange,
  executeSetXpChannel,
  executeSetMultiplier,
  executeBlacklistChannel,
  executeWhitelistChannel,
  executeXpConfig,
  executeLevelRoles,
  executeStartLsXpSystem,
  executeStopLsXpSystem,
} from "../leveling/commands.js";
import { executeUniversalLeaderboard } from "../leveling/universalLeaderboard.js";
import { executeDashboard } from "../leveling/dashboard.js";
import {
  executeKick,
  executeBan,
  executeTempban,
  executeMute,
  executeUnmute,
  executeTimeout,
  executePurge,
  executeSlowmode,
  executeLock,
  executeUnlock,
  executeWarnings,
} from "../moderation/modActions.js";
import {
  executeSetup,
  executePrefix,
  executeSetrole,
  executeAdminBackup,
  executeEmbed,
} from "../admin/commands.js";
import {
  executeUserinfo,
  executeServerinfo,
  executeAvatar,
  executeRoleinfo,
  executeReminder,
  executeAfk,
  executeBotinfo,
  executePing,
  executeChannelinfo,
  executeTranslate,
  executeTime,
} from "../utility/utilCommands.js";
import {
  executePlay,
  executePause,
  executeResume,
  executeSkip,
  executeQueue,
  executeVolume,
  executeNowplaying,
  executeShuffle,
  executeLoop,
  executeStop,
} from "../music/commands.js";
import { executeHelp } from "../commands/help.js";
import { executePurgeConfig } from "../moderation/purge.js";
import {
  executeLowoEnable,
  executeLowoDisable,
  executeLowoDynamicEnable,
  executeLowoDynamicDisable,
  executeLowoadmin,
} from "../lowo/slashCommands.js";
import { handleCreateTicket } from "../tickets/ticketFlow.js";
import { handleCloseTicket, handleDeleteTicket } from "../tickets/ticketControls.js";
import { executeCreator } from "../commands/creator.js";

export const PUBLIC_COMMANDS: ReadonlySet<string> = new Set([
  "levellb", "weeklylb", "rank", "leaderboard", "help",
  "userinfo", "serverinfo", "avatar", "roleinfo", "botinfo", "ping",
  "channelinfo", "time", "afk", "reminder",
  "creator",
  "play", "pause", "resume", "skip", "queue", "volume",
  "nowplaying", "shuffle", "loop", "stop",
  "warnings",
]);

export function buildSlashHandlers(
  client: Client,
  reregister: () => Promise<void>,
): Record<string, (i: ChatInputCommandInteraction) => Promise<void>> {
  return {
    setupchallengepanel: setupPanelExecute,
    setupleaderboard: (i) => executeSetupLeaderboard(i, client),
    addleaderboardplayer: (i) => executeAddPlayer(i, client),
    removeleaderboardplayer: (i) => executeRemovePlayer(i, client),
    editleaderboardplayer: (i) => executeEditPlayer(i, client),
    setupmobileleaderboard: (i) => executeSetupMobileLeaderboard(i, client),
    addmobileplayer: (i) => executeAddMobilePlayer(i, client),
    removemobileplayer: (i) => executeRemoveMobilePlayer(i, client),
    editmobileplayer: (i) => executeEditMobilePlayer(i, client),
    setupkillleaderboard: (i) => executeSetupKillLeaderboard(i, client),
    addkillplayer: (i) => executeAddKillPlayer(i, client),
    editkillplayer: (i) => executeEditKillPlayer(i, client),
    removekillplayer: (i) => executeRemoveKillPlayer(i, client),
    movek: (i) => executeMoveKillPlayer(i, client),
    startraid: executeStartRaid,
    endraid: executeEndRaid,
    raid: (i) => {
      const sub = i.options.getSubcommand(false);
      if (sub === "call") return executeRaidCall(i);
      return Promise.resolve();
    },
    training: executeTraining,
    announce: executeAnnounce,
    warn: executeWarn,
    clearwarns: executeClearWarns,
    promote: executePromote,
    demote: executeDemote,
    attendance: executeAttendance,
    poll: executePoll,
    mvp: executeMvp,
    suggestion: executeSuggestion,
    setuprules: executeSetupRules,
    tournament: executeTournament,
    closetournament: executeCloseTournament,
    censor: executeCensor,
    stopcensor: executeStopCensor,
    rank: executeRank,
    levellb: executeLeaderboard,
    weeklylb: executeWeeklyLb,
    addxp: executeAddXp,
    removexp: executeRemoveXp,
    setxp: executeSetXp,
    resetxp: executeResetXp,
    exportdata: executeExportData,
    backupdb: executeBackupDb,
    setlevelrole: executeSetLevelRole,
    removelevelrole: executeRemoveLevelRole,
    setxpcooldown: executeSetXpCooldown,
    setxprange: executeSetXpRange,
    setxpchannel: executeSetXpChannel,
    setmultiplier: executeSetMultiplier,
    blacklistchannel: executeBlacklistChannel,
    whitelistchannel: executeWhitelistChannel,
    xpconfig: executeXpConfig,
    levelroles: executeLevelRoles,
    startlsxpsystem: executeStartLsXpSystem,
    stoplsxpsystem: executeStopLsXpSystem,
    dashboard: executeDashboard,
    leaderboard: executeUniversalLeaderboard,
    kick: executeKick,
    ban: executeBan,
    tempban: executeTempban,
    mute: executeMute,
    unmute: executeUnmute,
    timeout: executeTimeout,
    purge: executePurge,
    slowmode: executeSlowmode,
    lock: executeLock,
    unlock: executeUnlock,
    warnings: executeWarnings,
    setup: executeSetup,
    prefix: executePrefix,
    setrole: executeSetrole,
    backup: executeAdminBackup,
    embed: executeEmbed,
    userinfo: executeUserinfo,
    serverinfo: executeServerinfo,
    avatar: executeAvatar,
    roleinfo: executeRoleinfo,
    reminder: executeReminder,
    afk: executeAfk,
    botinfo: executeBotinfo,
    ping: executePing,
    channelinfo: executeChannelinfo,
    translate: executeTranslate,
    time: executeTime,
    creator: (i) => executeCreator(i, client),
    play: executePlay,
    pause: executePause,
    resume: executeResume,
    skip: executeSkip,
    queue: executeQueue,
    volume: executeVolume,
    nowplaying: executeNowplaying,
    shuffle: executeShuffle,
    loop: executeLoop,
    stop: executeStop,
    help: executeHelp,
    purgeconfig: executePurgeConfig,
    lowoenable: (i) => executeLowoEnable(i, reregister),
    lowodisable: (i) => executeLowoDisable(i, reregister),
    lowodynamicenable: executeLowoDynamicEnable,
    lowodynamicdisable: executeLowoDynamicDisable,
    lowoadmin: executeLowoadmin,
  };
}

export const BUTTON_HANDLERS: Record<string, (i: ButtonInteraction) => Promise<void>> = {
  create_challenge_ticket: handleCreateTicket,
  close_ticket: handleCloseTicket,
  delete_ticket: handleDeleteTicket,
};
