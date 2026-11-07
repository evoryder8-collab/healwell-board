# AGENT.md

How an agent adds and updates posts on the Healwell posts board. The board only reads rows; whatever you write here appears on the canvas within a second.

## Connection

- Base URL: `https://<project-ref>.supabase.co/rest/v1`
- Headers on every request: `apikey: <secret key>` and `Authorization: Bearer <secret key>` (the service role or `sb_secret_…` key; it bypasses row level security). Never put this key in the frontend or in git.

## Schema

**posts**

| column | type | notes |
| --- | --- | --- |
| `id` | uuid | generated |
| `external_id` | text, unique | your stable id for the post; use it for upserts |
| `platform` | text | `instagram` |
| `type` | text | `reel`, `carousel`, `image` or `story` |
| `scheduled_at` | timestamptz | publish time, ISO 8601 with offset; the board shows Zurich time |
| `published` | boolean | `false` while scheduled, `true` once live |
| `media_url` | text | public URL of the thumbnail in Storage (see below) |
| `video_url` | text | optional: a directly playable video file (MP4) for reels; the play button plays it in the card, otherwise it opens the Instagram post |
| `channels` | jsonb | where the post went: `[{"network": "instagram", "status": "published", "url": "https://www.instagram.com/reel/…"}]`. Networks: `instagram`, `facebook`, `threads`, `linkedin`, `gmb`, `tiktok`, `youtube`, `pinterest`, `twitter`, `bluesky`. Status: `published`, `scheduled`, `draft`, `error`. Cards show one logo per network |
| `caption` | text | max 2,200 characters |
| `collaborators` | text[] | Instagram handles; normalized to `@lowercase` automatically |
| `updated_at` | timestamptz | set automatically |

**collaborators**: `handle` (unique, e.g. `@1iconstantine`), `name`, `updated_at`. Handles are added automatically when they appear on a post.

**comments**: `id`, `post_id` → posts.id, `author`, `body`, `created_at`. Written by people on the board; read them if you need them.

## Thumbnails

The board only shows small WebP thumbnails from the public `thumbs` bucket. For each post upload two files with a random, unguessable name (a UUID):

- `<uuid>.webp`: 640 × 800 px (4:5), quality ~72, under 1 MB
- `<uuid>.sm.webp`: 160 × 200 px, used when zoomed out (optional; the board falls back to the large file)

For reels use the first frame. Set `media_url` to the public URL of the large file:

```bash
curl -X POST "https://<ref>.supabase.co/storage/v1/object/thumbs/3f2b…e1.webp" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: image/webp" --data-binary @thumb.webp
# media_url = https://<ref>.supabase.co/storage/v1/object/public/thumbs/3f2b…e1.webp
```

## Insert a post

```bash
curl -X POST "https://<ref>.supabase.co/rest/v1/posts" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{
    "external_id": "ig_17951234567890123",
    "platform": "instagram",
    "type": "reel",
    "scheduled_at": "2026-11-12T18:30:00+01:00",
    "published": false,
    "media_url": "https://<ref>.supabase.co/storage/v1/object/public/thumbs/3f2b…e1.webp",
    "caption": "Let the exhale be longer than the inhale.",
    "collaborators": ["@chutima.nuad"],
    "channels": [
      { "network": "instagram", "status": "scheduled" },
      { "network": "facebook", "status": "scheduled" },
      { "network": "gmb", "status": "scheduled" }
    ],
    "video_url": "https://…/reel.mp4"
  }'
```

## Update a post

Send only the fields you own: `scheduled_at`, `published`, `media_url`, `video_url`, `channels`, `type`, `platform`.

```bash
curl -X PATCH "https://<ref>.supabase.co/rest/v1/posts?external_id=eq.ig_17951234567890123" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "published": true,
    "scheduled_at": "2026-11-12T18:32:05+01:00",
    "channels": [
      { "network": "instagram", "status": "published", "url": "https://www.instagram.com/reel/DQx…/" },
      { "network": "facebook", "status": "published", "url": "https://www.facebook.com/…" },
      { "network": "gmb", "status": "error" }
    ]
  }'
```

## The one rule

After the first insert, `caption`, `collaborators` and collaborator `name`s belong to the board. Later updates must not touch them; read them back from `posts` and `collaborators` when you need them. The database enforces this as a safety net: updates made with the secret key leave those fields unchanged.
