# gybe-discord-bot

Discord bot for querying setlists for Godspeed You! Black Emperor and related bands, powered by [gyberecordinghelper.com](https://gyberecordinghelper.com).

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
Look up a show by date (`YYYY-MM-DD`). Optionally select a band (autocomplete).

### `/random`
Get a random show. Optionally restrict to shows with recordings, and select a band (autocomplete).

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

The band list is fetched from `https://gyberecordinghelper.com/bands.json` and cached in memory for 6 hours. Setlist data for each band is fetched on demand and cached separately. New bands added to the data source appear automatically in autocomplete with no code changes or redeployment needed.
