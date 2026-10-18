# Human observations and current production payload lineage

**Recorded MP4 and full-English VTT hashes and sizes match exactly for both episodes between the earlier helper used for human observation and the current production cache. This is stronger than sharing a recipe or source.** This read-only audit compared existing handoff/observation/production evidence and a snapshot of the current cache manifest; it did not read or rehash media, start an engine, use the GPU, or alter source/cache files.

| Recorded identity |1000|1001|
|---|---|---|
| Original MD5 |`ebeeadb99c7c1f27ba1f90aade7ccce1`|`2610511c93fae62d4791e8284b6b96eb`|
| Original bytes |742,925,306|844,716,819|
| Original Japanese audio/full-English subtitle indices |1/2|2/4|
| Effective selected duration |1430.790s|1419.040s|
| Prepared MP4 bytes |737,980,951|1,323,099,843|
| English VTT bytes/cues |14,478/233|20,618/328|

The exact video SHA256 values agree across the prior validated helper handoff, the human-observation artifact, the successful production headless gate and the current production-cache records:

- 1000: `0b96bcf9a820609b2e98619c4100cef9f78195366109a9baed30131b159cff36`
- 1001: `5e39a25fce57721bcf1806d94532e3d05baeda608a1f80c29863035cdb00df14`

The exact VTT SHA256 values also agree, including the prior helper's actual served-caption check and the production gate's actual served-caption check:

- 1000: `8b827ac217634f8cb6663a6a95f084e33d83b40f228c9ae68eb78d35994590f7`
- 1001: `07b6573849c913e8f44c46db919d840da5bf5a2f510a3e48f2da35e3fe9499d6`

The current manifest's versioned dialogue/timing cue identities are saved in [the machine-readable audit](human-production-lineage.json), together with every equality check, exact source-document hashes and the manifest snapshot hash. Equal VTT file hashes imply equal cue identity; this audit did not recalculate cues from media files. Original track indices are compared within the original stream namespace; derived player/probe indices are not substituted for them.

The parent accepted separate human replies during the 1000 window 11:33:10–11:35:10 UTC and 1001 window 11:35:25–11:37:25 UTC: Japanese dialogue and English dialogue subtitles worked. The helper rechecked video size, inherited the full video hash from its earlier validated handoff, and checked the actually served caption content. **It explicitly did not recompute the full MP4 hash during those human observations.** Exact reply timestamps are not recorded; the parent recorded their question/window attribution. This is an evidence lineage comparison, not a new physical observation or fresh full-file integrity check.

The existing human presentation evidence can therefore remain attributed to these same recorded media/caption artifacts without asking the person to repeat an identical content check. It does not establish the latest production transport or Cast bridge. The final actual Sony run must still verify current delivery, controls, seeking, ticket handling and episode transition. Quantified subtitle synchronization, complete-episode viewing, physical Android/PWA/HDMI and family authentication remain separate gates. If the final rendition or served-caption hashes change, reassess this reuse conclusion.
