-- ==========================================================================
-- iContact Academy: course trailers
--   courses.trailer_url   a short promo video shown at the top of the course page
--                         (an MP4 link, or YouTube / Vimeo / Google Drive / Loom).
-- For an MP4 the page also looks for two optional files next to it:
--   <name>-poster.jpg     the still shown before play
--   <name>-vertical.mp4   a 9:16 version used on phones
-- The public course_catalog() function now returns trailer_url.
-- Safe to re-run.  Also included in supabase/schema.sql.
-- ==========================================================================

alter table public.courses add column if not exists trailer_url text check (length(trailer_url) <= 500);

-- The return type changes, so the function is dropped and created again.
drop function if exists public.course_catalog();
create function public.course_catalog()
returns table (id uuid, slug text, title text, subtitle text, category text, level text, price numeric, currency text,
               duration_text text, description text, outcomes text[], who_for text, cover_url text, trailer_url text,
               lesson_count bigint, total_minutes bigint, preview_count bigint)
language sql stable security definer set search_path = public as $$
  select c.id, c.slug, c.title, c.subtitle, c.category, c.level, c.price, c.currency, c.duration_text, c.description,
         c.outcomes, c.who_for, c.cover_url, c.trailer_url,
         count(l.id), coalesce(sum(l.duration_min), 0), count(l.id) filter (where l.is_preview)
  from public.courses c left join public.lessons l on l.course_id = c.id
  where c.status = 'published'
  group by c.id
  order by c.sort_order, c.title;
$$;
revoke all on function public.course_catalog() from public;
grant execute on function public.course_catalog() to anon, authenticated;
