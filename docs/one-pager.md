# Footsteps of Time

A living atlas that lets anyone **scrub through 100 000 BCE → today and watch humanity spread, cluster, and explode into cities** on a single, elegant globe.

---

## ✨ Vision Statement
> **Make the vast sweep of human presence instantly graspable.**  
> Footsteps of Time turns dry demographic tables into a visceral, time-lapse journey—revealing how small bands of people became a planet-spanning, urban civilisation in the blink of an evolutionary eye.

---

## 1 ▪ Problem
| Pain | Detail |
|------|--------|
| History feels abstract | Textbooks list dates; readers struggle to visualise scale & simultaneity. |
| Data is scattered | Population grids, settlement gazetteers, migration theories sit in siloed PDFs. |
| Existing maps omit uncertainty | Most timelines show only what’s known, hiding how little we actually know. |

## 2 ▪ Solution
* **Interactive globe + non-linear time slider** (100 k BCE → 2025 CE).  
* **Population heat-map** (HYDE 3.3) and **city dots** (Reba Urban Gazetteer).  
* **Fog-of-history layer** to visualise confidence vs. conjecture.  
* **Milestone call-outs** that highlight pivotal jumps (e.g., Neolithic farming, Industrial Revolution).  

---

## 3 ▪ Core Experience
1. Land on a dark globe showing faint clusters at –100 k.  
2. Drag the slider → density blooms; cities spark on.  
3. Hover any dot to see name, year, population & confidence flag.  
4. Toggle “Show uncertainty” to reveal / hide synthetic low-confidence data.

---

## 4 ▪ MVP Scope (v0.1)
| Slice | What ships |
|-------|------------|
| **Data** | HYDE grids (every 1 k yr to 1 CE, 100 yr 1–1800, 10 yr 1800–2020) + Reba cities. |
| **Frontend** | Next.js + Deck.gl heat shader, RC-Slider control, basic tooltip. |
| **Backend** | Static file hosting; mbtiles served locally during dev. |
| **Uncertainty** | Simple opacity fade for pre-documented eras. |
| **Branding** | Single-page site, logo word-mark only. |

---

## 5 ▪ Future Extensions
* Empire borders & trade routes layer  
* Climate / sea-level overlays  
* Narrative tours (“Out of Africa”, “Silk Road”, “Urban tipping point”)  
* Mobile pinch-scrub mode  
* Public API for educators / journalists  

---

## 6 ▪ Target Audience
* High-school & university educators  
* History & data-viz enthusiasts  
* Newsrooms needing quick historical context graphics  

---

## 7 ▪ Value Proposition
* **See 100 000 years in 10 seconds**—an emotional, share-worthy visual.  
* **Transparent about uncertainty**, fostering historical literacy.  
* **Embeddable widget** for courses and articles.

---

## 8 ▪ Differentiators
| Footsteps of Time | Existing tools |
|-------------------|----------------|
| Full 100 k yr span | Mostly last 12 k yrs or single era |
| Fog-of-history layer | Rarely show data gaps |
| Non-linear slider scaling | Linear sliders compress recent explosions |
| Globe + heat-map | 2-D maps or static charts |

---

## 9 ▪ Tech Snapshot
* **Frontend**: Next.js / React, Deck.gl, Mapbox vector-tile source  
* **Data prep**: Python + GDAL + Tippecanoe  
* **Hosting**: Vercel (static) + Cloudflare R2 for mbtiles  
* **CI**: GitHub Actions (data ETL, lint, deploy)

---

## 10 ▪ Success Metrics (Year 1)
| Metric | Target |
|--------|--------|
| Unique interactive sessions | 250 k |
| Avg. time on page | > 2 min |
| .edu / .org embeds | 100+ |
| Newsletter sign-ups for roadmap | 5 k |

---

## 11 ▪ Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| Data license changes | Mirror datasets, maintain citation page. |
| Performance on low-end devices | Provide 2-D fallback; throttle heat-map resolution. |
| Misinterpretation of synthetic data | Prominent legend + “Hide synthetic” toggle + methodology page. |

---

_“Every pixel is a person; every drag of the slider rewrites our collective footprint.”_
