# Venture Lab Design Direction

Design level: **L2+ / L3 command-center craft**. It remains an operational research tool; visual ambition must not make evidence harder to scan.

## Product thesis

Venture Lab is an **Evidence Desk**: outside market movement is progressively transformed into:

```
Signal → Pattern → Entry
```

That transformation is the visual identity. The product should be recognizable without its logo because raw evidence, synthesis and our own opportunity candidates have visibly different, stable roles.

## Selected direction — Evidence Desk

- warm ledger field with low-contrast measurement grid;
- single grotesk/system type family + monospace evidence metadata; no generic premium-serif pairing;
- stable semantic stage colors:
  - orange = external signal;
  - blue = cross-signal pattern;
  - green = our entry/opportunity;
  - ochre = studied/structured intermediate state;
- navigation mirrors the content model rather than acting as generic chrome;
- lists behave as indexed research records, not rounded card stacks;
- the selected item opens as a flat research dossier with explicit evidence boundaries;
- proof is adjacent to claims: discovery sources appear inside signal dossiers; opportunity dossiers show the exact market signals they were derived from;
- shortlisted opportunities are the visual payoff of the research, not another equal-weight row.

## Rejected direction — Market Observatory

A graph/radar/constellation-style interface was rejected. It would look more dramatic but would imply measured strength, causality or relationships that Venture Lab does not currently store. Central's perceptual/evidence rules prohibit using geometry as decorative pseudo-data.

## Reference mechanisms used

- **Linear:** workflow grouping, low-chrome operational density, product/evidence beside claims.
- **Seasats:** navigation as content map; repeated structure creates orientation.
- **Material Design:** containment and motion communicate state/object continuity.
- **Collection:** editorial, idea-first labeling without sacrificing explicit structure.
- **Central patterns:** Navigation as Content Model; Proof in the Primary Narrative.
- **Central anti-pattern avoided:** Generic AI UI — no neon dark mode, glow/orbits, glass cards or decorative AI graphs.

## Perceptual mapping

| Product fact | Primitive | Pre-reading inference |
|---|---|---|
| External signal | orange edge / index position | incoming evidence |
| Pattern | blue grouping / linked count | synthesis across multiple signals |
| Opportunity | green state / strong payoff block | our possible action |
| Selected record | persistent stage color + foreground dossier | same object, now inspected |
| Source evidence | common region beneath claims | proof belongs to this dossier |
| Derived opportunity evidence | repeated source titles | entry traces back to real signals |

## Responsive behavior

Desktop uses a split research desk: index on the left, dossier on the right. On phone, when an item is selected its dossier moves ahead of the list and is scrolled into view, preserving action priority instead of forcing the user through the entire index first.

Motion is limited to state continuity (view/dossier entry and selection); reduced-motion removes it.
