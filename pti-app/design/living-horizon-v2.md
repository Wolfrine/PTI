# PTI Living Horizon v2 — daily art, actual sky

Status: owner approved promotion to the authenticated `/home` launcher on 13 November 2026. The accepted standalone concept remains available at `/living-horizon/index.html`; live browser inspection of authenticated Home remains a release QA gate.

## 13 November 2026 — active v5 Home and regional artwork contract

- The `/home` welcome hero is now the same-origin Living Horizon embed; real launcher apps, search, account readings, local companions and authentication remain under Angular Home. The expanded studio posts measured content height to the parent with an origin- and source-validated resize listener.
- **No US AQI source, number, pill, provider request or live approximation remains.** Older v3/v4 AQI descriptions retained later in this document are historical, superseded design notes. Only observed weather visibility is displayed; **Artistic smog** is a simulation-only percentage, explicitly not air quality.
- Rain uses an independent three-depth painterly canvas system with wind slant, mist and a bounded frame rate. Optional water ripples are postponed until each foreground painting has a verified responsive water-mask mapping.
- Independent rendered feedback found 8 mm/h rain too faint in the initial v5 public scene. The follow-up increases spatial streak density, near-field contrast and sheet opacity so steady rain reads distinctly from drizzle on bright as well as dark paintings, while preserving the 30 fps bound and reduced-motion fallback.
- The landscape catalogue now contains **14 transparent paintings in five style packs**: six coastal-foothill treatments and two each of Himalayan highland, river plain, Western Ghats forest hills and tropical Konkan coast.
- `landscape-regions.js` selects a broad, *illustrative* regional pack from an opted-in, rounded location using a nine-point Open-Meteo elevation sample plus nearby OpenStreetMap features. Missing or ambiguous geographic evidence falls back honestly; no painting claims a GPS-accurate view. DEM/OSM provider timeouts are bounded, with session-only coarse cache.
- The daily shuffle stays within the selected region, avoids adjacent repeats; manual studio matrix changes (settlement, relief, water, vegetation) choose the closest represented painting and state how many of four categories match. Live art cycling stays within the area pack.
- All Horizon CSS and JavaScript module imports use a revisioned URL, and Hosting revalidates `/living-horizon/**`; otherwise a new deployment can mix cached old scene logic with the new artwork manifest.
- The opted-in area label and OSM land-feature results credit **© OpenStreetMap contributors** visibly even in the Home embed; sourced terrain credits Copernicus DEM alongside Open-Meteo weather. Public Nominatim calls are user-triggered only, never a polling loop.

## 13 November 2026 — owner-approved Home integration (v5)

- Replace only the obsolete static Welcome hero on `/home` with a seamless, same-origin Living Horizon scene. Preserve authentic pinned/recent apps, search, usage readings, companion status, routing and Google login. An embedded scene isolates painterly assets/style/animation from private Angular account components; `ResizeObserver` reports its height to the parent so the simulation studio expands without a nested scrollbar. Mobile receives the actual scene rather than the old hidden Welcome card.
- Owner rejected **displaying regional US AQI**. Remove the public number, categories, labelled studio slider, CAMS fetch, hourly cache/refresh, and API attribution; leave measured local AQI absent until a source with acceptable geographic precision and provenance exists. A distinct **Artistic smog** 0–100% studio slider remains an explicitly hypothetical visual treatment. Meteorological visibility retains its real weather source.
- Rain engine v5 introduces three depth layers, wind slant, strength response, near-horizon moisture and optional mapped-water ripples. Static rain is retained under reduced-motion. The canvas animation is capped near 30 fps and stops when not needed.
- Promotion requires a production Angular build, source fingerprint, independent critic and actual `/home` visual/functional QA. Owner approval applies to the direction, not any unverified new bug.

## Experience

- Every calendar day in the **location's time zone** selects a new landscape style. Six original artistically distinct scenes rotate in a seeded shuffled bag; no repeat on adjacent days, including across bag boundaries.
- The compact **Art** action cycles the six styles instantly. Its manual override lasts until the next local calendar day. There is no paid or server-side image generation on page load.
- The artwork is a transparent foreground, while gradients, sunlight, moonlight, clouds, rain, stars, haze and scene color are separately composed. Environmental accuracy and artistic treatment are therefore independent.
- Day/dawn/dusk/night are derived from computed sun altitude. The rain/storm effects use visible canvas drops and a CSS sheet that remains visible when reduced-motion is enabled.
- Phone first: compact strip, minimal text, fast WebP foregrounds, pause animation when offscreen. The six initial landscapes together are about 820 KB.

## Environment data contracts

