# TODO

## Railway Deployment Steps

### 1. Prepare the Project
- [ ] Add a start script to package.json that runs the built CLI
- [ ] Create a Procfile or railway.json (optional, Railway auto-detects)
- [ ] Ensure .env.local variables are documented for Railway setup

### 2. Railway Account Setup
- [ ] Sign up at https://railway.app
- [ ] Connect your GitHub account
- [ ] Install Railway CLI (optional): `npm i -g @railway/cli`

### 3. Create Railway Project
- [ ] Click "New Project" in Railway dashboard
- [ ] Select "Deploy from GitHub repo"
- [ ] Choose your `betteraiengine` repository
- [ ] Railway will auto-detect Node.js and start building

### 4. Add Postgres Database
- [ ] In your Railway project, click "New" → "Database" → "Add PostgreSQL"
- [ ] Railway automatically sets `DATABASE_URL` environment variable
- [ ] Your app can access it immediately (no manual config needed)

### 5. Configure Environment Variables
- [ ] Go to project settings → "Variables"
- [ ] Add the following variables:
  - `OPENROUTER_API_KEY` - Your OpenRouter API key
  - `SITE_URL` - Your site URL (optional)
  - `SITE_NAME` - Your site name (optional)
  - `NODE_ENV` - Set to `production`
- [ ] Railway already provides `DATABASE_URL` from the Postgres service

### 6. Run Database Migrations
- [ ] Option A: Use Railway CLI locally:
  ```bash
  railway login
  railway link
  railway run pnpm db:migrate
  ```
- [ ] Option B: Add a build command in Railway settings:
  - Build Command: `pnpm install && pnpm build && pnpm db:migrate`
  - Start Command: `node dist/cli.js`

### 7. Set Up Cron Jobs (for scheduled predictions)
- [ ] In Railway project, click "New" → "Cron Job"
- [ ] Configure schedule (e.g., `0 */6 * * *` for every 6 hours)
- [ ] Set command to run (e.g., `node dist/cli.js predict:market --slug <market-slug>`)
- [ ] Or use GitHub Actions to trigger Railway deployments on schedule

### 8. Deploy & Monitor
- [ ] Push to GitHub main branch to trigger auto-deployment
- [ ] Monitor logs in Railway dashboard
- [ ] Test your CLI commands:
  ```bash
  railway run pnpm dev run:exp -s market-slug
  ```

### 9. Optional: Custom Domain
- [ ] Go to project settings → "Domains"
- [ ] Add your custom domain
- [ ] Update DNS records as instructed

### 10. Optional: Set Up Railway CLI for Local Development
- [ ] Install: `npm i -g @railway/cli`
- [ ] Link project: `railway link`
- [ ] Run commands with Railway env: `railway run pnpm dev`
- [ ] Pull env vars locally: `railway variables`

## Notes
- Railway auto-deploys on every git push to main
- Logs are available in the Railway dashboard
- Database backups are automatic with Railway Postgres
- Free tier includes $5/month credit (usually enough for small projects)
