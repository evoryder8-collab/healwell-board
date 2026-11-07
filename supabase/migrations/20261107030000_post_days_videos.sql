-- Day totals also count videos, so the totals panel can split photos from videos.
-- A video is a reel or any post with a playable file; everything else is a photo post.
create or replace view public.post_days with (security_invoker = true) as
  select (scheduled_at at time zone 'Europe/Zurich')::date as day,
         count(*)::int as posts,
         count(*) filter (where not published)::int as scheduled,
         count(*) filter (where type = 'reel' or video_url is not null)::int as videos
  from public.posts
  group by 1;
