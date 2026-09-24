# Peppers Robotics · FTC Team 19044

The source for the Peppers Robotics team website. This is a mostly static, single-page site: the page itself lives in `public/index.html`, its styles in `public/styles.css`, and its interactions in `public/script.js`. An optional team Q&A widget calls a Vercel function at `/api/chat`.

> **Start here:** Site content is written directly in HTML and JavaScript. There is no admin dashboard or content database. Commit changes to the repository, review the preview, and merge when ready.

## THE COMING SOON PUG MUST NEVER BE REMOVED 🐶

**DO NOT REMOVE THE COMING SOON PUG CARD UNDER ANY CIRCUMSTANCES. PRESERVE IT AT ALL COSTS.** It is the site's *pièce de résistance*. New seasons, new robots, and new designs may come and go; the Pug remains. Never delete the card, replace its image, rename its `coming-soon` ID, hide it, or remove its popup media entry. Add new season cards *alongside* it. These rules take priority over every general instruction in this README to update seasons or replace placeholder images.

## What visitors see

| Section | What it contains | Main edit point |
| --- | --- | --- |
| Intro | Full-screen video that fades as the page scrolls | `public/index.html` → `#introVideoEl` |
| Hero | Team introduction, contact links, interactive 3D robot | `public/index.html` → `.hero` and `#roboCard` |
| Team | Mission statement, team photo, headline figures | `public/index.html` → `#about` |
| Seasons | Horizontally scrollable robot cards; clicking one opens a media popup | `public/index.html` → `#seasons`; `public/script.js` → `SEASON_MEDIA` |
| Sponsors | Continuously moving list of sponsor names | `public/index.html` → `#sponsors .marquee` |
| Events | Dates, locations, and action links | `public/index.html` → `#events .events-list` |
| Gallery | Five photos with hover captions | `public/index.html` → `#gallery .gallery-grid` |
| Contact and footer | Sponsor contact, site navigation, social links | `public/index.html` → `#contact` and `<footer>` |
| Team Q&A | Floating chat widget backed by the Gemini API | `public/chat-widget.js`, `public/chat-widget.css`, `api/chat.js` |

