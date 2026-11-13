# PTI Living Horizon v2 — daily art, actual sky

Status: isolated `/living-horizon/index.html` preview. The authenticated `/home` hero remains unchanged until the owner accepts the visual/behavioral result.

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
