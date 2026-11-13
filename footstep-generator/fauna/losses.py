"""The small cited table of regional extinction and extirpation dates (ka BP, calibrated).

PHYLACINE has no extinction dates (only the status code EP = extinct in prehistory), so every date
here comes from the literature. `Basis.DATED` entries were checked against search summaries of the
cited paper's abstract in this session where the source says "checked"; the others are recalled
and marked "recalled". None was read from the paper's tables. Anything not listed falls to
`timing.REGIONAL_DEFAULT`, which is a guess about a window, not a date.

Order inside a species matters: the first Loss whose boxes hold the cell wins, so put refugia and
other small boxes first and the catch-all (boxes None) last.
"""

from __future__ import annotations

from fauna.timing import NEVER_KA, Basis, Box, Loss, year_to_last_ka

D, H, R, C = Basis.DATED, Basis.HISTORIC, Basis.REGIONAL, Basis.RANGE_CUT

# Boxes. Cells are 1 degree, centres at .5; a box holds a cell when its centre is inside.
WRANGEL: tuple[Box, ...] = ((178.0, 180.0, 70.0, 72.0), (-180.0, -175.0, 70.0, 72.0))  # straddles 180
ST_PAUL: tuple[Box, ...] = ((-171.0, -169.0, 56.0, 58.0),)
EUROPE_W: tuple[Box, ...] = ((-15.0, 40.0, 34.0, 72.0),)
BRITAIN: tuple[Box, ...] = ((-8.0, 2.0, 50.0, 59.0),)
URALS_W_SIBERIA: tuple[Box, ...] = ((55.0, 100.0, 50.0, 70.0),)
NORTH_AMERICA: tuple[Box, ...] = ((-170.0, -50.0, 7.0, 84.0),)
EURASIA_N: tuple[Box, ...] = ((-15.0, 180.0, 36.0, 90.0),)
CUBA_HISPANIOLA: tuple[Box, ...] = ((-86.0, -68.0, 17.0, 24.0),)
MADAGASCAR: tuple[Box, ...] = ((43.0, 51.0, -26.0, -11.0),)
SOUTH_AMERICA: tuple[Box, ...] = ((-92.0, -30.0, -57.0, 7.0),)
AFRICA: tuple[Box, ...] = ((-20.0, 34.0, -35.0, 37.5), (34.0, 52.0, -35.0, 13.0))
SAHUL: tuple[Box, ...] = ((112.0, 155.0, -45.0, -9.0), (130.0, 152.0, -11.0, 1.0))

NA_DEFAULT_SRC = "Faith & Surovell 2009 PNAS 106:20641 (13.8-11.4 cal ka window, midpoint)"

