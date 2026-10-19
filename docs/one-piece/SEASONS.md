# Season browsing

19 October 2026. One Piece now groups the same canonical episodes by the Japanese home-media season convention, rather than arbitrary blocks of50. This is browse metadata only: original episode IDs, playback order, progress, sources, preparation and casting are unchanged. No media is downloaded to organize the library.

The current [series overview](https://en.wikipedia.org/w/index.php?title=List_of_One_Piece_episodes&oldid=1377046168) supplies the consecutive season counts. The [official Avex regular-release index](https://avex.jp/onepiece/products/list.php?artist_cd=OPRXX) and its [earlier releases](https://avex.jp/onepiece/products/list.php?artist_cd=OPRXX&page=2) verify the named season sequence. All21 official regular-season pages were read; their episode-number bounds are retained in `evidence/sources/season-source-probe.json`. The UI uses short English arc names, without story summaries.

Different streaming services and database editions split One Piece differently. These are Japanese season groups, not a claim to match Netflix's season labels. Standalone crossover, recap and TV-original numbered broadcasts remain in their chronological group; they are not removed merely because a regular DVD page omits them. Examples: Silver Mine747–750 stays before Zou, the Reverie material stays at the end of Season19, and590 keeps its missing placeholder. Individual DVD volumes can overlap a boundary: the source pages include457–458 under Impel Down while the consecutive season convention starts Marineford at457. This is why minimum/maximum DVD numbers alone were not used as a silent season parser.

| Season | Name | Original episodes | Listed in this library |
|---|---|---|---|
|1|East Blue|1–61|61|
|2|Enter the Grand Line|62–77|16|
|3|Drum Island|78–92|15|
|4|Alabasta|93–130|38|
|5|TV Original|131–143|13|
|6|Skypiea|144–195|52|
|7|Naval Fortress & Foxy|196–228|33|
|8|Water Seven|229–263|35|
|9|Enies Lobby|264–336|73|
|10|Thriller Bark|337–381|45|
|11|Sabaody Archipelago|382–407|26|
|12|Amazon Lily|408–421|14|
|13|Impel Down|422–456|35|
|14|Marineford|457–516|60|
|15|Fish-Man Island|517–578|62|
|16|Punk Hazard|579–628|49;590 missing|
|17|Dressrosa|629–746|118|
|18|Zou|747–782|36|
|19|Whole Cake Island|783–891|109|
|20|Wano Country|892–1088|194; available through1085|

The source catalogue remains1,084 listed episodes. The season selector remembers its position separately for each Google account. Old episode/range bookmarks and old saved range preferences resolve to their containing season. Search still covers the whole library; clearing it restores the selected season. Episode numbers remain the primary identifier. Season-local numbering is a browsing aid only.

Design lane: mechanical navigation refinement, retaining the owner's light/dark theme. Central0.1.0, base `ba1235fe7b220842778414f3f70fca38e7df4c53`. Designer `/root/onepiece_hosting`, independent critic `/root/separate_pwa_review`, parent/QA `/root`. Review season clarity, readable long names and selected state, global search recovery and desktop/mobile overflow. No new art direction or physical-device/media acceptance is implied.

Release review:78 frontend checks passed; complete Angular and One Piece production builds passed with the existing Angular warnings. Parent inspected four retained light/dark desktop1440×1000 and phone390×844 renders. Independent reviewer opened the local fixture directly, passed55 focused metadata/frontend checks, and confirmed long season names, missing590, Wano194available/end1085, last-season Nextdisabled, global1001search and return toSeason7. Search actually hides season summary/select/paging; the global hidden rule was checked through computed styles. Both reviewers reported no horizontal overflow or scoped blocker. Real catalogue/metadata are used; local accounts, progress and device states are explicitly synthetic. Screenshots and exact production fingerprints are in `design/evidence/seasons/`. Existing playback, authentication and TV acceptance retain their previous scope.
