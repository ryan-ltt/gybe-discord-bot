# gybe-discord-bot

Discord bot for querying Godspeed You! Black Emperor setlists, powered by [gyberecordinghelper.com](https://gyberecordinghelper.com).

## Commands

### `/find`
Find shows containing selected songs. Supports all song finder modes from the web app.

| Option | Description | Default |
|--------|-------------|---------|
| `song1`–`song5` | Songs to search for (autocomplete) | — |
| `mode` | `any` (≥1 match, ranked) or `all` (every song must appear) | `any` |
| `order` | `unordered`, `ordered` (subsequence), or `back-to-back` (consecutive) | `unordered` |
| `recordings_only` | Only show shows with archive.org recordings | false |

### `/songs`
Browse all canonical song names with optional substring search.

### `/setlist`
Look up a show by date (`YYYY-MM-DD`).

### `/random`
Get a random show. Optionally restrict to shows with recordings.

## Setup

1. Copy `.env.example` to `.env` and fill in your values:
   ```
   DISCORD_TOKEN=your_bot_token
   CLIENT_ID=your_application_id
   GUILD_ID=your_server_id  # optional, for faster dev deploys
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Register slash commands:
   ```
   npm run deploy
   ```

4. Start the bot:
   ```
   npm start
   ```

## Data

Setlist data is fetched from `https://gyberecordinghelper.com/setlists.json` and cached in memory for 6 hours.