# species -> losses. Genus-wide entries are expanded by `for_species` (key "Genus_*").
LOSSES: dict[str, tuple[Loss, ...]] = {
    "Mammuthus_primigenius": (
        Loss(4.0, D, "Wrangel Island last population, Vartanyan et al. 1993 Nature 362:337 (checked: ~4,000 years ago)", WRANGEL, refugium=True),
        Loss(5.6, D, "St Paul Island, Graham et al. 2016 PNAS 113:9310 (checked: ~5,600 years ago)", ST_PAUL, refugium=True),
        Loss(14.0, D, "Europe: recalled, last records roughly 14-13 ka; low confidence", EUROPE_W),
        Loss(10.5, D, "Mainland Siberia and North America: last records ~10-11 ka (Stuart et al. 2002 Nature 415:911; Dalen et al. 2021 QSR); recalled"),
    ),
    "Coelodonta_antiquitatis": (
        Loss(14.0, D, "Stuart & Lister 2012 QSR 51:1: youngest accepted date 14,040 cal BP (checked, second-hand); Kuzmin 2010 argues later in the Urals"),
    ),
    "Ursus_spelaeus": (
        Loss(27.8, D, "Pacher & Stuart 2009 Boreas 38:189: Alps ~24 14C ka = ~27.8 cal ka (checked); elsewhere may be later"),
    ),
    "Panthera_spelaea": (
        Loss(14.0, D, "Stuart & Lister 2011 QSR 30:1883: latest Eurasian date ~14.1 ka (checked); Alaska/Yukon ~13.3-13.8 ka"),
    ),
    "Megaloceros_giganteus": (
        Loss(7.7, D, "West Siberia, Stuart et al. 2004 Nature 431:684: ~6.9 14C ka = ~7.7 cal ka (checked)", URALS_W_SIBERIA),
        Loss(11.0, D, "Europe: youngest finds ~12 ka (Stuart et al. 2004, checked); 11.0 is a round-down, recalled"),
    ),
    "Elasmotherium_sibiricum": (
        Loss(39.0, D, "Kosintsev et al. 2019 Nat Ecol Evol 3:31: survived until at least 39 ka (checked)"),
    ),
    "Homotherium_latidens": (
        Loss(28.0, D, "Paijmans et al. 2017 Curr Biol 27:3330: North Sea specimen ~28 ka; recalled"),
    ),
    "Hippopotamus_amphibius": (
        Loss(NEVER_KA, C, "PHYLACINE's natural range reaches Europe; hippos lived there only in warm interglacials, last before ~115 ka", EUROPE_W),
    ),
    "Elephas_antiquus": (
        Loss(30.0, D, "Straight-tusked elephant: last mainland Europe ~30 ka, youngest Iberian footprints ~28 ka (secondary summaries, not the primary papers)"),
    ),
    "Stephanorhinus_kirchbergensis": (
        Loss(40.0, D, "Youngest reliable dates ~40 ka (Altai jaw; secondary summary of a recent Russian study)"),
    ),
    "Stephanorhinus_hemitoechus": (
        Loss(40.0, D, "Last records ~41-40 ka (Italy, Bulgaria; secondary summary)"),
    ),
    "Diprotodon_optatum": (
        Loss(44.0, D, "Johnson et al. 2016 Proc R Soc B (23 reliable dates, none younger than ~44 ka); Head & Field argue 28-30 ka"),
    ),
    "Equus_hydruntinus": (
        Loss(4.0, D, "European wild ass: late survivors to ~4 ka in SE Europe/Anatolia; recalled (Crees & Turvey 2015?), low confidence"),
    ),
    # Extant species that lost a region. Their present-natural range counts them there; these cut it.
    "Equus_ferus": (
        Loss(NEVER_KA, C, "PHYLACINE draws wild horses over every continent (its counterfactual includes the domestic horse); wild horses never lived in South America, Africa or Sahul", SOUTH_AMERICA + AFRICA + SAHUL),
        Loss(12.5, R, "Horses vanish from North America at the end of the last ice age: " + NA_DEFAULT_SRC + ". Permafrost DNA hints at later survivors in Yukon (~5.7 ka, Haile et al. 2009), disputed", NORTH_AMERICA),
    ),
    "Saiga_tatarica": (
        Loss(12.5, R, "Beringian saiga gone at the same time as North America's megafauna: " + NA_DEFAULT_SRC, NORTH_AMERICA),
    ),
    "Panthera_leo": (
        Loss(1.9, H, "Lions in Europe: gone from Greece by ~100 CE (Herodotus, Aristotle, Pausanias); recalled", EUROPE_W),
    ),
    "Crocuta_crocuta": (
        Loss(31.0, D, "Cave hyena in Eurasia: last records ~31 ka (Stuart & Lister); recalled, low confidence", EURASIA_N),
    ),
    # Extinct since written history (status EX): explicit, never the regional default.
    "Bos_primigenius": (
        Loss(3.5, D, "Britain: aurochs gone by the Bronze Age, ~3.5 ka; recalled", BRITAIN),
        Loss(year_to_last_ka(1627), H, "Last aurochs cow died in Jaktorow, Poland, 1627 CE"),
    ),
    "Hippotragus_leucophaeus": (Loss(year_to_last_ka(1800), H, "Bluebuck, extinct by about 1800 CE"),),
    "Rucervus_schomburgki": (Loss(year_to_last_ka(1938), H, "Schomburgk's deer, last captive 1938 CE: alive in 1900"),),
    "Sus_bucculentus": (Loss(year_to_last_ka(1892), H, "Vietnamese warty pig, known from 1892 specimens only; recalled"),),
    "Gazella_bilkis": (Loss(year_to_last_ka(1951), H, "Queen of Sheba's gazelle, last seen 1951 CE: alive in 1900"),),
    "Hippopotamus_lemerlei": (Loss(1.0, D, "Madagascar hippos: last ~1 ka (Burney et al. 2004; Crowley 2010); recalled", MADAGASCAR),),
    "Hippopotamus_madagascariensis": (Loss(1.0, D, "Madagascar hippos: last ~1 ka (Burney et al. 2004; Crowley 2010); recalled", MADAGASCAR),),
    # Island endemics: these must be explicit, the continental defaults mean nothing on an island.
    "Megalocnus_rodens": (Loss(4.4, D, "Caribbean ground sloths: gone ~4.4 ka, about 1,000 years after people (Steadman et al. 2005 PNAS 102:11763); recalled", CUBA_HISPANIOLA),),
    "Megalocnus_zile": (Loss(4.4, D, "Caribbean ground sloths: gone ~4.4 ka (Steadman et al. 2005); recalled", CUBA_HISPANIOLA),),
    "Parocnus_browni": (Loss(4.4, D, "Caribbean ground sloths: gone ~4.4 ka (Steadman et al. 2005); recalled", CUBA_HISPANIOLA),),
    "Parocnus_serus": (Loss(4.4, D, "Caribbean ground sloths: gone ~4.4 ka (Steadman et al. 2005); recalled", CUBA_HISPANIOLA),),
    "Mammuthus_exilis": (Loss(12.9, D, "Channel Islands pygmy mammoth, ~13 ka (Agenbroad); recalled"),),
    "Elephas_tiliensis": (Loss(4.4, D, "Tilos dwarf elephant, ~4.4 ka (Theodorou et al. 2007); recalled"),),
    "Elephas_cypriotes": (Loss(11.0, D, "Cyprus dwarf elephant and pygmy hippo, ~12-11 ka, tied to first people (Simmons); disputed; recalled"),),
    "Phanourios_minutes": (Loss(11.0, D, "Cyprus dwarf elephant and pygmy hippo, ~12-11 ka (Simmons); disputed; recalled"),),
    "Stegodon_florensis": (Loss(50.0, D, "Flores: Stegodon florensis insularis gone ~50 ka (Sutikna et al. 2016 Nature 532:366); recalled"),),
}

