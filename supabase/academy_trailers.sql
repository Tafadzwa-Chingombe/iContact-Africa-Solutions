-- ==========================================================================
-- iContact Academy: switch on the course trailers
-- Paste the whole file into Supabase -> SQL Editor -> Run.  Safe to run again.
--
-- 1. Adds courses.trailer_url and returns it from course_catalog()
--    (the same as migrations/20261114_course_trailers.sql).
-- 2. Points each course at its trailer in assets/video/academy/ on the website.
--    A trailer only shows once its MP4 is on the live site, so un-comment a
--    course's line when its video has been added.
-- You can change or clear a trailer later in Admin Console -> Academy -> the course.
-- ==========================================================================

-- 1. Column + public catalogue -------------------------------------------------
alter table public.courses add column if not exists trailer_url text check (length(trailer_url) <= 500);

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

-- 2. Trailer links -----------------------------------------------------------------
update public.courses set trailer_url = v.url
from (values
  ('website-basics-for-business',     'https://tafadzwa-chingombe.github.io/iContact-Africa-Solutions/assets/video/academy/trailer-web-basics.mp4'),
  ('html-css-for-beginners',          'https://tafadzwa-chingombe.github.io/iContact-Africa-Solutions/assets/video/academy/trailer-html-css.mp4')
  -- Waiting for their voiceover. Add a comma to the line above, then un-comment a line once its video is on the site:
  -- ('seo-and-google-business-profile', 'https://tafadzwa-chingombe.github.io/iContact-Africa-Solutions/assets/video/academy/trailer-seo-gbp.mp4')
  -- ('social-media-marketing',          'https://tafadzwa-chingombe.github.io/iContact-Africa-Solutions/assets/video/academy/trailer-social.mp4')
  -- ('facebook-instagram-ads-zimbabwe', 'https://tafadzwa-chingombe.github.io/iContact-Africa-Solutions/assets/video/academy/trailer-meta-ads.mp4')
  -- ('whatsapp-business-for-sales',     'https://tafadzwa-chingombe.github.io/iContact-Africa-Solutions/assets/video/academy/trailer-whatsapp.mp4')
) as v(slug, url)
where public.courses.slug = v.slug;

-- Check: every course and its trailer
select slug, title, trailer_url from public.courses order by sort_order, title;
