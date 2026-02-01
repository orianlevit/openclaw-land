# OpenClaw Land

Multi-tenant SaaS platform for running OpenClaw AI bots on Cloudflare Workers.

## Features

- Create and manage multiple OpenClaw bot instances
- Each bot runs in its own isolated Cloudflare Container
- Web-based chat interface
- Automatic container lifecycle management
- **No Docker required locally** - GitHub Actions builds everything in the cloud

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                        │
├─────────────────────────────────────────────────────────────┤
│  Router Worker                                               │
│  ├── Landing Page (/)                                       │
│  ├── API (/api/bots)                                        │
│  └── Bot Proxy (/bot/:id/*)                                 │
├─────────────────────────────────────────────────────────────┤
│  Durable Objects (per bot)                                   │
│  └── BotInstance DO                                          │
│      └── Manages Container lifecycle                        │
│      └── Proxies WebSocket connections                      │
├─────────────────────────────────────────────────────────────┤
│  Containers (per bot)                                        │
│  └── OpenClaw Gateway                                        │
│      └── AI assistant runtime                               │
├─────────────────────────────────────────────────────────────┤
│  Storage                                                     │
│  ├── D1 Database (bot registry)                             │
│  └── R2 Bucket (bot data persistence)                       │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Cloudflare Workers Paid Plan** ($5/month) - Required for Containers
- **GitHub Account** - For automated deployments
- **Anthropic API Key** - For AI capabilities

## Quick Start (Deployment via GitHub Actions)

### Step 1: Create a GitHub Repository

```bash
# In this directory
git add .
git commit -m "Initial commit"
gh repo create openclaw-land --public --source=. --push
```

Or create a repo manually on GitHub and push:
```bash
git remote add origin https://github.com/YOUR_USERNAME/openclaw-land.git
git branch -M main
git push -u origin main
```

### Step 2: Set Up Cloudflare

1. **Get your Cloudflare Account ID:**
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
   - Click account menu (top right) → Copy Account ID

2. **Create an API Token:**
   - Go to [API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   - Click "Create Token"
   - Use the **"Edit Cloudflare Workers"** template
   - Add these permissions:
     - Account > D1 > Edit
     - Account > Workers R2 Storage > Edit
   - Create and copy the token

3. **Create the D1 Database** (one-time setup):
   ```bash
   npx wrangler d1 create openclaw-db
   ```
   Note: The database ID is already configured in `wrangler.jsonc`

4. **Initialize the Database Schema:**
   ```bash
   npx wrangler d1 execute openclaw-db --remote --file=./schema.sql
   ```

### Step 3: Configure GitHub Secrets

Go to your GitHub repo → Settings → Secrets and variables → Actions → New repository secret

Add these secrets:

| Secret Name | Value |
|-------------|-------|
| `CLOUDFLARE_API_TOKEN` | Your Cloudflare API token from Step 2 |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare Account ID |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |

### Step 4: Deploy

Push to `main` branch to trigger automatic deployment:
```bash
git push origin main
```

Or manually trigger: Go to Actions → "Deploy to Cloudflare" → Run workflow

### Step 5: Access Your App

After deployment completes, your app will be available at:
```
https://openclaw-land.<your-subdomain>.workers.dev
```

## Local Development

For local development (without containers):

```bash
# Install dependencies
npm install

# Initialize local D1 database
npm run db:init

# Start dev server
npm run dev
```

Note: Local dev mode disables containers. The landing page and API work, but bot chat requires deployment.

## Project Structure

```
openclaw-land/
├── .github/workflows/
│   └── deploy.yml         # GitHub Actions deployment
├── src/
│   ├── index.ts           # Main router with API endpoints
│   ├── bot-instance.ts    # Durable Object for container management
│   ├── bot-registry.ts    # D1 database operations
│   └── types.ts           # TypeScript types
├── public/
│   ├── index.html         # Landing page (bot list + create)
│   └── chat.html          # Chat interface with WebSocket
├── Dockerfile             # OpenClaw container image
├── start-openclaw.sh      # Container startup script
├── schema.sql             # D1 database schema
├── wrangler.jsonc         # Cloudflare configuration
└── package.json
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/bots` | List all bots |
| POST | `/api/bots` | Create a new bot |
| GET | `/api/bots/:id` | Get bot details |
| DELETE | `/api/bots/:id` | Delete a bot |

## Routes

| Route | Description |
|-------|-------------|
| `/` | Landing page with bot list |
| `/bot/:id` | Bot chat interface |
| `/bot/:id/ws` | WebSocket endpoint for chat |

## Configuration

### Environment Variables / Secrets

| Secret | Required | Description |
|--------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for AI capabilities |
| `CLOUDFLARE_API_TOKEN` | Yes (CI) | For GitHub Actions deployment |
| `CLOUDFLARE_ACCOUNT_ID` | Yes (CI) | For GitHub Actions deployment |

### Container Settings

Edit `wrangler.jsonc` to adjust:
- `instance_type`: Container size (default: `standard-4`)
- `max_instances`: Maximum concurrent containers (default: 10)

## Cost Considerations

- **Workers Paid Plan**: $5/month base
- **Containers**: Billed per CPU-second of usage
- **D1**: Free tier includes 5M reads/day, 100K writes/day
- **R2**: Free tier includes 10GB storage, 1M reads/month

## Troubleshooting

### Deployment fails with Docker error
- This only happens for local deploys. Use GitHub Actions instead (push to main).

### Container not starting
- Check Cloudflare dashboard for container logs
- Verify `ANTHROPIC_API_KEY` is set in GitHub Secrets

### Database errors
- Run `npx wrangler d1 execute openclaw-db --remote --file=./schema.sql`

### First request is slow
- Containers have ~1-2 minute cold start time. Subsequent requests are faster.

## License

MIT