# Mediterranean island dwarfs with no date of their own: Late Pleistocene to early Holocene
# (the dates run from ~15 ka to ~4 ka). One shared guess, tagged REGIONAL.
ISLAND_GUESS = Loss(11.0, R, "Mediterranean island endemic: no species date; Late Pleistocene to early Holocene losses, midpoint")
ISLAND_GUESS_SPECIES = (
    "Candiacervus_major", "Candiacervus_dorothensis", "Candiacervus_rethymnensis", "Candiacervus_cretensis",
    "Praemegaceros_cazioti", "Elephas_mnaidriensis",
)
for _s in ISLAND_GUESS_SPECIES:
    LOSSES[_s] = (ISLAND_GUESS,)

# Island or island-like species PHYLACINE keeps but we cannot date even roughly (no timing = no claim).
EXCLUDED_NO_TIMING: dict[str, str] = {
    "Amblyrhiza_inundata": "Anguilla Bank giant rodent: no last-appearance date found; likely older than the series",
    "Stegodon_trigonocephalus": "Java/Sunda stegodont: no usable last date recalled",
    "Bubalus_grovesi": "Sulawesi dwarf buffalo: no usable last date recalled",
    "Bubalus_palaeokerabau": "Java buffalo: no usable last date recalled",
}


def losses_for(binomial: str) -> tuple[Loss, ...]:
    return LOSSES.get(binomial, ())
