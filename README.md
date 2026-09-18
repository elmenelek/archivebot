# Archive Bot

A Discord bot built with Node.js and discord.js. Handles moderation, plays YouTube audio in voice channels, and can export a channel's entire message history into a single self-contained HTML file styled like Discord itself.

![demo](demo.gif)

## Features

**Moderation**
- `$kick @user [reason]` kick a member
- `$ban @user [reason]` ban a member
- `$mute @user <minutes> [reason]` timeout a member
- `$unmute @user` clear a timeout
- `$clear <count>` bulk delete recent messages (max 100)

**Music**
- `$play <youtube-url>` join your voice channel and stream the video's audio
- `$stop` stop playback and disconnect

**Archiving**
- `$archive` fetches the full history of the channel it's run in and builds a single HTML file (avatars, images, videos, embeds, reactions, and formatting all included, images embedded directly in the file) styled like Discord's own UI. The bot DMs a private download link to whoever ran the command, nothing is posted publicly in the channel.

**Utility**
- `$help` list all commands

## Getting the source code

Download or clone this repository to your computer. If you got it as a zip, just extract it somewhere you'll remember, like your desktop or a projects folder. You'll need [Node.js](https://nodejs.org/) installed (version 18 or newer works fine) before going any further.

Once you have the folder, open a terminal inside it and install the dependencies:

```
npm install
```

## Creating your own Discord bot and getting a token

The bot needs its own Discord application and a token to log in. This part is free and only takes a couple minutes.

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and log in with your Discord account.
2. Click **New Application**, give it a name (this is what shows up as the bot's username), and create it.
3. On the left sidebar, click **Bot**. Click **Reset Token** (or **Add Bot** if it's your first time) to generate a token, then click **Copy**. Keep this somewhere safe, anyone with this token can fully control your bot.
4. On that same Bot page, scroll down and turn on **Message Content Intent** and **Server Members Intent**. The bot won't work properly without these.
5. Go to **OAuth2 > URL Generator**. Under scopes, check **bot**. Under bot permissions, pick whatever your use case needs (at minimum: Kick Members, Ban Members, Moderate Members, Manage Messages, Connect, Speak, Send Messages, Read Message History).
6. Copy the generated URL at the bottom, paste it into your browser, and invite the bot to your server.

## Adding your token to the project

The bot reads its token from a `.env` file, which keeps it out of the actual code so you never accidentally share it.

1. In the project folder, find the file called `.env.example` and make a copy of it named `.env`.
2. Open `.env` in any text editor and paste your token in, like this:

```
DISCORD_TOKEN=your-bot-token-here
```

3. Save the file. Never share this file or commit it to GitHub, it's the same as giving someone full access to your bot. The included `.gitignore` already makes sure `.env` doesn't get uploaded if you push this project to a repository.

## Running the bot

Once everything above is done, start the bot from the project folder with:

```
npm start
```

If it logs in successfully you'll see it come online in your Discord server, and you can start using the commands listed above.

## Notes

- Music playback uses `yt-dlp` under the hood, wrapped by `yt-dlp-exec`. Audio is streamed directly without saving files to disk.
- `$archive` downloads are served from a small local HTTP server bound to `127.0.0.1`, so the download link only works from the same machine the bot is running on.
- Only one instance of the bot should run at a time, running it twice (for example two terminals open) will cause every command to fire and reply more than once.

## Tech stack

- [discord.js](https://discord.js.org/) v14
- [@discordjs/voice](https://github.com/discordjs/discord.js/tree/main/packages/voice) for audio playback
- [yt-dlp-exec](https://www.npmjs.com/package/yt-dlp-exec) for YouTube extraction
- Plain Node.js `http` for the local archive download server
