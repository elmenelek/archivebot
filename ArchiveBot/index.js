require('dotenv').config();
const http = require('http');
const crypto = require('crypto');
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  getVoiceConnection,
} = require('@discordjs/voice');
const youtubedl = require('yt-dlp-exec');
const ffmpegPath = require('ffmpeg-static');
const { buildArchiveHtml } = require('./archive');

process.env.FFMPEG_PATH = ffmpegPath;

const YOUTUBE_URL_PATTERN = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|music\.youtube\.com\/watch\?v=)/i;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const players = new Map();

const HELP_TEXT = [
  '```ansi',
  '[0;32m[archive-bot][0m boot sequence complete',
  '[0;36m>[0m online.',
  '',
  '[0;90m$ man commands[0m',
  '',
  '[0;33m$help[0m                        print this manual',
  '[0;33m$kick[0m   @user [reason]      remove a member from the server',
  '[0;33m$ban[0m    @user [reason]      permanently ban a member',
  '[0;33m$mute[0m   @user <mins> [reason] timeout a member',
  '[0;33m$unmute[0m @user               clear a timeout',
  '[0;33m$clear[0m  <count>             purge recent messages (max 100)',
  '[0;33m$play[0m   <youtube-url>       stream audio into your voice channel',
  '[0;33m$stop[0m                       stop playback and disconnect',
  '[0;33m$archive[0m                    save this channel history to an HTML file',
  '',
  '[0;90m// archive-bot[0m',
  '[0;90m// GitHub: https://github.com/elmenelek[0m',
  '```',
].join('\n');

const DOWNLOAD_PORT = 47591;
const DOWNLOAD_TTL_MS = 15 * 60 * 1000;
const pendingDownloads = new Map();

const downloadServer = http.createServer((req, res) => {
  const token = req.url.replace(/^\/download\//, '').split('?')[0];
  const entry = pendingDownloads.get(token);

  if (!entry) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Link expired or invalid.');
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Disposition': `attachment; filename="${entry.filename}"`,
    'Content-Length': entry.buffer.length,
  });
  res.end(entry.buffer);

  pendingDownloads.delete(token);
  clearTimeout(entry.expiryTimer);
});

downloadServer.listen(DOWNLOAD_PORT, '127.0.0.1', () => {
  console.log(`Local download server ready on http://localhost:${DOWNLOAD_PORT}`);
});

