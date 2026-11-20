# Terrain benchmark (baseline, main 5943d1f) 2026-11-21

Commit `e81dac4`, load average 11.8 / 11.8 (start / end), http://127.0.0.1:50027, 1440x900, headed, GPU: ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro, Unspecified Version).
Times are seconds from navigation start to the terrain loaded and drawn. fps and long tasks come from a fixed 600 px drag. Texel = one colour texel in screen px (east-west x north-south) at the screen centre.

| scene | zoom | mode | load | cold s | warm s | fps (warm) | long tasks cold (n / max ms) | terrain MB cold | terrain MB warm | terrain req cold | total MB cold | texel px |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Alps 1000 CE | 4 | flat | 11.8 | 0.23 | 0.14 | 143.8 | 3 / 250 | 1.52 | 0.17 | 8 | 18.23 | 4 x 5.82 |
| Alps 1000 CE | 6 | flat | 12.3 | 3.60 | 1.24 | 134.8 | 8 / 141 | 4.93 | 0.04 | 53 | 23.75 | 16 x 23.27 |
| Alps 1000 CE | 8 | flat | 11.6 | 3.78 | 1.05 | 131.6 | 1 / 64 | 8.92 | 0.04 | 59 | 27.75 | 64 x 93.06 |
| Alps 1000 CE | 8 | 3d | 11.6 | 3.46 | 1.10 | 118.9 | 5 / 114 | 8.99 | 0.16 | 60 | 25.7 | 64 x 93.06 |
| Alps 1000 CE | 10 | flat | 11.2 | 4.00 | 1.20 | 133.8 | 5 / 211 | 8.35 | 0.45 | 56 | 29.25 | 256 x 372.24 |
| Alps 1000 CE | 10 | 3d | 10.6 | 6.76 | 1.81 | 130.5 | 4 / 159 | 16.25 | 0.79 | 117 | 39.54 | 256 x 372.24 |
| Alps 1000 CE | 12 | flat | 11.7 | 3.75 | 1.07 | 129.2 | 4 / 117 | 7.22 | 0.17 | 53 | 30.51 | 1024 x 1488.98 |
| Alps 1000 CE | 12 | 3d | 11.8 | 7.56 | 2.34 | 101 | 6 / 130 | 15.6 | 0.32 | 130 | 38.9 | 1024 x 1488.98 |
| Nile 1500 CE | 4 | flat | 12.5 | 0.29 | 0.26 | 136.8 | 2 / 93 | 1.63 | 0 | 10 | 14.27 | 4 x 4.44 |
| Nile 1500 CE | 6 | flat | 14.7 | 4.01 | 1.66 | 114.1 | 7 / 254 | 4.54 | 0.15 | 53 | 19.67 | 16 x 17.76 |
| Nile 1500 CE | 8 | flat | 15.6 | 3.54 | 1.40 | 130.1 | 8 / 105 | 4.34 | 0.36 | 53 | 21.87 | 64 x 71.03 |
| Nile 1500 CE | 8 | 3d | 15.2 | 3.46 | 0.94 | 141.6 | 4 / 126 | 4.69 | 0.08 | 59 | 22.22 | 64 x 71.03 |
| Nile 1500 CE | 10 | flat | 15.2 | 4.42 | 1.58 | 144 | 5 / 150 | 3.33 | 0.03 | 53 | 20.86 | 256 x 284.1 |
| Nile 1500 CE | 10 | 3d | 14.2 | 7.14 | 2.04 | 125.1 | 4 / 98 | 6.17 | 0.15 | 118 | 30.99 | 256 x 284.1 |
| Nile 1500 CE | 12 | flat | 14.3 | 3.35 | 1.44 | 143.8 | 4 / 179 | 2.85 | 0.04 | 53 | 20.38 | 1024 x 1136.42 |
| Nile 1500 CE | 12 | 3d | 13.6 | 6.61 | 2.06 | 125.5 | 3 / 90 | 4.77 | 0.11 | 120 | 27.03 | 1024 x 1136.42 |
| Doggerland 10000 BCE | 4 | flat | 14.4 | 0.28 | 0.22 | 140.9 | 2 / 85 | 1.62 | 0 | 9 | 10.37 | 4 x 6.94 |
| Doggerland 10000 BCE | 6 | flat | 15.4 | 4.13 | 2.07 | 143.9 | 4 / 166 | 3.84 | 0.04 | 55 | 13.62 | 16 x 27.76 |
| Doggerland 10000 BCE | 8 | flat | 14.8 | 3.67 | 1.21 | 118.5 | 2 / 97 | 5.41 | 0.03 | 55 | 15.19 | 64 x 111.03 |
| Doggerland 10000 BCE | 8 | 3d | 15.6 | 3.78 | 1.23 | 136 | 5 / 154 | 5.65 | 0.04 | 58 | 14.4 | 64 x 111.03 |
| Doggerland 10000 BCE | 10 | flat | 16 | 4.10 | 1.62 | 133.7 | 6 / 313 | 3.11 | 0.09 | 60 | 11.87 | 256 x 444.11 |
| Doggerland 10000 BCE | 10 | 3d | 15.1 | 6.91 | 2.22 | 126.4 | 9 / 164 | 5.35 | 0.12 | 124 | 15.19 | 256 x 444.11 |
| Doggerland 10000 BCE | 12 | flat | 14.3 | 3.32 | 1.26 | 144 | 5 / 149 | 2.2 | 0.04 | 60 | 11.92 | 1024 x 1776.44 |
| Doggerland 10000 BCE | 12 | 3d | 14.7 | 6.35 | 2.17 | 142.8 | 7 / 84 | 3.25 | 0.1 | 128 | 13.08 | 1024 x 1776.44 |
| Amazon 1000 CE | 4 | flat | 13 | 0.25 | 0.29 | 144 | 1 / 91 | 1.52 | 0 | 8 | 13.74 | 4 x 4.01 |
| Amazon 1000 CE | 6 | flat | 13.1 | 3.65 | 1.13 | 140.9 | 4 / 132 | 4.94 | 0.22 | 56 | 21.65 | 16 x 16.02 |
| Amazon 1000 CE | 8 | flat | 12.7 | 4.53 | 1.51 | 135.7 | 6 / 116 | 3.93 | 0.04 | 53 | 22.75 | 64 x 64.09 |
| Amazon 1000 CE | 8 | 3d | 11 | 3.73 | 1.05 | 137.1 | 2 / 127 | 4 | 0.04 | 54 | 20.7 | 64 x 64.09 |
| Amazon 1000 CE | 10 | flat | 10.5 | 4.17 | 1.28 | 143 | 3 / 125 | 3.75 | 0.03 | 53 | 22.57 | 256 x 256.38 |
| Amazon 1000 CE | 10 | 3d | 11.7 | 6.98 | 1.72 | 136 | 4 / 100 | 6.83 | 0.13 | 119 | 32.18 | 256 x 256.38 |
| Amazon 1000 CE | 12 | flat | 9.9 | 3.58 | 1.19 | 134.7 | 2 / 62 | 2.82 | 0.03 | 53 | 26.11 | 1024 x 1025.5 |
| Amazon 1000 CE | 12 | 3d | 9.2 | 6.63 | 1.79 | 134.8 | 2 / 93 | 4.9 | 0.17 | 118 | 34.67 | 1024 x 1025.5 |
| Mongolian steppe 0 CE | 4 | flat | 8.2 | 0.26 | 0.24 | 143.5 | 4 / 76 | 0.95 | 0 | 5 | 14.58 | 4 x 5.89 |
| Mongolian steppe 0 CE | 6 | flat | 8.7 | 3.55 | 1.21 | 137.1 | 2 / 116 | 5.17 | 0.13 | 56 | 20.78 | 16 x 23.55 |
| Mongolian steppe 0 CE | 8 | flat | 8.8 | 4.21 | 1.28 | 134.1 | 0 / 0 | 4.03 | 0.04 | 50 | 25.81 | 64 x 94.2 |
| Mongolian steppe 0 CE | 8 | 3d | 9.5 | 3.48 | 1.02 | 136 | 5 / 74 | 4.1 | 0.03 | 51 | 21.74 | 64 x 94.2 |
| Mongolian steppe 0 CE | 10 | flat | 8.8 | 3.45 | 1.15 | 138.4 | 2 / 75 | 2.76 | 0.03 | 50 | 20.4 | 256 x 376.78 |
| Mongolian steppe 0 CE | 10 | 3d | 8.9 | 6.71 | 2.11 | 128.7 | 1 / 53 | 5.2 | 0.08 | 116 | 31.25 | 256 x 376.78 |
| Mongolian steppe 0 CE | 12 | flat | 9.6 | 3.91 | 1.32 | 135 | 3 / 125 | 2.08 | 0.03 | 50 | 19.71 | 1024 x 1507.12 |
| Mongolian steppe 0 CE | 12 | 3d | 12 | 6.65 | 2.11 | 132 | 5 / 105 | 3.58 | 0.11 | 116 | 25.35 | 1024 x 1507.12 |

## Goal checks

| check | target | measured | |
|---|---|---|---|
| zoom 10 tilted: full detail, cold (worst scene) | <= 3000 ms | 7139 ms | FAIL |
| zoom 10 tilted: full detail, warm (worst scene) | <= 1500 ms | 2217 ms | FAIL |
| zoom 10 tilted: fps panning (worst scene) | >= 50 fps | 125.1 fps | pass |
| zoom 10 tilted: longest main-thread task while streaming | <= 50 ms | 164 ms | FAIL |
| colour texel up to zoom 12 (worst scene and zoom) | <= 2 px | 1776.44 px | FAIL |
