"""Domestic animals: centres, first dates and spread fronts, each with a source.

Same conventions as crops.py. Sources: Larson & Fuller 2014 Annu Rev Ecol Evol Syst 45:115; Larson et al.
2014 PNAS 111:6139; Zeder 2008 PNAS 105:11597; Zeder et al. 2006 (eds.) Documenting Domestication.
Audit of 2026-11-19 (docs/ops/food.md, "Verification pass"): "checked" claims have their figure read in
the source's abstract or text, with a DOI or URL in `source`; a dated claim that is not checked says why
in `unverified=`; fronts and historic arrivals carry the default reason (model.NOT_VERIFIED_DEFAULT).
Animals reach islands and the Americas with people, so many fronts follow the human dispersals
(Austronesian, Bantu, Columbian exchange). Presence means the animal was kept, not that it was common.
"""

from __future__ import annotations

from food import regions as R
from food.exchange import CROSBY, old_world_to_americas
from food.model import Basis, Taxon, claim

D, H, F = Basis.DATED, Basis.HISTORIC, Basis.FRONT
LARSON = "Larson & Fuller 2014 Annu Rev Ecol Evol Syst 45:115 doi:10.1146/annurev-ecolsys-110512-135813"
ZEDER08 = "Zeder 2008 PNAS 105:11597 doi:10.1073/pnas.0801317105"



def _caprine_europe(what: str) -> tuple:
    """Sheep and goats travel with the Neolithic package into Europe (a little ahead of crops on the Mediterranean)."""
    return (
        claim(9.5, R.ANATOLIA_C, F, f"{what}: central Anatolia ~9.5 ka; recalled"),
        claim(8.7, R.GREECE_BALKANS, F, f"{what}: Greece and the Balkans ~8.7-8.5 ka; recalled"),
        claim(8.0, R.W_MEDITERRANEAN, F, f"{what}: Italy, S France, Iberia (Impressed/Cardial Ware) ~8-7.5 ka; {ZEDER08}, recalled"),
        claim(7.5, R.CENTRAL_EUROPE, F, f"{what}: LBK ~7.5 ka; recalled"),
        claim(7.0, R.ATLANTIC_FRANCE, F, f"{what}: Atlantic France ~7 ka; recalled"),
        claim(6.0, R.BRITAIN_IRELAND, F, f"{what}: Britain and Ireland ~6 ka; recalled"),
        claim(5.9, R.S_SCANDINAVIA, F, f"{what}: southern Scandinavia ~5.9 ka; recalled"),
        claim(4.0, R.N_FENNOSCANDIA, F, f"{what}: northern Fennoscandia, low confidence; recalled"),
    )