| Layer | Input/source | Meaning and update rule |
| --- | --- | --- |
| Local day, art choice | IANA time zone from weather result; device clock | Daily deterministic shuffle of the existing art catalogue |
| Sun | SunCalc v1.9.0, BSD license; location coordinates | True astronomical altitude/azimuth, mapped into an **artistic east–south–west panorama**, not a compass-aligned photographic view. Sunrise/set from Open-Meteo daily data for tooltip |
| Moon | SunCalc position, illuminated phase, daily rise/set crossings | True phase and position approximated in a painted sky; visibility, moonrise and moonset use geographic coordinates. Lunar disc is drawn by sphere illumination |
| Weather | Open-Meteo `current` weather code, clouds, rain/precipitation, temperature, wind, visibility | Current *model analysis*, cached/retried at 15-minute cadence only while visible. Stronger rain for precipitation, cloud drift and fog |
| Air | Open-Meteo Air Quality API, Copernicus CAMS | **Modelled US AQI**, not a measured India AQI or authoritative neighborhood sensor; cached one hour. Haze maps visibility and AQI independently |
| Location | Opt-in browser geolocation, rounded to two decimal places | About 1 km precision. Rounded position is sent to weather/air provider; one OSM Nominatim reverse lookup yields a coarse area label; never saved in Firestore |
| Geography | `classifyLandscape()` | Explicit matrix fields `settlement` (city/town/village/wilderness), `relief` (plain/hills/mountains), `water` (coast/river/lake/none), `vegetation` (urban/grassland/forest/arid). Unknowns remain *unmapped* rather than invented |

## Art catalogue and geographical scope

Manifest: `public/living-horizon/environment.js`. Assets: `public/assets/images/living-horizon/horizon-*.webp`. Each entry holds style label, geography tags, and per-device focal point; adding a style requires registering a corresponding transparent artwork. The first six styles are **one coastal-foothill (Navi Mumbai) pack**; region fields are catalogued but the complete world terrain/settlement matrix has not been illustrated yet. Until future curated packs are available, the interface labels out-of-region art as interpretive rather than falsely representing local geography. We should make multiple *styles per region*, not choose one regional style forever.

For future region packs, first define evidence for physical geography (coast, hills, forest, river etc.). A reverse-geocoded place name and elevation by themselves cannot prove a nearby river, forest or mountain; landcover/terrain mapping needs an additional authoritative geographic dataset and coverage/fallback strategy. Daily selection should draw only from compatible regional packs, avoid daily repetition, and permit users to browse all approved styles.

## Privacy, performance, accessibility

- A static public-safe visual preview: no PTI auth, Firestore user records or personal tracking metrics.
- The default is a preconfigured *coarse* Navi Mumbai area; geolocation is requested only after pressing **My area**. No continuous watch; no precise coordinates in URL or localStorage.
- Open-Meteo requests use `timezone=auto`, `forecast_days=1`; visibility values are meters. Air model quality/latency and weather may disagree with a nearby observation.
- Visibility and air values are hidden on unavailable data rather than displaying `0`. The preview labels real model data and sample presets separately.
- No GitHub Action deployment required: build locally and deploy directly via Firebase.
- Reduce motion: static rain remains visible; cloud/mist/stars freeze. Scene pauses when outside viewport.

## Visual QA checklist (desktop and narrow phone)

1. Inspect **Live / Dawn / Day / Rain / Night** and every **Art** choice; check no painted sky remains in each foreground and no clipped ridge or cutout halo at edges.
2. Under Rain, verify rain against both pale and dark artwork, and repeat with reduced-motion enabled.
3. Check sun/moon positions, phase, sunrise/set tooltip, moonrise/set tooltip, local day rollover, art override reset, no adjacent-day repeat.
4. Check weather or air fetch failures and location permission denied; never display sample conditions as live.
5. Inspect full desktop, a 390px phone width, and <=350px phone width for legibility, touch targets and caption contrast.

## Limitations to resolve before replacing the real PTI hero

- Extend the artist-curated regional library beyond the initial coastal-foothill pack and incorporate geographic evidence for terrain/landcover selection.
- Independent visual acceptance of the *deployed* phone/desktop renders; refine individual artwork positioning, haze contrast, and rain if necessary.
- Integrate the approved compact component with the actual authenticated PTI dashboard, preserving its existing resource pulse, local companions and app navigation.

## 13 November 2026 — environment explorer and accuracy audit

An expandable **Explore combinations** studio is added to the same isolated preview, without replacing authenticated `/home`. The default view remains collapsed. Date and time, calculated or manually overridden moon phase, weather category, cloud percentage, rainfall intensity, wind, visibility, US AQI, temperature and original art style are adjustable. Settlement, relief, water and vegetation selectors explore the classification matrix and clearly label combinations without matching artwork. Quick Dawn, Day, Rain and Night buttons now set real astronomical times for the selected approximate area; Return to Live removes the simulation and restores incoming provider readings. A selected scenario is intentionally not saved as real weather or persisted to the URL.

### Accuracy and provenance boundaries

