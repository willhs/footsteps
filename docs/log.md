---
id: docs-log
type: note
purpose: "Record implementation and documentation updates"
---

## [2026-11-09] update | Blend decoded grid years

Units and Grid now retain the displayed snapshot during loads and blend prepared
years over 300 ms. A Web Worker decodes, seeds and prepares binary rendering
attributes for neighbouring years in advance; the cache
retains five snapshots. An interrupted blend finishes before taking the latest
decoded request, keeping two GPU datasets and continuous brightness. GPU uploads
are staged in hidden chunks before a fade starts. Units draws a single union of
stable unit IDs, interpolating colours/radii on the GPU and keeping persistent
bands at full brightness. See the
[usage and verification instructions](../README.md#-how-to-use).