ANIMALS: tuple[Taxon, ...] = (
    Taxon("dog", "Dog", "animal", "companion", "Eurasia (uncertain; one or two centres)", (
        claim(14.5, R.EUROPE_ALL, D, "Bonn-Oberkassel dog burial 14,223 +- 58 years old (Janssens et al. 2018 J Archaeol Sci 92:126 doi:10.1016/j.jas.2018.01.004), ~15 ka in Perri et al. 2021 PNAS 118:e2010083118 doi:10.1073/pnas.2010083118; Frantz et al. 2016 Science 352:1228 doi:10.1126/science.aaf3161 (abstract): dogs may have been domesticated independently in East and West Eurasia; Bergstrom et al. 2020 Science 370:557 doi:10.1126/science.aba9572 (abstract): one origin from an extinct wolf population. The true date is probably older and the place is unknown; 14.5 ka is a round figure between the burial dates", origin=True, checked=True),
        claim(14.5, R.MONGOLIA, F, "dog: Siberia and Mongolia, an early dog lineage ~15-14 ka (assumed: Bergstrom et al. 2020 Science 370:557 doi:10.1126/science.aba9572 has ancient Siberian dog genomes, but its abstract gives no date for them; the table once cited it as Nature 579:92)"),
        claim(14.0, R.NORTH_CHINA, F, "dog: East Asia, Zhokhov/Jomon dogs ~9.5 ka but East Asian lineages older; recalled"),
        claim(14.0, R.NEAR_EAST, F, "dog: Natufian Levant dog burials ~12-14 ka; recalled"),
        claim(10.0, R.NA_WEST, D, "dog: Alaska and the west. Perri et al. 2021 PNAS doi:10.1073/pnas.2010083118 (text): the earliest confirmed dogs in the Americas are ~10 ka (Koster and Stilwell II, Illinois). Alaska: a Swan Point tibia ~12 ka (Lanoe et al. 2024, press only, domestic status unresolved) and a SE Alaska dog 10,150 cal BP (Lindqvist et al. 2021, snippet). The table had 11.0 ka",
              unverified="Alaskan dog dates come from press and snippets only; 10 ka is Perri 2021's earliest confirmed date, from eastern sites"),
        claim(10.0, R.NA_EAST, D, "dog: Koster and Stilwell II, Illinois, ~10 ka, 'the earliest confirmed archaeological dog remains' in the Americas, Perri et al. 2021 PNAS 118:e2010083118 doi:10.1073/pnas.2010083118 (text)", checked=True),
        claim(10.0, R.SW_US, D, "dog: Danger Cave and the Great Basin ~11-10 ka; recalled", unverified="Great Basin dog dates recalled; Perri 2021's earliest confirmed Americas date is ~10 ka at eastern sites"),
        claim(10.0, R.ANDES_C, F, "dog: South America ~9-10 ka (Peruvian Andes, Patagonia); recalled, low confidence"),
        claim(10.0, R.AMAZON, F, "dog: South America ~9-8 ka; recalled, low confidence"),
        claim(10.0, R.MESOAMERICA, F, "dog: Mesoamerica; recalled"),
        claim(8.0, R.EGYPT_NILE, F, "dog: Nile valley early Holocene; recalled, low confidence"),
        claim(6.0, R.AFRICA_ALL, F, "dog: Africa by ~6 ka (Sahara pastoralists); recalled, low confidence"),
        claim(4.0, R.SE_ASIA_MAINLAND, F, "dog: mainland SE Asia ~4 ka; recalled"),
        claim(4.0, R.ISLAND_SEA, F, "dog: Island SE Asia ~4 ka; recalled"),
        claim(3.35, R.AUSTRALIA, D, "dingo: directly dated bones from Madura Cave, Nullarbor, show dingoes in southern Australia 'by between 3348 and 3081 years ago', Balme et al. 2018 Sci Rep 8:9933 doi:10.1038/s41598-018-28324-x (abstract; the table cited it as Aust Archaeol and had 3.5 ka)", checked=True),
        claim(3.0, R.MELANESIA_W, F, "dog: Lapita ~3 ka; recalled"),
        claim(2.8, R.FIJI_SAMOA, F, "dog: Fiji/Samoa ~2.8 ka; recalled"),
        claim(1.2, R.POLYNESIA_E, F, "dog: eastern Polynesia; recalled"),
        claim(0.9, R.HAWAII, F, "dog: Hawaii; recalled"),
        claim(0.8, R.NEW_ZEALAND, F, "dog: New Zealand, with Polynesian settlers ~1300 CE; recalled"),
        claim(2.0, R.SOUTH_AFRICA, F, "dog: southern Africa ~2 ka with herders; recalled, low confidence"),
    ), "The dog's date and place are the least settled of any domesticate; dogs also spread with hunter-gatherers, not just farmers."),

    Taxon("sheep", "Sheep", "animal", "livestock", "Southeast Anatolia and the Zagros (Ovis orientalis)", (
        claim(10.5, R.NEAR_EAST, D, ZEDER08 + " (text): caprine management in SE Anatolia at ca. 10,500 BP; sheep and goats brought under domestication between the northern Zagros and SE Anatolia ca. 11,000-10,500 BP; possible sheep management in NE Iraq ~12,000 BP", origin=True, checked=True),
        claim(7.0, R.MAGHREB, F, "sheep and goats: Maghreb ~7.5-7 ka (Cardial influence in Morocco); recalled"),
        claim(6.0, R.ARABIA, F, "sheep and goats: Arabia ~6-5.5 ka; recalled"),
        claim(4.5, R.CENTRAL_ASIA_OASES, F, "sheep and goats: Central Asian oases and steppe ~5-4.5 ka; recalled"),
        claim(1.08, R.ICELAND, H, "sheep, goats, cattle, pigs, horses to Iceland with the Norse settlement, 874 CE; recalled"),
        *_caprine_europe("sheep"),
        claim(7.5, R.EGYPT_NILE, F, "sheep: Egypt/Nile and the Sahara ~7.5-7 ka; recalled"),
        claim(7.0, R.SAHARA, F, "sheep and goats: green Sahara pastoralism ~7 ka; recalled"),
        claim(8.0, R.IRAN_TURKMEN, F, "sheep: Iranian plateau ~9-8 ka; recalled"),
        claim(8.0, R.INDUS, D, "sheep: Mehrgarh ~8 ka; recalled", unverified="Mehrgarh animal dates (Meadow) are in books; no abstract found"),
        claim(6.0, R.KAZAKH_STEPPE, F, "sheep: Central Asian steppe ~6-5 ka; recalled"),
        claim(5.0, R.NW_CHINA, D, "sheep: Gansu ~5.6-4.5 ka (Dodson; Flad); recalled", unverified="the Dodson and Flad papers found (doi:10.1016/j.quascirev.2013.04.021, doi:10.1177/0959683609358914) are about wheat; no sheep date was read"),
        claim(4.5, R.MONGOLIA, F, "sheep: Mongolia ~4.5 ka (Afanasievo, Chemurchek); recalled"),
        claim(4.0, R.NORTH_CHINA, F, "sheep: north China ~4.5-4 ka; recalled"),
        claim(4.5, R.TURKANA, D, "sheep and goats: Lake Turkana ~4.5 ka with cattle (Gifford-Gonzalez); recalled", unverified="Turkana herder dates (Gifford-Gonzalez, Marshall) recalled; no source read"),
        claim(3.0, R.ETHIOPIA, F, "sheep: Ethiopian highlands ~4-3 ka; recalled"),
        claim(2.2, R.KHOE_CAPE, D, "sheep: Namibia and the Western Cape ~2.1-2 ka, brought by Khoe herders (Sadr 2008); recalled", unverified="Sadr 2008 recalled; no source read"),
        claim(1.7, R.SOUTH_AFRICA, F, "sheep: eastern South Africa ~1.7 ka; recalled"),
        claim(1.5, R.MADAGASCAR, F, "sheep: Madagascar; recalled, low confidence"),
        *old_world_to_americas(what="sheep", australia=0.16),
    ), ""),

    Taxon("goat", "Goat", "animal", "livestock", "Zagros mountains (Capra aegagrus)", (
        claim(10.2, R.NEAR_EAST, D, "Zeder & Hesse 2000 Science 287:2254 doi:10.1126/science.287.5461.2254 (abstract): initial goat domestication in the Zagros highlands of western Iran at 10,000 cal BP; " + ZEDER08 + " (text): sheep and goats domesticated ca. 11,000-10,500 BP between the northern Zagros and SE Anatolia. 10.2 ka sits between them", origin=True, checked=True),
        claim(1.08, R.ICELAND, H, "goats to Iceland, 874 CE; recalled"),
        *_caprine_europe("goat"),
        claim(7.5, R.EGYPT_NILE, F, "goat: Nile ~7.5-7 ka; recalled"),
        claim(7.0, R.SAHARA, F, "goat: green Sahara ~7 ka; recalled"),
        claim(8.0, R.IRAN_TURKMEN, F, "goat: Iranian plateau; recalled"),
        claim(8.0, R.INDUS, D, "goat: Mehrgarh ~8-9 ka; recalled", unverified="Mehrgarh animal dates (Meadow) are in books; no abstract found"),
        claim(5.0, R.NW_CHINA, F, "goat: Gansu ~5 ka; recalled"),
        claim(4.0, R.NORTH_CHINA, F, "goat: north China ~4 ka; recalled"),
        claim(4.5, R.TURKANA, F, "goat: Lake Turkana ~4.5 ka; recalled"),
        claim(3.0, R.ETHIOPIA, F, "goat: Ethiopia ~4-3 ka; recalled"),
        claim(2.2, R.KHOE_CAPE, F, "goat: southern Africa ~2 ka; recalled"),
        claim(1.7, R.SOUTH_AFRICA, F, "goat: South Africa with Bantu farmers ~1.7 ka; recalled"),
        *old_world_to_americas(what="goat", australia=0.16),
    ), ""),

    Taxon("cattle", "Cattle (taurine)", "animal", "livestock", "Upper Euphrates / SE Anatolia (from the aurochs); African taurines contested", (
        claim(10.3, R.NEAR_EAST, D, "Bos taurus: initially domesticated 'somewhere in the upper Euphrates Valley between ca. 11,000 and 10,000 B.P.' (" + ZEDER08 + ", text); " + LARSON + " (text): sheep, goats and cattle between 10,500 and 10,000 BP. The site is unsettled (Cafer Hoyuk, Cayonu): Cayonu has small 'domestic' cattle only in the middle PPNB (Arbuckle & Kassebaum, https://pmc.ncbi.nlm.nih.gov/articles/PMC8214434)", origin=True, checked=True),
        claim(7.0, R.MAGHREB, F, "cattle: Maghreb ~7 ka; recalled"),
        claim(5.5, R.ARABIA, F, "cattle: Arabia ~6-5.5 ka; recalled, low confidence"),
        claim(4.5, R.CENTRAL_ASIA_OASES, F, "cattle: Central Asia ~5-4.5 ka; recalled"),
        claim(1.08, R.ICELAND, H, "cattle to Iceland, 874 CE; recalled"),
        *_caprine_europe("cattle"),
        claim(8.0, R.SAHARA, D, "cattle: Nabta Playa and the eastern Sahara ~8-7.5 ka (Wendorf & Schild); contested, perhaps wild Bos in the early dates; Sahara pastoralism ~7 ka is better supported. Recalled, low confidence", origin=True,
              unverified="Wendorf & Schild's Nabta dates are in books; Pitt et al. 2019 Evol Appl 12:123 doi:10.1111/eva.12674 only says an Egyptian Western Desert taurine domestication 'has also been proposed'"),
        claim(7.0, R.EGYPT_NILE, F, "cattle: Egypt/Nile ~7 ka; recalled"),
        claim(8.0, R.IRAN_TURKMEN, F, "cattle: Iranian plateau ~8 ka; recalled"),
        claim(6.0, R.PONTIC_CASPIAN, F, "cattle: Pontic steppe ~6-5.5 ka with Yamnaya-era herds; recalled"),
        claim(5.0, R.NW_CHINA, F, "cattle: Gansu/Henan ~5-4.5 ka; recalled"),
        claim(4.5, R.NORTH_CHINA, F, "cattle: north China ~4.5-5 ka; recalled"),
        claim(4.5, R.TURKANA, D, "cattle: Lake Turkana ~4.5 ka (Gifford-Gonzalez; Marshall); recalled", unverified="Turkana herder dates (Gifford-Gonzalez, Marshall) recalled; no source read"),
        claim(3.0, R.ETHIOPIA, F, "cattle: Ethiopian highlands ~4-3 ka; recalled"),
        claim(2.0, R.GREAT_LAKES, F, "cattle: Great Lakes ~2.5-2 ka, with Bantu and Nilotic herders; recalled"),
        claim(1.8, R.ZAMBEZI, F, "cattle: Zambezi ~1.8 ka; Bantu expansion; recalled"),
        claim(1.65, R.SOUTH_AFRICA, F, "cattle: South Africa ~1.7-1.65 ka with Bantu-speaking farmers (Early Iron Age); recalled"),
        claim(1.5, R.MADAGASCAR, F, "zebu cattle: Madagascar ~1.5-1 ka; recalled"),
        *old_world_to_americas(what="cattle", australia=0.16),
    ), "African cattle may include a local aurochs domestication (Pitt et al. 2019 Evol Appl 12:123 doi:10.1111/eva.12674); the early Sahara dates are the weakest."),

    Taxon("zebu", "Zebu (humped cattle)", "animal", "livestock", "Indus valley and Baluchistan (Bos indicus, from the Indian aurochs)", (
        claim(8.0, R.INDUS, D, "Bos indicus: the Indus Valley is the most likely centre of the I1 haplogroup and 'a primary center of zebu domestication' (Chen et al. 2010 Mol Biol Evol 27:1 doi:10.1093/molbev/msp213, abstract); domesticated there between 9,000 and 7,000 BP, possibly instead by introgression of wild zebu into taurine cattle (" + LARSON + ", text). Mehrgarh ~8 ka (Meadow) is inside that range", origin=True, checked=True),
        claim(5.0, R.NW_INDIA, F, "zebu: Gujarat and the plains ~5 ka; recalled"),
        claim(4.5, R.GANGES_E, F, "zebu: Ganges ~4.5 ka; recalled"),
        claim(4.0, R.SOUTH_INDIA, F, "zebu: South India ~4 ka; recalled"),
        claim(4.0, R.IRAN_TURKMEN, F, "zebu: Iranian plateau ~4 ka (Bronze Age); recalled"),
        claim(3.5, R.ARABIA, F, "zebu: Arabia and the Gulf ~3.5-3 ka; recalled, low confidence"),
        claim(3.0, R.ETHIOPIA, F, "zebu: Horn of Africa ~3 ka onward, mixing with taurines; recalled, low confidence"),
        claim(1.3, R.EAST_COAST, F, "zebu: East African coast ~1.3-1 ka; recalled"),
        claim(1.2, R.MADAGASCAR, F, "zebu: Madagascar ~1.2 ka; recalled"),
        claim(1.5, R.SE_ASIA_MAINLAND, F, "zebu: mainland SE Asia, first millennium CE; recalled, low confidence"),
        claim(0.08, R.LATIN_AMERICA, H, "zebu to Brazil from the 1870s CE (Indian imports); recalled"),
    ), ""),

    Taxon("pig", "Pig", "animal", "livestock", "Southeast Anatolia (Cayonu) and, separately, China", (
        claim(10.3, R.NEAR_EAST, D, "Sus scrofa: 'first domesticated somewhere in southeastern Anatolia by 10,500-10,000 B.P.' (" + ZEDER08 + ", text); the Cayonu pigs sit between wild and domestic (Ervynck et al. 2001 Paleorient 27:47, abstract as read by a research agent)", origin=True, checked=True),
        claim(7.0, R.MAGHREB, F, "pig: North Africa (little; Muslim-era decline); recalled, low confidence"),
        claim(1.08, R.ICELAND, H, "pigs to Iceland, 874 CE; recalled"),
        claim(8.5, R.NORTH_CHINA, D, "pig: domestic pigs at Jiahu, Henan, 'from at least 6600 BC cal' (8.6 ka), Cucchi et al. 2011 J Archaeol Sci 38:11 doi:10.1016/j.jas.2010.07.024 (abstract as quoted at https://abdn.elsevierpure.com/en/publications/early-neolithic-pig-domestication-at-jiahu-henan-province-china-c/; the table cited it as PNAS); Larson et al. 2005 Science 307:1618 doi:10.1126/science.1106927 (abstract): multiple centres of pig domestication across Eurasia", origin=True, checked=True),
        claim(8.5, R.YANGTZE, F, "pig: Yangtze ~8-7 ka; recalled"),
        claim(8.7, R.GREECE_BALKANS, F, "pig: Greece and the Balkans ~8.7 ka; recalled"),
        claim(8.0, R.W_MEDITERRANEAN, F, "pig: western Mediterranean ~8-7.5 ka; recalled"),
        claim(7.5, R.CENTRAL_EUROPE, F, "pig: LBK; a local wild-boar domestication took over European pigs by ~4-3 ka (Larson et al. 2007 PNAS 104:15276 doi:10.1073/pnas.0703411104, abstract: Near Eastern pigs reached the Paris Basin by the early 4th millennium BC and European wild boar were domesticated by then); recalled"),
        claim(7.0, R.ATLANTIC_FRANCE, F, "pig: Atlantic France; recalled"),
        claim(6.0, R.BRITAIN_IRELAND, F, "pig: Britain and Ireland ~6 ka; recalled"),
        claim(5.9, R.S_SCANDINAVIA, F, "pig: southern Scandinavia ~5.9 ka; recalled"),
        claim(8.0, R.IRAN_TURKMEN, F, "pig: Iran and Central Asia; recalled, low confidence"),
        claim(4.5, R.SOUTH_CHINA, F, "pig: South China ~5 ka; recalled"),
        claim(4.5, R.SE_ASIA_MAINLAND, F, "pig: mainland SE Asia ~4.5-4 ka; recalled"),
        claim(4.0, R.ISLAND_SEA, F, "pig: Island SE Asia ~4 ka (Wallacea, Flores); recalled"),
        claim(3.2, R.MELANESIA_W, D, "pig: Lapita ~3.2-3 ka; Larson et al. 2007 Pacific pigs from a Vietnam/Southeast Asian source; recalled", unverified="Lapita pig dates and the Larson 2007 Pacific paper were not read"),
        claim(3.0, R.NEW_GUINEA, D, "pig: New Guinea ~3.5-3 ka (earlier claims at Kuk ~10 ka are not accepted); recalled, low confidence", unverified="New Guinea pig dates recalled; no source read"),
        claim(2.8, R.FIJI_SAMOA, F, "pig: Fiji/Samoa ~2.8 ka; recalled"),
        claim(1.2, R.POLYNESIA_E, F, "pig: eastern Polynesia ~1.2 ka; recalled"),
        claim(0.9, R.HAWAII, F, "pig: Hawaii; recalled"),
        claim(1.5, R.AFRICA_ALL, F, "pig: North Africa and the Mediterranean coast only in practice (Muslim areas limited), Congo basin by ~2 ka; recalled, low confidence"),
        claim(0.47, R.CARIBBEAN, H, "pig: Hispaniola, 1493 CE (Columbus's second voyage); recalled"),
        claim(0.43, R.LATIN_AMERICA, H, "pig to mainland Spanish America by ~1520 CE; " + CROSBY),
        claim(0.34, R.NA_EAST, H, "pig to eastern North America (De Soto 1539 CE in the southeast; English colonies 1607); recalled"),
        claim(0.16, R.AUSTRALIA, H, "pig to Australia, 1788 CE"),
        claim(0.2, R.NA_WEST, H, "pig to western North America with the Spanish missions and settlers, 1700s CE; recalled"),
    ), "Pigs reached New Zealand only with Cook (1769 CE), so there is no pre-contact claim there."),

    Taxon("horse", "Horse", "animal", "livestock", "Western Eurasian steppe (Botai ~5.5 ka; the modern lineage from the Don-Volga ~4.2 ka)", (
        claim(5.5, R.KAZAKH_STEPPE, D, "Outram et al. 2009 Science 323:1332 doi:10.1126/science.1168594 (abstract): horse domestication (metacarpal metrics, bridle wear, mare's milk residues) in the Eneolithic Botai culture of Kazakhstan, about 3500 BCE. These horses are NOT ancestors of modern horses (Gaunitz et al. 2018 Science 360:111 doi:10.1126/science.aao3297, abstract)", origin=True, checked=True),
        claim(1.08, R.ICELAND, H, "horses to Iceland, 874 CE (the Icelandic horse); recalled"),
        claim(3.0, R.SIBERIA_BELT, F, "horse: southern Siberia and the Altai ~3 ka (Pazyryk ~2.5 ka); recalled"),
        claim(3.0, R.MAGHREB, F, "horse: Maghreb ~3 ka (Carthaginian and Numidian horses); recalled"),
        claim(4.2, R.PONTIC_CASPIAN, D, "Librado et al. 2021 Nature 598:634 doi:10.1038/s41586-021-04018-9 (abstract): modern domestic horses come from the Western Eurasian steppes, especially the lower Volga-Don, and replaced almost all other populations as they expanded across Eurasia 'from about 2000 bc'. 4.2 ka (~2200 BCE) is the homeland date as given in news coverage of the paper, within 200 years of the abstract's figure", origin=True, checked=True),
        claim(4.0, R.UKRAINE, F, "horse: Ukraine and the Carpathian basin ~4.2-4 ka; recalled"),
        claim(3.8, R.CENTRAL_EUROPE, F, "horse: Bell Beaker/Corded Ware Europe ~4.5-3.8 ka; Librado 2021 shows the DOM2 spread after ~4 ka; recalled"),
        claim(3.8, R.NEAR_EAST, D, "horse: Near East and Anatolia, chariot era ~4-3.8 ka (Kikkuli, Hittite horse manual ~3.4 ka); recalled", unverified="chariot-era horse dates recalled; no source read"),
        claim(3.5, R.EGYPT_NILE, D, "horse: Egypt via the Hyksos ~3.7-3.5 ka (1650-1550 BCE); recalled", unverified="Hyksos-era dates recalled; no source read"),
        claim(3.5, R.IRAN_TURKMEN, F, "horse: Iran and Central Asia ~3.8-3.5 ka; recalled"),
        claim(3.5, R.W_MEDITERRANEAN, F, "horse: Iberia and Italy ~4-3.5 ka (Bell Beaker horses debated); recalled, low confidence"),
        claim(3.5, R.ATLANTIC_FRANCE, F, "horse: France ~3.5 ka; recalled"),
        claim(3.0, R.BRITAIN_IRELAND, F, "horse: Britain and Ireland ~3.5-3 ka (Bronze Age); recalled"),
        claim(3.5, R.S_SCANDINAVIA, F, "horse: southern Scandinavia ~3.5 ka (Bronze Age); recalled"),
        claim(3.3, R.NORTH_CHINA, D, "horse: Anyang, Shang China ~3.3 ka (1250 BCE), chariot burials; recalled", unverified="Anyang chariot-burial date recalled; no source read"),
        claim(3.5, R.NW_CHINA, F, "horse: northwest China ~3.5 ka; recalled"),
        claim(3.5, R.MONGOLIA, F, "horse: Mongolia ~3.5-3.2 ka (Deer Stone culture); recalled"),
        claim(3.0, R.NW_INDIA, F, "horse: India ~3.5-3 ka (Vedic-era), horses scarce in the monsoon belt; recalled, low confidence"),
        claim(2.7, R.KOREA_JAPAN, F, "horse: Korea ~2.5 ka, Japan ~1.7-1.6 ka (Kofun era); recalled"),
        claim(3.0, R.ETHIOPIA, F, "horse: the Horn of Africa and Nubia ~3.5-3 ka; recalled, low confidence"),
        claim(2.5, R.SAHEL_E, F, "horse: Nubia and Sudan ~2.7 ka (Kushite horses); recalled"),
        claim(1.5, R.SAHEL_W, F, "horse: West African Sahel ~1.5-1 ka (the West African horse trade); recalled, low confidence"),
        claim(0.47, R.CARIBBEAN, H, "horse: Hispaniola, 1493 CE (Columbus's second voyage); recalled"),
        claim(0.43, R.LATIN_AMERICA, H, "horse to the mainland: Cortes brought 16 horses to Mexico in 1519 CE; " + CROSBY),
        claim(0.35, R.SW_US, H, "horse: New Mexico 1598 CE (Onate); Plains peoples adopted horses ~1680-1750 CE after the Pueblo revolt, which dispersed Spanish stock; recalled"),
        claim(0.34, R.NA_EAST, H, "horse to eastern North America (De Soto 1539 CE; English colonies 1607); recalled"),
        claim(0.25, R.NA_WEST, H, "horse: Great Plains and Great Basin ~1700 CE; recalled"),
        claim(0.16, R.AUSTRALIA, H, "horse to Australia, 1788 CE"),
        claim(0.4, R.SOUTH_CONE, H, "horse: Pampas and Patagonia, feral horses from Buenos Aires 1536/1580 CE; recalled"),
        claim(0.16, R.SOUTH_AFRICA, H, "horse to the Cape, 1653 CE; recalled"),
    ), "Wild horses lived in Eurasia and, until ~12 ka, in the Americas; domestic horses were absent from the Americas until 1493 CE."),

    Taxon("donkey", "Donkey", "animal", "pack", "Africa (a single domestication ~5000 BCE; the place in Africa is unresolved, northeast Africa here)", (
        claim(7.0, (R.EGYPT_NILE, R.ETHIOPIA), D, "Todd et al. 2022 Science 377:1172 doi:10.1126/science.abo3503 (abstract): modern donkey genomes support a single domestication in Africa ~5000 BCE (7 ka). The abstract does not say where, so the two northeast African boxes (Nile, Horn) stand for it. Rossel et al. 2008 PNAS 105:3715 doi:10.1073/pnas.0709692105 (abstract): ~5,000-year-old ass skeletons at Abydos, Egypt, the earliest evidence of transport use. The table had 6.0 ka and Egypt only", origin=True, checked=True),
        claim(5.0, R.SAHARA, F, "donkey: the Sahara and Sahel ~5-4.5 ka; recalled"),
        claim(5.0, R.NEAR_EAST, F, "donkey: Mesopotamia and the Levant ~5.5-5 ka (Uruk, Maadi); recalled"),
        claim(4.5, R.IRAN_TURKMEN, F, "donkey: Iran ~5 ka (caravan trade); recalled"),
        claim(4.5, R.INDUS, F, "donkey: Indus ~4.5 ka; recalled"),
        claim(3.5, R.W_MEDITERRANEAN, F, "donkey: Iberia and Italy ~3.5 ka (Bronze Age); recalled"),
        claim(3.0, R.GREECE_BALKANS, F, "donkey: Greece ~3.5-3 ka; recalled"),
        claim(2.5, R.ATLANTIC_FRANCE, F, "donkey: France ~2.5 ka; recalled"),
        claim(2.0, R.BRITAIN_IRELAND, F, "donkey: Britain with the Romans ~2 ka; recalled"),
        claim(3.5, R.ETHIOPIA, F, "donkey: Ethiopia and the Horn ~4-3.5 ka; recalled"),
        claim(3.5, R.NORTH_CHINA, F, "donkey: China ~3.5-2.5 ka (Han trade); recalled, low confidence"),
        claim(2.5, R.NW_CHINA, F, "donkey: northwest China ~2.5 ka; recalled"),
        claim(1.0, R.TURKANA, F, "donkey: East Africa ~2 ka; recalled, low confidence"),
        claim(0.46, R.CARIBBEAN, H, "donkey: Hispaniola 1495 CE; recalled"),
        *old_world_to_americas(what="donkeys and mules"),
    ), ""),

    Taxon("dromedary", "Dromedary camel", "animal", "pack", "Southeast Arabian Peninsula", (
        claim(3.0, R.ARABIA_SE, D, "Almathen et al. 2016 PNAS 113:6707 doi:10.1073/pnas.1519508113 (abstract): wild dromedaries from the southeast Arabian Peninsula among the founders of the domestic gene pool; text (https://pmc.ncbi.nlm.nih.gov/articles/PMC4914195/): domestication 'likely happened in the late second millennium BCE', with camel bones shrinking ca. 1100-800 BCE; " + LARSON + " (text): from ca. 3000 BP. Camel bones at Ra's al-Hadd dated 2890-2580 BC (Curci 2014, snippet) are not shown to be domestic. The table had 3.5 ka", origin=True, checked=True),
        claim(3.0, R.ARABIA, F, "dromedary: across Arabia, the incense trade ~3.3-3 ka; recalled"),
        claim(3.0, R.NEAR_EAST, F, "dromedary: the Levant ~3 ka (Iron Age; a cause of the biblical anachronism debate, Sapir-Hen & Ben-Yosef 2013); recalled"),
        claim(2.7, R.IRAN_TURKMEN, F, "dromedary: Iran ~2.7 ka; recalled"),
        claim(2.5, R.EGYPT_NILE, F, "dromedary: Egypt ~2.5 ka (Persian conquest 525 BCE); recalled"),
        claim(2.0, R.NW_INDIA, F, "dromedary: Indus and Rajasthan ~2.5-2 ka; recalled, low confidence"),
        claim(2.0, R.SAHARA, F, "dromedary: the Sahara ~2 ka (Roman era), trans-Saharan trade by ~1.5 ka; recalled"),
        claim(2.5, R.ETHIOPIA, F, "dromedary: Horn of Africa; recalled, low confidence"),
        claim(1.2, R.SAHEL_W, F, "dromedary: West African Sahel ~1.3-1 ka; recalled"),
        claim(1.5, R.TURKANA, F, "dromedary: Kenya and the Horn pastoralists ~1.5 ka; recalled, low confidence"),
        claim(0.17, R.AUSTRALIA, H, "dromedary to Australia, 1840 CE (imported for the outback); recalled"),
    ), "Camel losses (the Levant and the Sahara dry out) are not modelled."),

    Taxon("bactrian", "Bactrian camel", "animal", "pack", "Central Asia (northern Iran / Turkmenistan, doubted; the region is debated)", (
        claim(4.8, R.IRAN_TURKMEN, D, "Bactrian camel domestication 'in the late fourth and early third millennium before common era' (5.3-4.8 ka), Burger et al. 2019 Anim Genet 50:598 doi:10.1111/age.12858 (text, PMC6899786); 'the regions of domestication, however, are still a matter of debate', and an eastern Iran/Turkmenistan centre is doubted (Peters 1998, via a search summary)", origin=True,
              unverified="the date is supported (Burger 2019) but the place is not: the Iran/Turkmenistan box comes from older literature that later work doubts"),
        claim(4.0, R.KAZAKH_STEPPE, F, "Bactrian: Kazakh steppe and Bactria-Margiana ~4 ka; recalled"),
        claim(3.5, R.NW_CHINA, F, "Bactrian: Xinjiang and Gansu ~3.5-3 ka; recalled"),
        claim(3.0, R.MONGOLIA, F, "Bactrian: Mongolia ~3 ka; recalled"),
        claim(2.5, R.NORTH_CHINA, F, "Bactrian: north China, the Silk Road ~2.2 ka; recalled"),
        claim(2.5, R.NEAR_EAST, F, "Bactrian: Anatolia and the Near East ~2.5 ka (Assyrian reliefs); recalled"),
        claim(2.2, R.PONTIC_CASPIAN, F, "Bactrian: Black Sea steppe ~2 ka; recalled, low confidence"),
    ), ""),

    Taxon("llama", "Llama and alpaca", "animal", "pack", "Central Andes (puna of Peru; llama from guanaco, alpaca from vicuna)", (
        claim(6.0, R.ANDES_C, D, "Kadwell et al. 2001 Proc R Soc B 268:2575 doi:10.1098/rspb.2001.1774 (abstract): alpaca linked to the vicuna, 'dating domestication to 6000-7000 years before present in the Peruvian Andes'; " + LARSON + " (text): llamas and alpacas domesticated from 6,000-5,000 BP (Mengoni Goñalons 2008). Llama date and place less certain", origin=True, checked=True),
        claim(4.0, R.ANDES_S, F, "llama: NW Argentina and N Chile ~4-3 ka; recalled"),
        claim(2.5, R.ANDES_N, F, "llama: Ecuador and Colombia ~2.5-2 ka; recalled, low confidence"),
        claim(1.2, R.SOUTH_CONE, F, "llama: Atacama coast and Chile; recalled, low confidence"),
    ), "Llamas never reached the lowland tropics or North America before 1492, which is why the Americas had no draught animals."),

    Taxon("guinea_pig", "Guinea pig (cuy)", "animal", "livestock", "Andes (probably southern Peru / northern Chile; Colombia a possible second centre)", (
        claim(5.0, R.ANDES_C, D, LARSON + " (text): guinea pigs followed a commensal pathway 'associated with early sedentism ~5 kya'; Lord et al. 2020 Sci Rep 10:8901 doi:10.1038/s41598-020-65784-6 (text): domestication 'between 6000 and 2000 BC', probably in southern Peru/northern Chile (Spotorno), from Cavia tschudii, with a possible second centre in eastern Colombia. The table had 6.0 ka (from a museum web page) and central Peru", origin=True, checked=True),
        claim(5.0, R.ANDES_N, F, "guinea pig: Ecuador and Colombia ~5-4 ka (Pearsall); recalled, low confidence"),
        claim(2.0, R.ANDES_S, F, "guinea pig: northern Chile and NW Argentina ~2 ka; recalled, low confidence"),
        claim(0.3, R.EUROPE_ALL, H, "guinea pig to Europe by the 1500s-1600s CE (pets); recalled"),
    ), ""),

    Taxon("chicken", "Chicken", "animal", "poultry", "Southeast Asia (red junglefowl; mainland SE Asia)", (
        claim(3.5, R.SE_ASIA_MAINLAND, D, "Peters et al. 2022 PNAS 119:e2121978119 doi:10.1073/pnas.2121978119 (abstract): the first unambiguous domestic chicken bones are at Neolithic Ban Non Wat, central Thailand, ~1650-1250 BCE (3.6-3.2 ka); chickens were not domesticated in the Indian subcontinent; domestication linked to rice and millet cultivation", origin=True, checked=True),
        claim(3.0, R.NORTH_CHINA, D, "chicken: 'did not arrive in Central China, South Asia, or Mesopotamia until the late second millennium BCE' (3.5-3.0 ka), Peters et al. 2022 PNAS doi:10.1073/pnas.2121978119 (abstract)", checked=True),
        claim(3.0, R.SOUTH_CHINA, F, "chicken: south China ~3 ka; recalled"),
        claim(3.0, R.NEAR_EAST, D, "chicken: Mesopotamia in the late second millennium BCE (3.5-3.0 ka), Peters et al. 2022 PNAS doi:10.1073/pnas.2121978119 (abstract)", checked=True),
        claim(3.2, R.ISLAND_SEA, F, "chicken: Island SE Asia and the Philippines ~3.5-3 ka with the Austronesian dispersal; recalled"),
        claim(3.0, R.MELANESIA_W, D, "chicken: Lapita ~3.0 ka; Storey et al. 2012 PNAS: Lapita chickens; recalled", unverified="Lapita chicken dates and the Storey paper were not read"),
        claim(2.8, R.FIJI_SAMOA, F, "chicken: Fiji/Samoa ~2.8 ka; recalled"),
        claim(1.2, R.POLYNESIA_E, F, "chicken: eastern Polynesia ~1.2 ka; recalled"),
        claim(0.9, R.HAWAII, F, "chicken: Hawaii; recalled"),
        claim(2.8, R.EUROPE_ALL, D, "Peters et al. 2022 PNAS doi:10.1073/pnas.2121978119 (abstract): chickens in Mediterranean Europe by ~800 BCE (2.75 ka); the abstract says nothing of the rest of Europe, which was later", checked=True),
        claim(2.75, R.ETHIOPIA, D, "chicken: Ethiopia by ~800 BCE (2.75 ka), Peters et al. 2022 PNAS doi:10.1073/pnas.2121978119 (abstract)", checked=True),
        claim(3.0, R.NW_INDIA, F, "chicken: Indus (Mohenjo-daro) chickens were long dated ~4.5 ka; Peters 2022 doubts the early dates, so ~3 ka here; low confidence"),
        claim(1.0, R.AFRICA_ALL, D, "Peters et al. 2022: chickens in sub-Saharan Africa ~1.1-0.8 ka; North Africa and the Nile earlier (Greek/Roman era ~2.5 ka)",
              unverified="the sub-Saharan 1.1-0.8 ka figure came from an earlier search summary that could not be re-read; the abstract gives only Ethiopia and Mediterranean Europe (~800 BCE)"),
        claim(2.5, R.EGYPT_NILE, F, "chicken: Egypt ~2.5 ka (Persian/Ptolemaic); recalled"),
        claim(0.47, R.CARIBBEAN, H, "chicken: Hispaniola 1493 CE; recalled"),
        claim(0.43, R.LATIN_AMERICA, H, "chicken to the Americas with the Spanish ~1500 CE (a debated pre-Columbian Chilean find at El Arenal is contested; Storey et al. 2007); " + CROSBY),
        claim(0.34, R.NA_EAST, H, "chicken to eastern North America 1500s-1600s CE; recalled"),
        claim(0.2, R.NA_WEST, H, "chicken to western North America 1700s CE; recalled"),
        claim(0.16, R.AUSTRALIA, H, "chicken to Australia, 1788 CE"),
    ), "The chicken's date moved from ~10 ka to ~3.5 ka in 2022; any date here may move again."),

    Taxon("water_buffalo", "Water buffalo", "animal", "livestock", "Yangtze valley (river buffalo from the Indian subcontinent separately)", (
        claim(4.5, R.INDUS, D, "river buffalo domesticated in the lower Indus Valley and western India by 4,500-4,000 BP (" + LARSON + ", text); the table had 5.0 ka", origin=True, checked=True),
        claim(3.0, R.SE_ASIA_MAINLAND, D, "swamp buffalo likely domesticated between eastern India and peninsular Southeast Asia before 3,000-2,500 BP, with archaeological evidence lacking (" + LARSON + ", text). Hemudu ~7 ka buffalo are not shown to be domestic, and ancient north China buffalo were a wild extinct species (Yang et al. 2008 J Archaeol Sci 35:2778 doi:10.1016/j.jas.2008.05.010, abstract). The table had a 7.0 ka Yangtze origin", origin=True, checked=True),
        claim(3.0, R.YANGTZE, F, "swamp buffalo: Yangtze by ~3-2.5 ka, as for the rest of the swamp buffalo's range; no earlier domestic find"),
        claim(4.5, R.NW_INDIA, F, "river buffalo: northwest India ~4.5 ka; recalled"),
        claim(3.0, R.GANGES_E, F, "buffalo: Ganges plain ~3 ka; recalled"),
        claim(3.0, R.SE_ASIA_MAINLAND, F, "swamp buffalo: mainland SE Asia ~3.5-3 ka; recalled"),
        claim(3.0, R.SOUTH_CHINA, F, "swamp buffalo: South China ~3 ka; recalled"),
        claim(4.5, R.NEAR_EAST, F, "river buffalo: Mesopotamia ~4.5 ka (Akkadian seals); recalled, low confidence"),
        claim(1.3, R.EGYPT_NILE, F, "buffalo: Egypt ~1.3 ka (Arab conquest); recalled"),
        claim(1.2, R.W_MEDITERRANEAN, F, "river buffalo: Italy ~600 CE, low confidence; recalled"),
        claim(2.0, R.ISLAND_SEA, F, "swamp buffalo: Philippines and Island SE Asia ~2 ka; recalled, low confidence"),
        claim(0.16, R.AUSTRALIA, H, "buffalo in northern Australia, 1820s-1840s CE; recalled"),
    ), ""),

    Taxon("turkey", "Turkey", "animal", "poultry", "Mexico (Meleagris gallopavo) and the US Southwest (independent)", (
        claim(2.0, R.MESOAMERICA, D, "Thornton et al. 2012 PLoS ONE 7:e42630 doi:10.1371/journal.pone.0042630 (abstract): Mexican turkeys raised in captivity at El Mirador, Guatemala, in the Late Preclassic (300 BC-AD 100; radiocarbon cal 327 BC-AD 54); when turkeys were domesticated in Mexico itself is unclear", origin=True, checked=True),
        claim(2.0, R.SW_US, D, "Lipe et al. 2016 Am Antiq 81:97 doi:10.7183/0002-7316.81.1.97 (abstract): turkey independently domesticated in Mesoamerica and the Southwest; domestic (H1) mtDNA lineages in the upland Southwest from ca. 1 AD (Basketmaker II); Speller et al. 2010 PNAS 107:2807 doi:10.1073/pnas.0909724107 (abstract): a domestic breed in the precontact Southwest (samples 200 BC-AD 1800), not descended from the South Mexican turkey", origin=True, checked=True),
        claim(0.5, R.EASTERN_NA, F, "turkey: Eastern Woodlands, wild turkeys used; domestic only locally ~0.5 ka; recalled, low confidence"),
        claim(0.45, R.EUROPE_ALL, H, "turkey to Spain in the 1520s CE, widespread in Europe by 1550s; recalled"),
    ), ""),
)
