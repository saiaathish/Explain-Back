# For judges — see everything in 90 seconds

1. Open https://explain-back.vercel.app/
2. Click **Try it** — no account form is required; a browser-local anonymous
   session verifies API requests
3. Click the **Biology** preset
4. Click **Check my explanation**
   → Watch the highlights appear: green means understood, yellow means stated
     but never explained why, red means it contradicts the source, grey means
     the system isn't confident enough to say.
5. Hover (or tap on mobile) the **red highlight**
   → See the exact sentence from the source it's checking against, the named
     misconception, and a suggestion for how to fix it.
6. Click **Revise**, then paste in the corrected explanation from
   `samples/demo_video_revised.txt`
   → Watch the yellow and red highlights turn green and the gap-closed count
     go up. This is the loop: explain, get diagnosed, fix it, see it improve.

That's the whole idea in one sentence: every AI study tool explains things
TO the student. This one makes the student explain, and shows them exactly
where their explanation is supported, incomplete, or contradicted by the source.

Other things worth knowing about, not required to try:
- **Past sessions** — the source and every attempt from that loop are saved to
  the anonymous session, readable only by it, and still there after a reload
- **Review gaps** — every claim that did not hold up becomes a card in a deck you
  work down to zero. "Got it now" removes a card, "Still shaky" sends it to the
  back to come around again. No new model call happens here; it is your own
  recorded data played back, and the round is never saved, so the count always
  reflects what you can explain right now
- Confidence marking + the "danger zone" map (mark what you feel sure about,
  then see where confidence and understanding disagree)
- Voice input (speak your explanation instead of typing it)
- Photograph a textbook page as the source material
- Works outside biology too — try the Economics or Photosynthesis presets

## Hosted authentication requirement

The walkthrough's one-click entry depends on a real Supabase project; the
repository does not include one or its credentials. Before treating a hosted
build as judge-ready:

- Enable **Allow anonymous sign-ins**, the **Google** provider, and **Manual
  Linking** in Supabase Auth. Supabase currently marks manual identity linking
  as beta.
- Set the production site URL to `https://explain-back.vercel.app/`.
- Allow exactly `http://localhost:5173/` and
  `https://explain-back.vercel.app/`, plus the project-and-team-scoped preview
  wildcard
  `https://explain-back-*-sai-aathish-karthiks-projects.vercel.app/`.
  Do not substitute a broad `*.vercel.app` wildcard.
- Set the Google OAuth client's authorized redirect URI to
  `${SUPABASE_URL}/auth/v1/callback`.
- Supply `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the
  frontend deployment and the matching `SUPABASE_URL` to the backend.

The code preserves an anonymous user's Supabase identity when they link Google,
but that hosted flow must still be verified against the configured project
before claiming it works in production.
