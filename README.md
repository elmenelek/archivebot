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


## Tech stack

- [discord.js](https://discord.js.org/) v14
- [@discordjs/voice](https://github.com/discordjs/discord.js/tree/main/packages/voice) for audio playback
- [yt-dlp-exec](https://www.npmjs.com/package/yt-dlp-exec) for YouTube extraction
- Plain Node.js `http` for the local archive download server
