# Ad Comments Inbox

A moderation inbox for comments on your Meta (Facebook) ad posts — review queue,
reply, hide, delete, and ban, in an Agorapulse-style 3-pane layout.

## Run

```bash
npm install
npm run dev
```

- Web UI: http://localhost:5173
- API: http://localhost:5177

## Configuration

`.env` (not committed):

```
META_USER_TOKEN=<user access token with pages_show_list, ads_read,
                 pages_read_engagement, pages_manage_metadata,
                 pages_read_user_content, pages_manage_engagement>
PORT=5177
```

## How it works

- The server walks all ad accounts the token can see, collects each ad's
  `effective_object_story_id`, and groups those posts by owning page —
  including business-owned pages that don't appear in `/me/accounts`.
- Comments are fetched per page with that page's own token, so moderation
  actions (reply / hide / delete / ban) run as the page.
- The "reviewed" state and ban bookkeeping live locally in
  `server/data/moderation.json` — reviewing a comment removes it from the
  queue without touching Facebook.
- Replying to a comment automatically marks it reviewed.

## Known Meta API limitations

- Meta usually does not return the commenter's identity (`from`) on ad post
  comments, so most comments show as "Facebook user" and **Ban** is only
  enabled when Meta shares the commenter's ID.
- The ad index caches for 10 minutes; use the sidebar re-sync button to force
  a refresh after launching new ads.
