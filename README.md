# Rowing Club Hazard Chart — PWA

A mobile web app that shows your club's Google My Maps hazards/landmarks, syncs
live, and can be added to the home screen on iOS and Android like a native app.

## 1. Personalize it

- **Club name**: edit `<p class="club-name">Rowing Club</p>` in `index.html`.
- **Colors/type**: all in `style.css` under `:root` at the top.
- **Map ID**: already set to your map (`mid=1gDs8klI6_od136Da73EF5AhGZRY3sfk`) in
  `app.js`. If you ever create a new My Maps map, replace the `MID` constant there.

## 2. Host it

Any static file host works. Easiest options:

**GitHub Pages** (free, no account needed beyond GitHub):
1. Create a new repo, upload all these files.
2. Repo Settings → Pages → deploy from the `main` branch, root folder.
3. You'll get a URL like `https://yourclub.github.io/hazard-chart/`.

**Netlify / Vercel**: drag-and-drop the folder in their dashboard — even quicker,
and gives you a custom domain option later.

Once hosted, share the link with members. Opening it in Safari (iOS) or Chrome
(Android) and choosing **"Add to Home Screen"** installs it like an app —
the app itself shows this hint automatically on first visit.

## 3. How live sync works

The app fetches your My Maps data fresh every time it's opened, and again every
5 minutes while it stays open. Any pin you add, move, or edit in Google My Maps
shows up automatically — no rebuild, no resubmission.

Google's export endpoint doesn't allow direct browser requests from other
websites (a CORS restriction), so the app routes the request through a free
public proxy (`allorigins.win`, with `corsproxy.io` as backup). This works well
for a club's traffic level but isn't Google-official, so treat it as "good
enough for now" rather than bulletproof.

**For a more durable setup**, run your own tiny proxy on Cloudflare Workers
(free tier is generous). Steps:

1. Sign up at workers.cloudflare.com, create a new Worker.
2. Paste this code in:

   ```js
   export default {
     async fetch(request) {
       const mid = "1gDs8klI6_od136Da73EF5AhGZRY3sfk";
       const url = `https://www.google.com/maps/d/kml?mid=${mid}&forcekml=1`;
       const res = await fetch(url);
       const body = await res.text();
       return new Response(body, {
         headers: {
           "Content-Type": "application/vnd.google-earth.kml+xml",
           "Access-Control-Allow-Origin": "*",
           "Cache-Control": "public, max-age=120",
         },
       });
     },
   };
   ```

3. Deploy — you'll get a URL like `https://hazard-proxy.yourname.workers.dev`.
4. In `app.js`, replace the `PROXIES` array with just:
   ```js
   const PROXIES = [() => "https://hazard-proxy.yourname.workers.dev"];
   ```

This removes the dependency on third-party proxies entirely and adds caching,
so repeat loads are faster too.

## 4. Offline behavior

The app shell (layout, styling, icons) is cached on first visit and works
offline. The hazard data itself is cached in the browser after every
successful sync, so if someone opens the app with no signal on the water,
they'll see the most recent hazards with a "Sync failed · showing cached
data" note rather than a blank screen.

## 5. Editing hazards

Keep editing pins directly in Google My Maps as you do now — name, description,
and folder (used as the category/filter chip) all carry over. Points are shown;
lines and shaded areas are currently skipped, since the chart is pin-focused.
If you'd like route lines supported too, that's a small addition — just ask.
