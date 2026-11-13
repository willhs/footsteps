"""Forager staples by biome: what people without domesticates lived on, in broad terms.

One entry per Krapp 2021 BIOME4 class (the classes of `habitat_lookup.py`, 1-28). These are
ethnographic generalisations, not measurements, and are written from memory of:

    Binford 2001 Constructing Frames of Reference (the plant share of hunter-gatherer diets falls and
        the animal and aquatic share rises as effective temperature falls; ~340 groups);
    Kelly 2013 The Lifeways of Hunter-Gatherers, 2nd ed., ch. 3 (the same pattern; the "rainforest
        problem" and the importance of fat and of fish in cold places);
    Lee 1979 The !Kung San (mongongo nuts and tubers in savanna);
    Bailey et al. 1989 Am Anthropol 91:59 (wild yams in rainforest, the 'rainforest problem');
    Marlowe 2005 Evol Anthropol 14:54 (hunter-gatherer diets across ET).

Nothing here was checked against the books this session. `plants` and `animals` are example staples,
most important first, not complete lists. `plant_weight` is a rough guide to how much of the diet
plants carried: "high" (about half or more), "medium", "low" (a quarter or less).
Where a cell is coastal, `COASTAL` is added: fish, shellfish and sea mammals can dominate there.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Weight = Literal["high", "medium", "low", "none"]


@dataclass(frozen=True)
class ForagerDiet:
    plants: tuple[str, ...]
    animals: tuple[str, ...]
    plant_weight: Weight
    note: str = ""


def _d(plants: str, animals: str, weight: Weight, note: str = "") -> ForagerDiet:
    split = lambda t: tuple(x.strip() for x in t.split(",") if x.strip())  # noqa: E731
    return ForagerDiet(split(plants), split(animals), weight, note)


_TROPICAL_FOREST = _d("wild yams, sago and other palm starch, fruit, nuts, honey", "small game, monkeys, forest pigs and antelope, fish, insects", "high",
                      "Wild yams are scarce in deep rainforest, so many forest foragers traded with farmers (Bailey et al. 1989; Headland & Reid 1989)")
_TEMPERATE_FOREST = _d("acorns and other nuts, berries, roots, seeds", "deer, wild boar, small game, river fish", "medium",
                       "Nut-rich forests supported dense foragers (acorns, hazel); the Mesolithic of Europe")
_TAIGA = _d("berries, a few roots", "moose, caribou, hare, fish, waterfowl", "low", "Binford: plant share very low at low effective temperature")
_SAVANNA = _d("tubers, seeds, mongongo and other nuts, fruit, honey", "large game (antelope, zebra, buffalo), small game", "medium",
              "!Kung: mongongo nuts about half the vegetable food (Lee 1979)")
_SHRUBLAND = _d("seeds, nuts (pinyon), roots, tubers", "rabbits, rodents, lizards, antelope", "high",
                "Great Basin and Australian arid foragers: seed grinding; low-density, mobile")
_GRASSLAND = _d("grass seeds, roots, bulbs", "bison, horse, antelope and other grazers", "medium",
                "Plains and steppe: herds, with fat and meat the keystone")
_TUNDRA = _d("berries, roots (little)", "caribou or reindeer, musk ox, fish, seals and whales on the coast", "low",
             "Arctic foragers depend on animals and fish; plants are a trace (Binford 2001)")

BIOME_DIETS: dict[int, ForagerDiet] = {
    1: _TROPICAL_FOREST,
    2: _TROPICAL_FOREST,
    3: _d("wild tubers and yams, seeds, nuts, fruit, honey", "game (deer, pigs, antelope), small game, fish", "high", "Dry tropical forest: tubers more available than in wet forest"),
    4: _TEMPERATE_FOREST,
    5: _d("pine nuts, berries, roots", "deer, elk, small game, river fish and salmon where runs exist", "medium"),
    6: _TEMPERATE_FOREST,
    7: _TEMPERATE_FOREST,
    8: _d("berries, nuts, roots", "deer, elk, moose, fish", "low"),
    9: _d("berries, roots", "moose, deer, hare, fish", "low"),
    10: _TAIGA,
    11: _TAIGA,
    12: _SAVANNA,
    13: _SHRUBLAND,
    14: _SHRUBLAND,
    15: _d("acorns, bulbs, seeds, berries", "deer, rabbits, shellfish and fish on the coast", "high",
           "California: acorn-based, among the densest forager populations (Kelly 2013)"),
    16: _d("acorns, bulbs, roots, seeds", "deer, small game", "medium"),
    17: _d("berries, pine nuts", "reindeer or caribou, moose, fish", "low"),
    18: _d("berries, roots", "caribou, moose, fish, waterfowl", "low"),
    19: _d("grass seeds, tubers, fruit", "large grazers, small game", "medium"),
    20: _GRASSLAND,
    21: _d("seeds, tubers, desert fruit, water-storing roots", "small game, lizards, occasional large game", "high",
           "Arid foragers (Australian desert, Kalahari) lived on seeds and small game; very low density"),
    22: _d("grass seeds, roots", "horse, bison, reindeer, mammoth (Pleistocene)", "low", "Ice-age mammoth steppe: large-game foragers"),
    23: _TUNDRA,
    24: _TUNDRA,
    25: _TUNDRA,
    26: _TUNDRA,
    27: _d("", "sea mammals, fish or little at all", "none", "Barren ground: marine foods or nothing"),
    28: _d("", "", "none", "Land ice: no people"),
}

COASTAL = _d("seaweed", "fish, shellfish, sea mammals, seabirds", "low",
             "Where a cell meets the sea, aquatic foods can be the staple (the Pacific Northwest, the Arctic, Tierra del Fuego); Kelly 2013, Binford 2001")
