-- Review this against the live policies before running in Supabase SQL Editor.
-- Anonymous Auth must be enabled. The app uses an anonymous Auth user for likes;
-- visitors do not need to register or create a student account.

drop policy if exists "Add likes to approved posts" on public.wall_likes;
drop policy if exists "Remove own browser reaction" on public.wall_likes;

create unique index if not exists wall_likes_post_visitor_unique
  on public.wall_likes (post_id, visitor_id);

create policy "Authenticated visitors can like approved posts"
  on public.wall_likes
  for insert
  to authenticated
  with check (
    visitor_id = (select auth.uid())
    and exists (
      select 1 from public.wall_posts p
      where p.id = wall_likes.post_id and p.status = 'approved'
    )
  );

create policy "Visitors can remove their own reaction"
  on public.wall_likes
  for delete
  to authenticated
  using (visitor_id = (select auth.uid()));

create policy "Approved attachments and committee review files"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'wall-uploads'
    and exists (
      select 1
      from public.wall_posts p
      where p.attachment_path = storage.objects.name
        and split_part(storage.objects.name, '/', 1) = p.id::text
        and (
          p.status = 'approved'
          or (select public.is_committee_member())
        )
    )
  );
