# Marketing site

How `apps/www` (the marketing site at www.trymetis.email) gets its page metadata, structured data, sitemap, social images, `llms.txt` and comparison pages. Paths are relative to `apps/www/`. See also [AGENTS.md](../AGENTS.md), [ui.md](ui.md) (the mark copies www keeps), [downloads.md](downloads.md).

## Code map

| Concern                                                                            | Where                                                                                                                                           |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Every page's label, title, description and last-updated date                       | `src/content/pages.ts` → `PAGES`, `pageInfo`, `fullTitle`, `ogPath`                                                                             |
| A page's `<title>`, description, canonical, Open Graph and Twitter tags            | `src/lib/metadata.ts` → `pageMetadata`                                                                                                          |
| Social images, one per page (headline from `og`, else the title)                   | `src/app/og/[...slug]/route.tsx`                                                                                                                |
| JSON-LD                                                                            | `src/components/json-ld.tsx` → `SiteJsonLd` (home), `PageJsonLd` (every other page), `FaqJsonLd` (rendered by `src/components/site/faq.tsx`)    |
| FAQ entries                                                                        | `src/lib/faq.ts` → `FAQ_ITEMS` (read by `faq.tsx` and `llms.txt`)                                                                               |
| Page hero                                                                          | `src/components/exhibit/exhibit.tsx` → `Exhibit`                                                                                                |
| three.js scene per page                                                            | `src/components/exhibit/stage.tsx` → `MODELS` · one component per model in `src/components/exhibit/models/`                                     |
| Models, studio lighting and their generator                                        | `public/models/*.glb`, `public/hdri/studio.hdr` · `scripts/models/build.sh`, one Blender script per model, the shared kit `scripts/models/kit/` |
| Feature screenshots (captured from the e2e stack, reusing `apps/docs/screenshots`) | `scripts/shots.ts`                                                                                                                              |
| Sitemap · robots · `llms.txt`                                                      | `src/app/sitemap.ts` · `src/app/robots.ts` · `src/app/llms.txt/route.ts` (`DOCS`)                                                               |
| Comparison data and pages                                                          | `src/content/compare.ts` → `ROWS`, `METIS`, `COMPETITORS` · `src/app/compare/page.tsx`, `src/app/compare/[slug]/page.tsx`                       |
| Plan prices                                                                        | `src/content/pricing.ts` → `PLANS`, `ENTRY_PLAN`                                                                                                |
| Canonical host                                                                     | `src/lib/site.ts` → `SITE_URL` (`NEXT_PUBLIC_SITE_URL`, default `https://www.trymetis.email`)                                                   |
| App download links on `/apps`                                                      | `src/content/downloads.ts` → `DOWNLOADS` ([downloads.md](downloads.md))                                                                         |
| UI primitives                                                                      | `src/components/ui/` (www's own)                                                                                                                |
| Security headers and CSP                                                           | `next.config.ts` → `CSP`, `SECURITY_HEADERS`                                                                                                    |
| Error pages · web manifest · `security.txt`                                        | `src/app/error.tsx`, `src/app/global-error.tsx` · `src/app/manifest.ts` · `public/.well-known/security.txt`                                     |

## Rules

- **Every indexable page has an entry in `PAGES` and exports `pageMetadata(path)`.**
  - The sitemap, `llms.txt`, the OG route and the breadcrumbs all read `PAGES`, so a page without an entry is missing from all of them.
  - `pageInfo` throws at build time for a missing entry.
- **Change `updated` in `PAGES` whenever a page's visible content changes.** It is the sitemap's `lastmod` and the WebPage `dateModified`; a date that moves without real changes teaches search engines to ignore it.
- **Page-specific metadata lives on the page.** Metadata merges shallowly, so the root layout sets only site-wide Open Graph fields; a canonical, an Open Graph URL or JSON-LD there would leak to every page that does not override it.
- **`SITE_URL` must be the host that answers 200, not one that redirects.** Canonicals, OG URLs and the sitemap are built from it.
- **Structured data matches what the page shows.**
  - FAQPage comes only from the `Faq` component, wherever it renders (home and `/pricing`).
  - Offers come from `PLANS`.
  - Organization, WebSite and SoftwareApplication appear only on the home page.
- **Every competitor cell carries the vendor's own source.** A cell with no confirmable fact says "Not documented".
- **`checked` is the date a competitor entry was verified.** Re-check the whole entry, sources included, before changing it.
- **The Exhibit's `headline` is the page's H1** and carries the search category (email client, calendar, MCP server…); the large display lines are visual and `aria-hidden`.
- **The `DOCS` list in `llms.txt/route.ts` names docs-site paths by hand**, so a moved or renamed docs page updates it in the same change.
- **`apps/www/oxlint.config.mts` turns two rules off, each for one path.**
  - `react/immutability` is off for `src/components/exhibit/models/**`: the models build three.js objects in `useMemo` and mutate them in `useFrame`, which is how react-three-fiber animates.
  - `no-await-in-loop` is off for `scripts/**`: each screenshot drives one browser page step by step.

- **The models, the HDRI and their textures come only from `scripts/models/build.sh`**; a `.glb` or `studio.hdr` is never edited by hand.
  - `build.sh` with no arguments rebuilds the HDRI and every model; `build.sh typewriter cabinet` rebuilds only those. It needs `blender` on the PATH and uses the GPU for the ambient-occlusion bake when Cycles finds one.
  - Each model script builds real-world-size geometry in metres; the component scales it with its `S`.
- **Every model draws only from `PALETTE` in `scripts/models/kit/kit.py`**, so the ten pages share one look: bone enamel, graphite, brass, steel, aluminium, paper and amber.
- **A part a component moves is a named pivot node, listed in the script's `kit.export(anim=…)`.**
  - meshopt quantization rewrites the transform of any node without children, which would move a rotating part's pivot; `kit.wrap` gives each such part an empty parent carrying the name, with the mesh as `<name>_mesh`.
  - Components find parts by node name and animate them as offsets from the position they loaded with.
- **Moving parts are baked apart from the body** (`ao=dict(isolate=…)`), so a drawer or lid does not carry the shadow of its closed position.
- **Text and screens on a model are canvas textures the component draws on named planes** (`label*`, `display`, `face*`, `counter_face`, `sheet`, `screen`); their materials keep their names because the AO bake skips them.
  - The typewriter's `sheet` node carries `printV` (where the type strikes, as a fraction from the top of the texture), `aspect` and `width` as glTF extras.
  - The typewriter page is set in Special Elite, loaded with `next/font` in `typewriter.tsx` only.
- **The stage keeps `environmentRotation` at 0**: the softboxes in `scripts/models/kit/hdri.py` are placed for the stage's camera side.
- **The CSP is static and allows only what the site loads; a new origin or loader is added to `CSP` in the same change.**
  - A nonce would force dynamic rendering of a static site, so scripts and styles keep `'unsafe-inline'`.
  - `'wasm-unsafe-eval'` is the meshopt decoder `useGLTF` instantiates for the `EXT_meshopt_compression` models; `blob:` in `img-src` and `connect-src` is the textures `GLTFLoader` unpacks from each `.glb`.
  - `https://api.github.com` in `connect-src` is the star count `src/lib/repo.ts` fetches in the browser.
  - A model exported with Draco instead would make drei fetch its decoder from `www.gstatic.com`, which the CSP blocks.
- **`security.txt` carries an `Expires` date**; renew it before then, since an expired file tells researchers the contact is stale.

## Deliberate limits

- **Provider details and release history live on the docs site (`apps/docs`)**; www links there.
  - The docs changelog is `src/lib/site.ts` → `CHANGELOG_URL`, linked from the header, the mobile menu, the footer's Open source column and `llms.txt`.
- **The camera poses on each page are tuned by eye**, not derived from the model bounds.