1. **Location:** default coordinates represent the broad Navi Mumbai area (`19.05, 73.02`). Only clicking **My area** requests browser permission; successful coordinates are rounded to two decimals before provider calls. Browser geolocation accuracy is device-dependent, and rounding does not improve the original fix. No precise coordinate or private user data is persisted by this preview.
2. **Weather:** [Open-Meteo Forecast API](https://open-meteo.com/en/docs) supplies modelled current conditions (temperature, weather code, cloud cover, precipitation, wind and visibility), plus same-location local sunrise/sunset and IANA time zone. The browser refreshes its model result no more than every 15 minutes while the live page is visible. "Live" means latest available model conditions, not a local sensor.
3. **Air:** [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) provides a Copernicus CAMS-backed **US AQI** forecast/model estimate with one-hour caching. This differs from India's official AQI and can differ materially from nearby monitors.
4. **Astronomy:** vendored [SunCalc](https://github.com/mourner/suncalc) computes sun/moon altitudes, azimuths and lunar illumination from coordinates and the selected instant. In the live view, the device clock and provider time zone determine that instant. Moonrise/set are found from local-day altitude crossings; dates in the explorer use the selected IANA time-zone offset, including seasonal offsets. The decorative panorama maps these directions to an east–south–west **illustration**, not a compass-aligned azimuth projection. Open-Meteo's sunrise/sunset in Live are shown for comparison; simulated-day times are computed by SunCalc.
5. **Geography:** place labels come from one opted-in [Nominatim](https://nominatim.org/) reverse-geocoding lookup. Existing place-name/elevation heuristics cannot verify land cover or waterways; vegetation is now left unmapped unless supported. No synthetic matrix setting is presented as a measured property. The six original images remain a Navi Mumbai coastal-foothill interpretation.
6. **Failure modes:** weather failures show a labelled offline visual study. Missing AQI/visibility values are hidden rather than represented as zero; simulation values carry explicit "simulated" qualifiers. After location changes, previous area's weather and air readings are cleared before presenting the new area.

### Release verification

- JavaScript syntax and `git diff --check`: passed locally.
- Angular production build: passed locally. Existing SCSS size-budget and missing `/assets/styles/pti-home.css` warnings remain unrelated to this static preview.
- The production build copied the four changed `public/living-horizon` files byte-for-byte.
- The deployed desktop interface was independently inspected on 13 November: time/night, rainfall, manual lunar phase, landscape warnings, original-art rotation, and Return to Live all passed. The expanded studio keeps the original warm hero visually dominant. Tiny utility typography and the disclosure's "Open" text while expanded are minor polish opportunities.
- A narrow/mobile viewport could not be exercised in the available browser and remains unverified. Owner aesthetic acceptance is still pending.
- `bf10f9c6cb2da0a42d0a8ee84016b4be4e951d57` deployed to PTI `hosting:default` as Firebase version `4a8f649cc9261d31`: served v3 index and JS/CSS/environment hashes verified, `/home` returned HTTP 200, 19 dirty PC files and 13 sibling compatibility files remained intact. GitHub Actions was skipped.

## 13 November 2026 — v4 atmospheric depth and AQI prominence

Owner feedback: existing cloud motion is too subtle and flat; extreme visibility and AQI differences are weak and nearly identical. The sky description should show AQI prominently next to its condition, with no word "model" and a very small local observation time. Regional landscape categorization is the **next** round, not a reason to replace the six currently admired original paintings.

### This bounded visual implementation

- A standalone `clouds.js` canvas renderer builds deterministic illustrated cumulus, wisps and low storm banks, caches their pigment-like textures, and varies coverage, direction of light, wind speed, color and layer movement with live or simulated weather. Pause when offscreen, hidden or motion-reduced.
- `atmosphere.css` separates **visibility** (neutral/cool near-horizon loss of distant contrast and detail) from **air pollution** (warm-grey aerosol color veil). Strong hypothetical extremes are visually distinguishable. Both visualizations are interpretive, not physical reconstructions or health instruments.
- The primary sky-caption line now displays **US AQI with a categorical tint** beside the weather description; its observed weather time is subdued. The tiny secondary environmental row no longer duplicates the AQI number. Scenario values are labelled simulated; original Live readings return on reset.
- The actual PTI `/home` authenticated dashboard is untouched. The v4 candidate remains in the isolated `/living-horizon` preview until owner feedback and source-backed geographic artwork are ready.

### Area-specific air-quality source decision

The present [Open-Meteo CAMS global](https://open-meteo.com/en/docs/air-quality-api) output has approximately **45 km spatial resolution** over India: a query made with rounded GPS coordinates is *location-conditioned but regional*, not a block-, street- or neighbourhood-level observation. Keep the UI explicitly labelled **regional US AQI estimate**, never “local measured AQI”.

Potential next integrations need a real source-quality gate:

1. [CPCB real-time station data via India's Open Government Data platform](https://www.data.gov.in/catalog/real-time-air-quality-index) provides hourly *station-based Indian AQI*. Registered API-key access is required ([OGD help](https://www.data.gov.in/help)); select the nearest reporting station by coordinates and show its name, distance, observation time and stale/unavailable state. Station data are not the user's exact location, and station availability/freshness must be verified.
2. [Google Air Quality](https://developers.google.com/maps/documentation/air-quality/current-conditions) supports location estimates at up to 500 m resolution and India's `ind_cpcb` scale, but an enabled billing account and API key are required; apply quotas and cost limits before adoption.

No credential or billed API was configured during this pass; the deployed regional CAMS feed remains the fallback. Do not infer local pollution from the user-selected artwork matrix. Future landscape region packs require independent landcover, relief and water data and acceptance of representative art.
