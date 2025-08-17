# Footsteps of Time

Web app data story for human presence throughout history.

## ✨ Vision Statement

A living atlas that shows **everyone who ever lived, throughout all of human history**.

Shows an instantiation of history from the data available, as accurately as possible.

---

## 1 ▪ Problem
| Pain | Detail |
|------|--------|
| History feels abstract and disconnected | Often told as narratives of great men of history, dramatic events and great empires, less about how people lived | Textbooks list dates; readers struggle to visualise scale & simultaneity. |
| Data is scattered | Population grids, settlement gazetteers, migration theories sit in siloed PDFs. |
| Existing maps omit uncertainty | Most timelines show only what’s known, hiding how little we actually know. |

## 2 ▪ Solution
* **Interactive map / globe**. Smooth zooming and panning.  
* **Time slider** (100 k BCE → 2025 CE)
* **Population  dots** (from HYDE 3.5 dataset of population grids).  

---

## 3 ▪ Core Experience
1. Land on a dark globe showing faint clusters at –100 k.  
2. Drag the slider → density blooms; cities spark on.  
3. Hover any dot to see name, year, population & other details as to the people who lived there.

---

## 4 ▪ MVP Scope (v0.1)
| Slice | What ships |
|-------|------------|
| **Data** | HYDE grids (select years from 10k BCE to 1500 CE)
| **Frontend** | Next.js + Deck.gl point layer, RC-Slider control, basic tooltip. |
| **Backend** | Nextjs or static file hosting; mbtiles served locally during dev. |

---

## 5 ▪ Future Plans
* Years 100k - 10k
* Climate / sea-level change over time
* Details about populations like languages, religions, politics, names, faces
* Full mobile support

---

## 6 ▪ Target Audience
* People interested in history
* History & data-viz enthusiasts  

---


## 7 ▪ Tech Snapshot
* **Frontend**: Next.js / React, Deck.gl, Mapbox vector-tile source  
* **Data prep**: Python + GDAL + Tippecanoe  
* **Hosting**: Vercel (static) + Cloudflare R2 for mbtiles  
* **CI**: GitHub Actions (data ETL, lint, deploy)