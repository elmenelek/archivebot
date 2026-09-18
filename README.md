# Archive Bot

A Discord bot built with Node.js and discord.js. Handles moderation, plays YouTube audio in voice channels, and can export a channel's entire message history into a single self-contained HTML file styled like Discord itself.

![demo](demo.gif)

## Features

**Moderation**
- `$kick @user [reason]` — kick a member
- `$ban @user [reason]` — ban a member
- `$mute @user <minutes> [reason]` — timeout a member
- `$unmute @user` — clear a timeout
- `$clear <count>` — bulk-delete recent messages (max 100)

**Music**
- `$play <youtube-url>` — join your voice channel and stream the video's audio
- `$stop` — stop playback and disconnect

**Archiving**
- `$archive` — fetches the full history of the channel it's run in and builds a single HTML file (avatars, images, videos, embeds, reactions, and formatting all included, images embedded directly in the file) styled like Discord's own UI. The bot DMs a private download link to whoever ran the command — nothing is posted publicly in the channel.

**Utility**
- `$help` — list all commands

## Setup

1. Clone this repo and install dependencies:
   ```
   npm install
   ```
2. Create a Discord application and bot user at the [Discord Developer Portal](https://discord.com/developers/applications). Under **Bot**, enable the **Message Content Intent** and **Server Members Intent**.
3. Copy `.env.example` to `.env` and add your bot token:
   ```
   DISCORD_TOKEN=your-bot-token-here
   ```
4. Invite the bot to your server using the OAuth2 URL generator (scope: `bot`, with the permissions your use case needs — kick/ban/timeout/manage messages/connect+speak in voice).
5. Start the bot:
   ```
   npm start
   ```

## Notes

- Music playback uses `yt-dlp` under the hood, wrapped by `yt-dlp-exec`. Audio is streamed directly without saving files to disk.
- `$archive` downloads are served from a small local HTTP server bound to `127.0.0.1`, so the download link only works from the same machine the bot is running on.
- Only one instance of the bot should run at a time — running it twice (e.g. two terminals open) will cause every command to fire and reply more than once.

## Tech stack

- [discord.js](https://discord.js.org/) v14
- [@discordjs/voice](https://github.com/discordjs/discord.js/tree/main/packages/voice) for audio playback
- [yt-dlp-exec](https://www.npmjs.com/package/yt-dlp-exec) for YouTube extraction
- Plain Node.js `http` for the local archive download server
