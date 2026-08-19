# sirpyairtravels.com

The Sirpy Air Travels website — a plain static site (HTML, CSS, vanilla JS) deployed to Vercel from GitHub.

**There is no build step.** No React, no Vite, no bundler, no `npm install` at deploy time. Vercel serves this repository root exactly as it is, which makes deploys near-instant and impossible to break with a bad build.

## Pages

| URL | File | Purpose |
|---|---|---|
| `/` | `index.html` | Home — hero banner slider, 8 services, featured packages, news, newsletter |
| `/tours` | `tours.html` | All 12 tour packages with category filters |
| `/news` | `news.html` | Announcements and updates |
| `/article` | `article.html` | Article template for a single post |
| `/contact` | `contact.html` | Enquiry form, offices, map |
| `/privacy` | `privacy.html` | Privacy Policy |
| `/terms` | `terms.html` | Terms & Conditions |

URLs are extensionless (`cleanUrls` in `vercel.json`), so every internal link points at `/tours` rather than `/tours.html` and no click costs a redirect.

## Repository layout

```
├── index.html … terms.html   The seven pages
├── assets/
│   ├── css/royal.css         All styling
│   ├── js/royal.js           All behaviour
│   └── img/                  Web-sized banners, pop-up and logos
├── tools/                    Local maintenance scripts (not deployed)
├── vercel.json               Clean URLs, cache and security headers, redirects
├── robots.txt, sitemap.xml   SEO
└── package.json              Local helper scripts only — no build, no dependencies
```

## Deploying

Vercel is connected to this GitHub repository. **Pushing to `main` deploys to production.**

```bash
git add -A
git commit -m "Update site"
git push
```

Pull requests get their own preview URL automatically.

### Vercel project settings

If you ever set the project up again, use:

| Setting | Value |
|---|---|
| Framework Preset | **Other** |
| Build Command | *(leave empty)* |
| Output Directory | `.` |
| Install Command | *(leave empty)* |
| Node.js Version | default |

`vercel.json` already declares `outputDirectory: "."`, so the defaults usually work untouched.

## Running it locally

```bash
npm run serve
```

Then open <http://localhost:8123>. This uses `npx serve`, which resolves extensionless URLs the same way Vercel does — so `/tours` works locally too.

`npm run dev` starts Python's built-in server instead, but it does **not** do clean URLs, so links will 404. Prefer `npm run serve`.

## Editing content

The seven `.html` files are ordinary standalone HTML. Edit them directly, commit, push.

The one thing to know: **the shared header, tours panel, drawer, footer, WhatsApp button and pop-up live in `index.html`** and are copied into the other six pages by a script. So:

- Changing a **page's own content** → edit that `.html` file directly.
- Changing the **header, nav or footer** → edit `index.html`, then run `npm run pages` to propagate it.

```bash
npm i sharp        # one-time, only needed for the tools below
npm run pages      # copy header/footer from index.html into the other six pages
```

> `npm run pages` **overwrites** the header and footer of the other six pages. Their body
> content is defined inside `tools/build-pages.mjs`, so edit it there if you re-run the script.

### Replacing banner artwork

`npm run images` regenerates the responsive WebP/JPEG variants from the full-resolution originals. Those originals (~19 MB) are deliberately **not** committed here — only the web-sized output is. Point the script at wherever you keep them:

```bash
SIRPY_SOURCE_DIR="/path/to/Website" npm run images
```

It expects `Banner/` (the six 2752×1536 banners plus `pop up.jpeg`) and `public/assets/` (the logos) inside that directory. Running it shrank the artwork from ~19 MB to ~2.8 MB and the header logo from 987 KB to 14 KB.

## Performance

A first mobile page load is roughly **230 KB** of local assets — the first banner is 33 KB, the CSS 40 KB, the JS 24 KB. Banners use `<picture>` with WebP at 640/1000/1600px plus a JPEG fallback; only the first is eager, the rest lazy-load.

## Things worth knowing

- **WhatsApp everywhere.** Every banner, service card, package and form opens `wa.me/919344020864` with a message pre-filled describing exactly what the visitor tapped. To change the number, update it in each `.html` file *and* at the top of `assets/js/royal.js` (`WA_NUMBER`), then re-run `npm run pages`.
- **The hero banners are shown whole, never cropped.** Each design already has its headline and CTAs baked into the artwork, so the slider uses `object-fit: contain`. Replacing them with a different aspect ratio will letterbox — regenerate at 16:9 for best results.
- **The visitor counter is per-browser.** A static site has no server, so the footer counter is a `localStorage` count over a seeded figure, labelled "Visits". Real traffic numbers should come from Vercel Web Analytics instead.
- **The language switcher is wired for English only.** Tamil, Hindi and Malay are listed as "Soon" — add their strings when ready.
- **The offer pop-up** shows 3.5s after a first visit and stays dismissed for 24 hours.

## Third-party content

Google Fonts (Cinzel, Marcellus, Plus Jakarta Sans), package and news photography from Unsplash, and an embedded Google Map on the contact page. The banners, pop-up and logos are served locally. Every font has a system fallback declared in the CSS.

## Contact details used throughout

```
Trichy:     +91 93440 20864  /  +91 90474 54335
Singapore:  +65 8260 2446
Email:      Sirpytravels@gmail.com
WhatsApp:   https://wa.me/919344020864
Office:     JR Complex, Near MIET College, Guntur,
            Trichy to Pudukottai Main Road, Tamil Nadu, India
Hours:      Mon–Sun, 9:00 AM – 9:00 PM
```
