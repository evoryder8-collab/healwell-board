-- Where each post went and how to play it. Both fields belong to the agent;
-- the board only reads them.
--
-- channels:  [{ "network": "instagram", "status": "published", "url": "https://www.instagram.com/reel/…" }, …]
--            network: instagram, facebook, threads, linkedin, gmb, tiktok, youtube, pinterest, twitter, bluesky
--            status:  published, scheduled, draft or error
-- video_url: a directly playable video file for reels and video posts (optional)

alter table public.posts
  add column channels jsonb not null default '[]'::jsonb check (jsonb_typeof(channels) = 'array'),
  add column video_url text;