function registerDownload(buffer, filename) {
  const token = crypto.randomUUID();
  const expiryTimer = setTimeout(() => pendingDownloads.delete(token), DOWNLOAD_TTL_MS);
  pendingDownloads.set(token, { buffer, filename, expiryTimer });
  return `http://localhost:${DOWNLOAD_PORT}/download/${token}`;
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const [command, ...args] = message.content.trim().split(/\s+/);

  if (command === '$help') {
    message.reply(HELP_TEXT);
    return;
  }

  if (command === '$kick') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
      return message.reply("You don't have permission to kick members.");
    }
    const target = message.mentions.members?.first();
    if (!target) return message.reply('Mention a member to kick, e.g. `$kick @user`.');
    if (!target.kickable) return message.reply("I can't kick that member.");

    const reason = args.slice(1).join(' ') || 'No reason provided';
    await target.kick(reason);
    message.reply(`Kicked **${target.user.tag}**. Reason: ${reason}`);
    return;
  }

  if (command === '$ban') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
      return message.reply("You don't have permission to ban members.");
    }
    const target = message.mentions.members?.first();
    if (!target) return message.reply('Mention a member to ban, e.g. `$ban @user`.');
    if (!target.bannable) return message.reply("I can't ban that member.");

    const reason = args.slice(1).join(' ') || 'No reason provided';
    await target.ban({ reason });
    message.reply(`Banned **${target.user.tag}**. Reason: ${reason}`);
    return;
  }

  if (command === '$mute') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply("You don't have permission to mute members.");
    }
    const target = message.mentions.members?.first();
    if (!target) return message.reply('Mention a member to mute, e.g. `$mute @user 10`.');
    if (!target.moderatable) return message.reply("I can't mute that member.");

    const minutes = parseInt(args[1], 10);
    if (!minutes || minutes <= 0) {
      return message.reply('Give a duration in minutes, e.g. `$mute @user 10`.');
    }

    const reason = args.slice(2).join(' ') || 'No reason provided';
    await target.timeout(minutes * 60 * 1000, reason);
    message.reply(`Muted **${target.user.tag}** for ${minutes} minute(s). Reason: ${reason}`);
    return;
  }

  if (command === '$unmute') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
      return message.reply("You don't have permission to unmute members.");
    }
    const target = message.mentions.members?.first();
    if (!target) return message.reply('Mention a member to unmute, e.g. `$unmute @user`.');

    await target.timeout(null);
    message.reply(`Unmuted **${target.user.tag}**.`);
    return;
  }

  if (command === '$clear') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply("You don't have permission to delete messages.");
    }
    const count = parseInt(args[0], 10);
    if (!count || count < 1 || count > 100) {
      return message.reply('Give a number between 1 and 100, e.g. `$clear 20`.');
    }

    const deleted = await message.channel.bulkDelete(count + 1, true);
    const confirmation = await message.channel.send(`Deleted ${deleted.size - 1} message(s).`);
    setTimeout(() => confirmation.delete().catch(() => {}), 5000);
    return;
  }

  if (command === '$play') {
    const url = args[0];
    if (!url || !YOUTUBE_URL_PATTERN.test(url)) {
      return message.reply('Give me a valid YouTube link, e.g. `$play https://youtube.com/watch?v=...`.');
    }

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
      return message.reply('Join a voice channel first.');
    }

    let ytProcess;
    try {
      const info = await youtubedl(url, {
        dumpSingleJson: true,
        noWarnings: true,
        noPlaylist: true,
        format: 'bestaudio/best',
      });

      ytProcess = youtubedl.exec(
        url,
        {
          output: '-',
          format: 'bestaudio/best',
          noPlaylist: true,
          quiet: true,
          noWarnings: true,
        },
        { stdio: ['ignore', 'pipe', 'ignore'] }
      );

      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
      });

      const player = createAudioPlayer();
      const resource = createAudioResource(ytProcess.stdout);

      connection.subscribe(player);
      player.play(resource);
      players.set(message.guild.id, { player, connection, ytProcess });

      player.once(AudioPlayerStatus.Idle, () => {
        connection.destroy();
        ytProcess.kill();
        players.delete(message.guild.id);
      });

      connection.once(VoiceConnectionStatus.Disconnected, () => {
        player.stop();
        ytProcess.kill();
        players.delete(message.guild.id);
      });

      message.reply(`Now playing: **${info.title}**`);
    } catch (err) {
      console.error(err);
      ytProcess?.kill();
      message.reply("Couldn't play that link.");
    }
    return;
  }

  if (command === '$stop') {
    const session = players.get(message.guild.id);
    if (!session) return message.reply('Nothing is playing.');

    session.player.stop();
    session.connection.destroy();
    session.ytProcess?.kill();
    players.delete(message.guild.id);
    message.reply('Stopped and disconnected.');
    return;
  }

  if (command === '$archive') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply("You don't have permission to archive this channel.");
    }

    const statusMsg = await message.reply('Archiving channel... fetching messages (0 so far)');

    try {
      const channel = message.channel;
      const allMessages = [];
      let lastId;

      while (true) {
        const fetchOptions = { limit: 100 };
        if (lastId) fetchOptions.before = lastId;

        const batch = await channel.messages.fetch(fetchOptions);
        if (batch.size === 0) break;

        allMessages.push(...batch.values());
        lastId = batch.last().id;

        if (allMessages.length % 500 === 0) {
          await statusMsg.edit(`Archiving channel... fetched ${allMessages.length} messages so far`);
        }

        if (batch.size < 100) break;
      }

      allMessages.reverse();

      await statusMsg.edit(`Fetched ${allMessages.length} messages. Building archive (downloading images)...`);

      const html = await buildArchiveHtml(channel, allMessages, async (done, total) => {
        await statusMsg.edit(`Building archive... processed ${done}/${total} messages`);
      });

      const safeName = (channel.name || 'dm').replace(/[^a-z0-9-_]/gi, '_');
      const filename = `archive-${safeName}-${Date.now()}.html`;
      const downloadUrl = registerDownload(Buffer.from(html, 'utf8'), filename);

      try {
        await message.author.send(
          `Your archive of **#${channel.name}** (${allMessages.length} messages) is ready.\n` +
            `Download it here (link works for 15 minutes, only from this PC): ${downloadUrl}`
        );
        await statusMsg.edit(`Archive complete: ${allMessages.length} messages. Check your DMs for the download link.`);
      } catch (dmErr) {
        console.error(dmErr);
        await statusMsg.edit(
          "I couldn't DM you the download link — check that your privacy settings allow DMs from server members, then run `$archive` again."
        );
      }
    } catch (err) {
      console.error(err);
      await statusMsg.edit('Something went wrong while archiving this channel.');
    }
    return;
  }
});

client.login(process.env.DISCORD_TOKEN);