There is also a light/dark theme toggle, a loading screen, scroll effects, and a robot-detail popup. Their behavior lives in `public/script.js`. The site currently contains prototype text and placeholder images; see [Before publishing](#before-publishing).

## Repository map

```text
api/chat.js                   Team Q&A facts and Vercel chat endpoint
lib/chat-security.mjs        Chat input limits and shared usage quota
public/index.html            All visible page sections and their content
public/styles.css            Layout, colors, effects, breakpoints
public/script.js             Scroll behavior, 3D models, robot popups, theme
public/chat-widget.js        Chat UI and browser request handling
public/chat-widget.css       Chat appearance
public/photos/               Logo, favicon, hero image, general photos
public/2026-2027/            Season photos, GIFs, and intro video
public/models/               Robot .glb files
vercel.json                   Vercel configuration and security headers
SECURITY.md                  Chat setup, limits, deployment checks
tests/security.test.mjs      Chat security regression checks
```

**Paths to images and models:** `public/` is the website root. A file at `public/photos/19044.ico` is referenced as `photos/19044.ico` in HTML, or visited at `/photos/19044.ico`. Do **not** put `public/` in browser URLs. Keep filename spelling and capitalization identical; `V1.jpeg` and `v1.jpeg` are different paths on many hosts.

## Update a robot card

Find `<section id="seasons">` in `public/index.html`. Every card is a `<div class="season-card" data-season-id="...">` inside `#seasonsTrack`. The image or 3D viewer is in `.season-media`, the visible date is `.season-year`, and the badge, title, and description are in `.season-body`.

To add a card using a photo, place the image under `public/2026-2027/`, then add this inside `#seasonsTrack`:

```html
<div class="season-card" data-season-id="new-robot">
  <div class="season-media">
    <img src="2026-2027/new-robot.jpg" alt="Peppers competition robot on the field">
    <div class="season-year">2026–27</div>
  </div>
  <div class="season-body">
    <span class="tag">Current Season</span>
    <h3>Robot name</h3>
    <p>A short, accurate description of this robot.</p>
  </div>
</div>
```

Then add an entry with the **same ID** to `SEASON_MEDIA` in `public/script.js`, so clicking the card opens the right photos:

```js
'new-robot': [
  { type: 'image', src: '2026-2027/new-robot.jpg', alt: 'Robot on the field' },
  { type: 'image', src: '2026-2027/build-night.jpg', alt: 'Team assembling the robot' },
  { type: 'video', src: '2026-2027/match.webm', poster: '2026-2027/match-poster.jpg' },
],
```

The IDs must match exactly: `data-season-id="new-robot"` ↔ `'new-robot'`. If the JS list is missing or empty, the popup says there is no media yet. The popup copies the card title, description, and image or canvas automatically; its markup is in `#roboModal`, but normal content updates do not require editing that markup. Popup media can include still images, GIFs, or videos. Give each image a meaningful `alt` text. Adding one image to the popup does **not** add it to the homepage gallery.

For a 3D card, put a `.glb` under `public/models/` and replace the photo with:

```html
<div class="season-media season-cube-frame">
  <canvas class="robo-canvas" data-robo-cube data-model="models/new-robot.glb"></canvas>
  <div class="season-year">2026–27</div>
</div>
```

Use the same `data-model` on the hero canvas in `#roboCard` **only if** the hero should show the new robot too. The hero card has its own name, label, stats, and description, which need separate edits. A canvas without `data-model` displays the colored placeholder cube. If a model fails to load, the page keeps the cube and logs a warning in the browser console. The site loads models as they approach the viewport and reuses downloads of the same file.

**Existing IDs:** `kickathon`, `2025-26`, `2024-25`, `2023-24`, `2022-23`, and `coming-soon`. Keep each ID unique. If a season changes, update its card, its `SEASON_MEDIA` list, any matching hero text/model, and the chat facts in `api/chat.js` together. Verify awards and robot specifications before publishing them. **The `coming-soon` Pug is exempt from season turnover: keep the card and image in `public/index.html` and its `SEASON_MEDIA['coming-soon']` entry in `public/script.js`, always.**

## Update upcoming events

Find `#events .events-list` in `public/index.html`. Copy one complete `.event-item` and edit its date, title, place/time, and action link:

```html
<div class="event-item">
  <div class="event-date">FEB 20<span>2027</span></div>
  <div class="event-details">
    <h3>Event name</h3>
    <p>Venue · 10:00–16:00 EET</p>
  </div>
  <div class="event-action">
    <a href="https://example.org/event-page" class="btn ghost"><span>Details</span></a>
  </div>
</div>
```

The sample URL above must be replaced with a real destination. If an event has no details/registration page, remove its `.event-action` block rather than leaving `href="#"`. Confirm dates, venue, timezone, registration conditions, and links with the event organizer. Remove or move past events out of the **Upcoming Events** list; these cards are not generated from a calendar. Use a real URL for a livestream only when it exists.

## Update sponsors

The visible sponsor strip is plain text in `public/index.html`, inside `#sponsors .marquee`. **The list is written twice** to make the continuous scroll loop. Change both sequences in the same order:

```html
<div class="marquee">
  <span>FIRST SPONSOR</span><span>SECOND SPONSOR</span>
  <span>FIRST SPONSOR</span><span>SECOND SPONSOR</span>
</div>
```

Use only sponsors who have approved their public name/logo. The current text says the names are placeholders; change that description when real sponsors go live. To show actual logos, change the marquee HTML and review `.marquee`, `.marquee span`, and related rules in `public/styles.css`; the current component is styled for text labels, not image logos. Check the loop at desktop and mobile widths after changing the number or length of names.

**Separate chat data:** The sponsor list in `api/chat.js` → `TEAM_INFO.sponsors` is independent of the visible marquee. If the Q&A bot should name a sponsor, update it too:

```js
sponsors: [
  { name: 'FIRST SPONSOR', note: 'Provides workshop materials' },
],
```

## Update photos and videos

### Homepage gallery

The gallery near the bottom of the page is `#gallery .gallery-grid` in `public/index.html`. Replace the `src`, `alt`, and hover caption of a `.gallery-item`. Put local photos under `public/photos/` and reference them without `public/`:

```html
<div class="gallery-item g3">
  <img src="photos/wiring-workshop.jpg" alt="Team members wiring a robot at the workshop" loading="lazy">
  <div class="gallery-overlay"><span>Workshop, February 2027</span></div>
</div>
```

The existing `g1`–`g5` classes set the desktop grid shapes in `public/styles.css`; preserve one class per existing item when swapping photos. To add a **sixth** image, add another `.gallery-item` and a corresponding `.g6` layout rule, then check the mobile rule at the end of `public/styles.css` as well. Image filenames alone never populate this gallery. The current five photos are remote `picsum.photos` placeholders; replace their URLs, captions, and placeholder section description with actual team material.

### Robot popup gallery

Edit `SEASON_MEDIA` in `public/script.js`, as described under [Update a robot card](#update-a-robot-card). Its images are independent of `.gallery-grid`. Long lists scroll inside the popup; the script duplicates tiles for a continuous loop when content overflows. Video items use `type: 'video'`, may include `poster`, and show native controls.

The Pug's popup media uses `https://picsum.photos/id/1025/700/440`. This particular remote image is intentional. The instruction to replace placeholder photos elsewhere on the site **does not apply to the Pug**.

### Intro, hero, team photo, and favicon

| Asset | Where to update the reference |
| --- | --- |
| Intro video `2026-2027/movie.webm` | `<source>` inside `#introVideoEl` in `public/index.html` |
| Hero GIF `photos/heat-gif.gif` | `.heat-gif` `<img>` in the hero heading |
| Team photo | `#about .mission-media img` |
| Favicon `photos/19044.ico` | `<link rel="icon">` in `<head>` |

Images, GIFs, videos, and 3D models are committed to this repository. Large assets matter: several current GIFs and models are tens of megabytes, and the intro video is around 48 MB. Compress or export new assets appropriately, check the site on a slower phone connection, and keep filenames descriptive. Use team-owned or licensed media, and get permission before publishing identifiable student photos.

## Update text, navigation, and appearance

- **Team facts and mission:** Edit `#about` and the hero in `public/index.html`. The team number, season count, member count, and robot stats are currently written directly into the HTML.
- **Contact:** Change both the `mailto:` link in `#contact` and the email text **and** `mailto:` destination in the footer. Replace the `.example` address with the team's real public address.
- **Social links:** Replace each footer `href="#"` with the real social URL. Remove links for channels that do not exist yet.
- **Navigation:** Header links point to HTML section IDs such as `#seasons`. Keep the `href` and target `id` in sync if a section is renamed. Footer links are edited separately.
- **Colors, spacing, layout:** Change CSS variables near the top of `public/styles.css` for site colors. Look for the relevant class in that file for component styling. Mobile rules appear near the bottom, including the breakpoint at 980 px.
- **Theme:** The theme button is `#themeToggle` in the header; the JavaScript toggle and saved preference are near the end of `public/script.js`. Light theme overrides are in `:root.light-mode` in the stylesheet.
- **Motion:** `data-snap` marks sections affected by desktop section snapping. Reveal classes control entrance effects. Check a small screen and reduced-motion setting when altering scroll behavior.

The current narrow-screen hamburger in `public/script.js` shows a prototype alert; it does not open a navigation drawer. Keep that limitation visible during launch review.

## Maintain the Q&A bot

There are **two sources of content**: visible page copy in `public/index.html` and chat facts in `api/chat.js` → `TEAM_INFO`. The bot does not read the page automatically. When changing team contact, sponsors, season details, meetings, or joining information, review both sources. Leave unknown facts as `[FILL IN]` until confirmed, and remove obsolete claims. The public bot should only contain information intended for visitors.

`public/chat-widget.js` handles the floating interface, `public/chat-widget.css` styles it, and `api/chat.js` sends vetted team context to Gemini. The site must be hosted on a platform that runs the `/api/chat` function for the bot to answer. It requires server-side `GEMINI_API_KEY`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN` in the appropriate Vercel environment. Without them, chat deliberately reports that it is unavailable. See [SECURITY.md](SECURITY.md) for configuration, limits, and deployment checks. Never commit real keys or put them in `public/`.

When changing external scripts or adding a new host for media, check the Content Security Policy in `vercel.json`. The two current CDN scripts in `public/index.html` have version-matched URLs and integrity hashes: changing their bytes or versions requires updating the hashes, verifying the loader still works, and reviewing the CSP. `vercel.json` also sets other browser security headers.

## Preview and publish changes

For an HTML/CSS/media edit, a local static preview is enough to inspect layout:

```sh
python -m http.server 8000 --directory public
```

Open `http://localhost:8000/`. This preview does **not** run `/api/chat`; use a configured Vercel preview to test the Q&A widget. Avoid opening the HTML with `file://`, since asset loading and browser behavior can differ from a served site.

Recommended edit flow:

1. Update from `main` and create a short-lived branch (`git switch main`, `git pull`, `git switch -c content/new-events`).
2. Make the content and asset changes, keeping related page and chat facts consistent.
3. Preview desktop and a narrow mobile viewport. Open every season card, follow new links, inspect images and the browser console.
4. Run `node --test tests/security.test.mjs` when modifying chat code, API code, security configuration, or the scripts used by the widget.
5. Check `git diff`, commit, push the branch, and open a PR into `main`. Confirm the deployment preview, then merge when the changes are ready. Production updates depend on the repository's hosting configuration.

### Before publishing

**NON-NEGOTIABLE: DO NOT REMOVE THE COMING SOON PUG CARD UNDER ANY CIRCUMSTANCES.** Keep its image, its `coming-soon` ID, and its popup media. It is a permanent feature, not a launch placeholder. Do not interpret any item in the checklist below as permission to delete, hide, or replace the Pug.

The checked-in page still has unfinished sample content. Review at least these other items before treating it as public team information:

- Mission lorem ipsum, team stats (`X`/`x`), robot names represented by underscores, and unverified robot descriptions/award labels.
- Placeholder sponsor names; `picsum.photos` images in Team and the five-image homepage gallery.
- Sample event dates/venues and `href="#"` event actions; footer social links also use `#`.
- Contact `.example` email and a separate footer `mailto:mail.example` target.
- Prototype message in the footer and mobile menu alert.
- Conflicting or dated season text between the page and the Q&A facts in `api/chat.js`.
- Live Q&A configuration and a real preview check of the security headers, models, fonts, images, and chat endpoint.

Keep this README updated when changing section markup, asset folders, or how content is stored; future editors should be able to follow it without reading the full codebase.
