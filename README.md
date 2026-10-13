# SABSA Academic Hub — Students' Wall

React + Vite frontend for the SAB Students' Association community wall. It uses the existing `wall_posts`, `wall_likes`, `committee_members`, and `review_wall_post` Supabase schema. No `profiles` table is used.

## Supabase setup

1. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` plus the project's **publishable** key. Never use a secret or service-role key in a `VITE_` variable.
2. In Supabase Auth, enable anonymous sign-ins. Students can post and react without registering; anonymous Auth sessions give each browser an Auth-owned UUID for like/unlike, instead of trusting a client-supplied identity.
3. Review `supabase/secure-wall-access.sql` against the live policies, then run it in the Supabase SQL Editor. It binds reactions to `auth.uid()`, prevents duplicate reactions, and allows files to be read only when the exact attachment belongs to its post and is approved or a committee member is viewing it.
4. Check the `wall-uploads` bucket settings. It is private with a 5 MB limit. The live bucket currently lists `file/pdf`; change its allowed MIME type to `application/pdf` if PDF uploads are intended.
5. Confirm the project exposes the `public` schema to the Data API and that existing RLS grants permit the app's approved-post reads, pending-post inserts, committee reads, and review RPC calls.

The frontend uploads attachments under `<post UUID>/<random UUID>-<filename>` and stores that exact path on the pending post. It removes the uploaded object if inserting the post fails. Public feed files are served with short-lived signed URLs only after the post is approved; pending media is requested only in the committee dashboard. Do not make the bucket public.

## Run locally

```sh
pnpm install
pnpm dev
```

## Deploy later to Cloudflare Pages

- Build command: `pnpm build`
- Build output directory: `dist`
- Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as Pages build environment variables.
- Set the production domain in Supabase Auth's allowed redirect/site URL configuration if committee login requires it.

## Current schema expectations

- `wall_posts`: `id`, `name`, `batch`, `content`, `attachment_path`, `status`, `created_at`, `published_at`.
- `wall_likes`: `post_id`, `visitor_id`.
- `public.is_committee_member()` returns a boolean.
- `public.review_wall_post(p_post_id uuid, p_decision text, p_feedback text)` accepts `approved`, `rejected`, or `revision_requested`.

The committee screen uses Supabase email/password Auth, then checks committee membership with the database function. It does not grant access based on a client-side role flag.
