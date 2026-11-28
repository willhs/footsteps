## [2026-11-28] update | Continental shares across the hand-over to HYDE

Research 0016: by continent, HYDE 3.5's 10,000 BCE map has Africa at 5% and the Americas at 51%, so the 14,000-10,000 BCE blend moved
~2 M people from Africa and Southeast Asia to the Americas and Siberia. `holocene_shares.py` → `lib/holoceneShares.json`: per-continent
multipliers 13,000-4,000 BCE (pure model's shares, fading to HYDE's by 3000 BCE; West Asia kept), applied in `gridDataFrom`. Also flagged,
not changed: South Asia empty while Southeast Asia is full 68-45 ka; Europe and Sahul in the Ice Age possibly several times too full.
