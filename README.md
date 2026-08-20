# Ad Comments Inbox (comment-pulse)

A moderation inbox for comments on your Meta (Facebook) ad posts — review queue,
reply, hide, delete, ban, and keyword auto-hide, in an Agorapulse-style layout.

**Production:** https://comment-pulse.netlify.app (password-protected)

## Local development

```bash
npm install
npm run dev
```

- Web UI: http://localhost:5173
- API: http://localhost:5177

`.env` (not committed):

```
META_USER_TOKEN=<user access token with pages_show_list, ads_read,
                 pages_read_engagement, pages_manage_metadata,
                 pages_read_user_content, pages_manage_engagement>
PORT=5177
# APP_PASSWORD=...   optional locally; when unset, no login is required
```

## Deployment (Netlify)

- Site: `comment-pulse` (https://app.netlify.com/projects/comment-pulse)
- `netlify/functions/api.mts` serves `/api/*`
- `netlify/functions/sweep-scheduled.mts` runs every 15 minutes and dispatches
  `sweep-background.mts` (15-minute budget), which rebuilds the ad index,
  refreshes comments for every page, auto-hides keyword matches, and stores
  queue counts — so moderation happens even with no browser open
- State (reviewed marks, bans, auto-hide log, keyword settings) lives in
  Netlify Blobs; locally, the same data lives in `server/data/kv/`
- Env vars on Netlify: `META_USER_TOKEN`, `APP_PASSWORD`
- Deploy: push to `main` if the repo is linked in the Netlify UI, or run a
  manual deploy from this directory

## How it works

- The server walks all ad accounts the token can see, collects each ad's
  `effective_object_story_id`, and groups those posts by owning page —
  including business-owned pages that don't appear in `/me/accounts`.
- Comments are fetched per page with that page's own token, so moderation
  actions (reply / hide / delete / ban) run as the page.
- Reviewing a comment removes it from the queue without touching Facebook;
  replying auto-marks the comment reviewed.
- Auto-hide: comments matching the keyword list (Settings, gear icon) are
  hidden on Facebook automatically and land in the Auto-hidden tab. A comment
  is only ever auto-hidden once, so manually unhiding it sticks.
- Login: single password (`APP_PASSWORD`), 180-day signed cookie.

## Known Meta API limitations

- Meta usually does not return the commenter's identity (`from`) on ad post
  comments, so most comments show as "Facebook user" and **Ban** is only
  enabled when Meta shares the commenter's ID. Fixing this requires App
  Review approval for the Business Asset User Profile Access feature.
