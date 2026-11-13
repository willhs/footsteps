"""Crops: domestication centres, first dates, and spread fronts, each with a source.

Dates are calibrated ka BP (thousands of years before 1950). Where a source gave a range the
claim uses a round figure inside it and the range is in the text. Entries marked "(checked)" were
confirmed against a search summary of the paper's abstract or a news release in this session;
every other figure is recalled from the literature (Fuller; Larson et al. 2014; Zeder; Purugganan
& Fuller 2009 Nature 457:843; Meyer & Purugganan 2013 Nat Rev Genet 14:840; Diamond 2002; Bellwood 2005
First Farmers) and was NOT read from the paper. Where the literature disputes a date the note says so.
Spread fronts (Basis.FRONT) are estimates for a region, not site dates.
"""

from __future__ import annotations

from food import regions as R
from food.exchange import CROSBY, old_world_to_americas
from food.model import Basis, Taxon, claim

D, H, F = Basis.DATED, Basis.HISTORIC, Basis.FRONT
EUR = "Neolithic spread: Pinhasi et al. 2005 PLoS Biol 3:e410 (~1 km/yr), Zeder 2008 PNAS 105:11597; regional date recalled"
ZEDER11 = "Zeder 2011 Curr Anthropol 52:S221; Fuller, Willcox & Allaby 2012 J Exp Bot 63:617"


def _neolithic_europe(crop: str) -> tuple:
    """The Near Eastern package's Neolithic fronts across Europe, shared by wheat, barley and pulses."""
    return (
        claim(9.5, R.ANATOLIA_C, F, f"{crop}: central Anatolia (Catalhoyuk ~9.4 ka); recalled"),
        claim(8.5, R.GREECE_BALKANS, F, f"{crop}: Thessaly/Greece ~9-8.5 ka; {EUR}"),
        claim(7.8, R.W_MEDITERRANEAN, F, f"{crop}: Italy, S France, Iberia 7.9-7.5 ka (Impressed/Cardial Ware); {EUR}"),
        claim(7.5, R.CENTRAL_EUROPE, D, f"{crop}: LBK from ~5500 BCE (7.5 ka) from Hungary to the Rhine; {EUR}"),
        claim(7.0, R.ATLANTIC_FRANCE, F, f"{crop}: Atlantic France/Low Countries ~5000 BCE; {EUR}"),
        claim(7.0, R.UKRAINE, F, f"{crop}: Cucuteni-Trypillia and Bug-Dniester farmers ~7-6.5 ka; recalled"),
        claim(6.0, R.BRITAIN_IRELAND, D, f"{crop}: Britain and Ireland ~4000 BCE (6.0 ka); {EUR}"),
        claim(5.9, R.S_SCANDINAVIA, D, f"{crop}: Funnel Beaker (TRB) in Denmark and S Sweden ~3900 BCE (5.9 ka); {EUR}"),
        claim(4.8, R.BALTIC_E, F, f"{crop}: eastern Baltic, Corded Ware ~4.8 ka; recalled"),
        claim(4.0, R.N_FENNOSCANDIA, F, f"{crop}: northern Fennoscandia, barley only in practice ~4 ka; recalled, low confidence"),
    )


CROPS: tuple[Taxon, ...] = (
    Taxon("wheat", "Wheat (einkorn, emmer, then durum and bread wheat)", "crop", "cereal",
          "Fertile Crescent (Levant, upper Tigris-Euphrates, SE Anatolia)", (
        claim(10.5, R.NEAR_EAST, D, ZEDER11 + ": domestic-type emmer and einkorn in PPNB ~10.5 ka; pre-domestic cultivation from ~11.5 ka. Recalled", origin=True),
        claim(8.0, R.CAUCASUS, F, "wheat: South Caucasus (Shulaveri-Shomu culture) ~8 ka; recalled"),
        claim(2.5, R.STEPPE_BELT_E, F, "wheat: steppe-edge farming in Kazakhstan and Mongolia (Xiongnu-era millet and barley fields ~2.2 ka); recalled, low confidence"),
        claim(7.0, R.MAGHREB, F, "wheat: Maghreb Neolithic ~7.5-7 ka (Morocco, Cyrenaica); recalled"),
        claim(3.0, R.SAHARA, F, "wheat: Saharan oases (Garamantes, Fezzan) ~3-2.5 ka; recalled, low confidence"),
        claim(6.0, R.ARABIA, F, "wheat and barley: Arabia, Neolithic oasis farming ~6-5 ka; recalled, low confidence"),
        claim(4.5, R.CENTRAL_ASIA_OASES, F, "wheat: Bactria-Margiana and Fergana oases ~4.5-4 ka; recalled"),
        claim(3.0, R.RUSSIA_VOLGA_URALS, F, "wheat and barley: Volga-Urals forest-steppe, Bronze Age ~3 ka; recalled, low confidence"),
        claim(0.35, R.SIBERIA_BELT, H, "wheat: Siberia with Russian colonisation from the 1580s CE (farming along the Trans-Siberian belt mostly 1700s-1800s); recalled"),
        claim(1.08, R.ICELAND, H, "barley and little wheat in Iceland from the Norse settlement, 874 CE; recalled"),
        *_neolithic_europe("wheat"),
        claim(7.0, R.EGYPT_NILE, F, "wheat: Fayum and Nile valley ~7.2-7.0 ka; recalled"),
        claim(8.5, R.IRAN_TURKMEN, F, "wheat: Iranian plateau and Jeitun (Turkmenistan) ~8.5-8 ka; recalled"),
        claim(8.5, R.INDUS, D, "wheat: Mehrgarh, Baluchistan, 9-8.5 ka (Jarrige); recalled"),
        claim(4.5, R.NW_INDIA, F, "wheat: Harappan Gujarat and the Punjab plain ~4.5 ka (Fuller 2011); recalled"),
        claim(3.5, R.GANGES_E, F, "wheat: Ganges valley ~3.5 ka; recalled, low confidence"),
        claim(4.5, R.NW_CHINA, D, "wheat: Gansu/Xinjiang ~4.6-4.0 ka (Flad et al. 2010 Antiquity 84:231; Dodson et al. 2013); recalled"),
        claim(4.0, R.NORTH_CHINA, F, "wheat: Central Plains/Shandong ~4 ka; recalled"),
        claim(3.0, R.ETHIOPIA, F, "wheat and barley: Ethiopian highlands, pre-Aksumite ~3 ka; recalled, low confidence"),
        claim(2.8, R.KOREA_JAPAN, F, "wheat and barley: Korea and Japan ~2.8-2.4 ka; recalled"),
        *old_world_to_americas(what="wheat"),
    ), "Plant-domestication timing is contested: Fuller's 'protracted' model has traits evolving over 2-3 ka after first cultivation."),

    Taxon("barley", "Barley", "crop", "cereal", "Fertile Crescent (also a possible second centre in Tibet, disputed)", (
        claim(10.5, R.NEAR_EAST, D, ZEDER11 + ": non-shattering barley ~10.5-10 ka. Recalled", origin=True),
        claim(8.0, R.CAUCASUS, F, "barley: South Caucasus (Shulaveri-Shomu culture) ~8 ka; recalled"),
        claim(2.5, R.STEPPE_BELT_E, F, "barley: steppe-edge farming in Kazakhstan and Mongolia (Xiongnu-era millet and barley fields ~2.2 ka); recalled, low confidence"),
        claim(7.0, R.MAGHREB, F, "barley: Maghreb Neolithic ~7.5-7 ka; recalled"),
        claim(3.0, R.SAHARA, F, "barley: Saharan oases ~3 ka; recalled, low confidence"),
        claim(6.0, R.ARABIA, F, "barley: Arabia ~6-5 ka; recalled, low confidence"),
        claim(4.5, R.CENTRAL_ASIA_OASES, F, "barley: Central Asian oases ~4.5 ka; recalled"),
        claim(3.0, R.RUSSIA_VOLGA_URALS, F, "barley: Volga-Urals ~3 ka; recalled, low confidence"),
        claim(0.35, R.SIBERIA_BELT, H, "barley: Siberia with Russian colonisation, 1600s CE; recalled"),
        claim(1.08, R.ICELAND, H, "barley in Iceland from the Norse settlement, 874 CE; recalled"),
        *_neolithic_europe("barley"),
        claim(7.0, R.EGYPT_NILE, F, "barley: Fayum ~7 ka; recalled"),
        claim(8.5, R.IRAN_TURKMEN, F, "barley: Iranian plateau, Jeitun ~8.5-8 ka; recalled"),
        claim(8.5, R.INDUS, D, "barley: Mehrgarh ~9-8.5 ka (the earliest crop there); recalled"),
        claim(4.5, R.NW_INDIA, F, "barley: Harappan ~4.5 ka; recalled"),
        claim(4.0, R.NW_CHINA, F, "barley: Gansu ~4 ka; recalled"),
        claim(3.6, R.TIBET, D, "barley: Tibetan plateau ~3.6 ka (Chen et al. 2015 Science 347:248, recalled)"),
        claim(3.0, R.ETHIOPIA, F, "barley: Ethiopian highlands ~3 ka; recalled, low confidence"),
        claim(2.8, R.KOREA_JAPAN, F, "barley: Korea ~3 ka, Japan ~2.5 ka; recalled"),
        *old_world_to_americas(what="barley"),
    ), "Tibetan 'six-row naked' barley may have an independent origin (Dai et al. 2012 PNAS); not modelled as a second centre."),

    Taxon("ne_pulses", "Lentil, pea, chickpea, bitter vetch (Near Eastern pulses)", "crop", "pulse", "Fertile Crescent", (
        claim(10.5, R.NEAR_EAST, D, ZEDER11 + ": founder pulses in the PPNB crop package ~10.5 ka. Recalled", origin=True),
        claim(8.0, R.CAUCASUS, F, "pulses: South Caucasus (Shulaveri-Shomu culture) ~8 ka; recalled"),
        claim(7.0, R.MAGHREB, F, "pulses: Maghreb ~7 ka; recalled"),
        claim(6.0, R.ARABIA, F, "pulses: Arabia; recalled, low confidence"),
        claim(4.5, R.CENTRAL_ASIA_OASES, F, "pulses: Central Asian oases; recalled"),
        claim(0.35, R.SIBERIA_BELT, H, "pulses: Siberia with Russian colonisation; recalled, low confidence"),
        *_neolithic_europe("pulses"),
        claim(7.0, R.EGYPT_NILE, F, "pulses: Nile valley with the Fayum package; recalled"),
        claim(8.5, R.IRAN_TURKMEN, F, "pulses: Iranian plateau; recalled"),
        claim(8.5, R.INDUS, F, "pulses: Mehrgarh (lentil, pea); recalled"),
        claim(4.5, R.NW_INDIA, F, "pulses: Harappan; recalled"),
        claim(4.0, R.NORTH_CHINA, F, "pulses: pea and lentil reach China as part of the wheat-barley package; recalled, low confidence"),
        claim(3.0, R.ETHIOPIA, F, "pulses: Ethiopian highlands; recalled, low confidence"),
        *old_world_to_americas(what="pulses"),
    ), ""),

    Taxon("rice", "Asian rice (japonica, then indica)", "crop", "cereal",
          "Lower and middle Yangtze (japonica); Ganges plain and South Asia contribute indica", (
        claim(6.9, R.YANGTZE, D, "Fuller et al. 2009 Science 323:1607: domestication process at Tianluoshan 6.9-6.6 ka; non-shattering bases rise 27%->39% (checked). Wild-rice use and cultivation earlier: Shangshan ~10-9 ka (recalled); Middle Yangtze largely non-shattering by ~8.3 ka (secondary summary)", origin=True, checked=True),
        claim(4.5, R.SW_CHINA, F, "rice: Chengdu plain (Baodun) and Yunnan ~4.5 ka; recalled"),
        claim(4.0, R.EAST_INDIA, F, "rice: Odisha and the east coast of India ~4 ka; recalled"),
        claim(5.0, R.SOUTH_CHINA, F, "rice: south China ~5 ka; recalled"),
        claim(5.0, R.TAIWAN_PHILIPPINES, F, "rice: Taiwan ~5 ka (Austronesian farmers, secondary summary); Philippines ~4.2 ka"),
        claim(4.5, R.SE_ASIA_MAINLAND, F, "rice: mainland SE Asia (Ban Non Wat, Thailand) ~4.5-4 ka; recalled"),
        claim(4.0, R.ISLAND_SEA, F, "rice: Island SE Asia ~4 ka with Austronesian dispersal (Bellwood); recalled"),
        claim(4.5, R.GANGES_E, D, "rice: Ganges plain (Lahuradewa, Koldihwa) ~5-4 ka, a separate indica/aus line from wild rice (Fuller 2011; Choi et al. 2017 Mol Biol Evol); recalled, contested", origin=True),
        claim(4.0, R.SOUTH_INDIA, F, "rice: peninsular India ~4 ka; recalled"),
        claim(3.0, R.KOREA_JAPAN, D, "rice: Korea ~3.5 ka, Japan (Yayoi) ~3 ka; recalled"),
        claim(3.0, R.NORTH_CHINA, F, "rice: north China, limited by cold ~3 ka; recalled, low confidence"),
        claim(2.0, R.MADAGASCAR, F, "rice: Madagascar, with Austronesian-speaking settlers ~1.5-1.2 ka; recalled"),
        claim(0.43, R.LATIN_AMERICA, H, "rice to Spanish America; " + CROSBY),
        claim(0.3, R.NA_EAST, H, "rice: South Carolina rice plantations from ~1690s CE; recalled"),
    ), "Oryza sativa is a single domesticated species with a contested single-versus-multiple origin; indica carries japonica genes via introgression."),

    Taxon("millets_ne_asia", "Foxtail and broomcorn millet", "crop", "cereal", "Northern China (Yellow River, Cishan), broomcorn also reached Europe early", (
        claim(8.7, R.NORTH_CHINA, D, "Lu et al. 2009 PNAS 106:7367: broomcorn millet at Cishan and Peiligang, earliest domesticated ~10-8.7 ka; Zhao 2011 Curr Anthropol. Recalled", origin=True),
        claim(2.5, R.STEPPE_BELT_E, F, "millet: steppe-edge farming in Kazakhstan and Mongolia ~3-2 ka; recalled, low confidence"),
        claim(4.5, R.SW_CHINA, F, "millets: Sichuan and Yunnan (Baodun, Haimenkou) ~4.5 ka; recalled"),
        claim(4.5, R.CENTRAL_ASIA_OASES, F, "millets: Bactria and Fergana ~4.5 ka (Spengler et al. 2014 Proc R Soc B: Tianshan route, ~4.5 ka); recalled"),
        claim(3.5, R.RUSSIA_VOLGA_URALS, F, "broomcorn millet: Bronze Age steppe (Srubnaya) ~3.5 ka; recalled, low confidence"),
        claim(0.35, R.SIBERIA_BELT, H, "millet: Siberia with Russian colonisation; recalled, low confidence"),
        claim(3.0, R.EAST_INDIA, F, "millets: eastern India ~3.5-3 ka; recalled, low confidence"),
        claim(7.5, R.MANCHURIA, F, "millets: Manchuria and Inner Mongolia (Xinglongwa) ~8-7 ka; recalled"),
        claim(6.0, R.NW_CHINA, F, "millets: Gansu (Dadiwan) ~7-6 ka; recalled"),
        claim(4.5, R.KOREA_JAPAN, F, "millets: Korea ~5.5 ka, Japan ~3.5-3 ka; recalled"),
        claim(6.0, R.EUROPE_ALL, F, "broomcorn millet in Europe ~6-7 ka (Romania, Germany), a puzzle for east-west contact; Motuzaite-Matuzeviciute et al. 2013 (recalled, low confidence)"),
        claim(4.5, R.SE_ASIA_MAINLAND, F, "foxtail millet: mainland SE Asia ~4.5 ka (Taiwan Nankuanli ~5 ka); recalled"),
        claim(4.0, R.INDUS, F, "millets: Indus and Gujarat ~4.5 ka; recalled"),
    ), ""),

    Taxon("sorghum", "Sorghum", "crop", "cereal", "Sudan, Butana and the Ethiopian margin (African savanna belt)", (
        claim(4.5, R.SAHEL_E, D, "Winchell et al. 2018 Afr Archaeol Rev: Kassala, eastern Sudan, 3500-3000 BCE (5.5-5.0 ka) with a wild/domestic mixture still in the 2nd millennium BCE (abstract summary, second-hand); 4.5 ka is the figure for domestic-type grain", origin=True, checked=True),
        claim(3.0, R.ARABIA, F, "sorghum: Yemen and Arabia ~3 ka (Fuller; Sabaean terraces); recalled, low confidence"),
        claim(3.0, R.CHAD_BASIN, F, "sorghum: Lake Chad basin ~3.5-3 ka (Gajiganna, Nigeria); recalled"),
        claim(3.0, R.EAST_INDIA, F, "sorghum: eastern India; recalled, low confidence"),
        claim(4.0, R.NW_INDIA, D, "sorghum: arrives in India by ~4-3.5 ka (Fuller; Rojdi, Gujarat); recalled"),
        claim(3.0, R.ETHIOPIA, F, "sorghum: Ethiopian highlands ~3 ka; recalled"),
        claim(3.0, R.SAHEL_W, F, "sorghum: West Africa ~3 ka with pearl millet; recalled"),
        claim(2.5, R.W_AFRICA_FOREST, F, "sorghum: West African savanna and forest margin ~2.5 ka; recalled, low confidence"),
        claim(2.0, R.GREAT_LAKES, F, "sorghum: Great Lakes with the Bantu iron/farming package ~2.5-2 ka; recalled"),
        claim(1.9, R.EAST_COAST, F, "sorghum: East African coast ~2 ka; recalled"),
        claim(1.8, R.ZAMBEZI, F, "sorghum: Zambezi, with Bantu-speaking farmers ~1.8 ka; recalled"),
        claim(1.65, R.SOUTH_AFRICA, F, "sorghum: South Africa ~300 CE (1.65 ka) with Bantu-speaking farmers (Early Iron Age); web summaries (mirror sites) only"),
        claim(2.0, R.NORTH_CHINA, F, "sorghum: China, late (first millennium CE) -- recalled, low confidence"),
        *old_world_to_americas(what="sorghum", latin=0.3, australia=None),
    ), "The Bantu expansion carried sorghum, pearl millet, cattle and iron south and east; the dates are those of Early Iron Age sites."),

    Taxon("pearl_millet", "Pearl millet", "crop", "cereal", "Sahel (Mali-Mauritania)", (
        claim(4.5, R.SAHEL_W, D, "Pearl millet in West Africa by ~2500 BCE; domestic form ~4.5 ka (Fuller et al.; search summary, web summary only). Cultivation at Dhar Tichitt ~4-3 ka", origin=True, checked=True),
        claim(3.0, R.CHAD_BASIN, F, "pearl millet: Lake Chad basin ~3 ka; recalled"),
        claim(4.0, R.SAHEL_E, F, "pearl millet at Kassala by ~1900 BCE (3.9 ka), Beldados et al. 2018 (search summary, web summary only)", checked=True),
        claim(4.0, R.NW_INDIA, D, "pearl millet in Gujarat ~4 ka (Rojdi; Fuller); recalled"),
        claim(3.0, R.ETHIOPIA, F, "pearl millet: Ethiopian highlands ~3 ka; recalled"),
        claim(2.0, R.GREAT_LAKES, F, "pearl millet: Great Lakes ~2 ka; recalled"),
        claim(1.8, R.ZAMBEZI, F, "pearl millet: Zambezi with Bantu farmers ~1.8 ka; recalled"),
        claim(1.65, R.SOUTH_AFRICA, F, "pearl millet: South Africa ~1.65 ka; recalled"),
        *old_world_to_americas(what="pearl millet", latin=0.3, australia=None),
    ), ""),

    Taxon("african_rice", "African rice", "crop", "cereal", "Inland Niger Delta, Mali", (
        claim(2.5, R.NIGER_DELTA_INLAND, D, "Oryza glaberrima: domestic ~3-2 ka in the Inland Niger Delta (Jenne-jeno ~2.3 ka, McIntosh); recalled", origin=True),
        claim(1.5, R.W_AFRICA_FOREST, F, "African rice: Guinea coast ~1.5 ka; recalled"),
        claim(0.4, R.LATIN_AMERICA, H, "African rice to Americas with enslaved Africans, 1500s-1600s CE (Carney 2001 Black Rice); recalled"),
    ), ""),

    Taxon("maize", "Maize", "crop", "cereal", "Balsas River valley, southwest Mexico (from teosinte)", (
        claim(8.7, R.BALSAS, D, "Piperno et al. 2009 PNAS 106:5019: maize starch and phytoliths at Xihuatoxtla shelter ~8.7 ka (recalled); Kistler et al. 2018 Science 362:1309: domestication ~9 ka (recalled)", origin=True),
        claim(3.5, R.NORTH_MEXICO, F, "maize: Sonora and northern Mexico ~4-3.5 ka (the northern route to the Southwest); recalled"),
        claim(3.0, R.LOWLAND_SOUTH_AMERICA, F, "maize: lowland South America (Orinoco, Gran Chaco, Parana), ~4-2 ka, with Tupi-Guarani and Arawak farmers; recalled, low confidence"),
        claim(6.2, R.OAXACA, D, "maize: Guila Naquitz cobs ~6.2 ka (Piperno & Flannery 2001 PNAS); recalled"),
        claim(6.8, R.AMAZON_SW, D, "Lombardo et al. 2020 Nature 581:190: maize ~6.85 ka cal BP in SW Amazonia (checked)", checked=True),
        claim(6.0, R.MESOAMERICA, F, "maize: across Mesoamerica ~6 ka; recalled"),
        claim(6.0, R.CENTRAL_AMERICA_S, F, "maize: Panama and Costa Rica ~6-7 ka (Piperno, phytoliths); recalled"),
        claim(6.5, R.ANDES_N, F, "maize: Ecuador (Real Alto, Las Vegas) ~7-6 ka; recalled"),
        claim(6.5, R.ANDES_C, F, "maize: Peru (Paredones, Huaca Prieta) ~6.7-5 ka; recalled"),
        claim(4.05, R.SW_US, D, "Merrill et al. 2009 PNAS 106:21019: maize in Arizona and western New Mexico by 2100 cal BCE (~4.05 ka) (checked)", checked=True),
        claim(3.0, R.CARIBBEAN, F, "maize: Caribbean ~3-2.5 ka; recalled, low confidence"),
        claim(3.5, R.ANDES_S, F, "maize: NW Argentina and N Chile ~3.5 ka; recalled"),
        claim(2.5, R.BRAZIL_E, F, "maize: eastern Brazil ~3 ka; recalled"),
        claim(2.1, R.EASTERN_NA, D, "maize: Eastern Woodlands ~2.2-1.8 ka (Hopewell), only widely staple after ~1.1 ka (Smith; Hart); recalled"),
        claim(1.0, R.UPPER_MIDWEST, F, "maize: Upper Midwest (Oneota, Late Woodland) ~1 ka; recalled"),
        claim(1.0, R.NE_WOODLANDS, D, "maize: northern Iroquoia and the Great Lakes ~1.3-1 ka (Hart & Scarry); recalled"),
        claim(0.4, R.EUROPE_ALL, H, "maize to Spain/Portugal after 1493 CE, a field crop in Iberia by the 1500s; " + CROSBY),
        claim(0.4, R.AFRICA_ALL, H, "maize to West and Central Africa via Portuguese traders, 1500s CE; " + CROSBY),
        claim(0.4, R.NORTH_CHINA, H, "maize to China by the mid-1500s CE; " + CROSBY),
        claim(0.4, R.SOUTH_CHINA, H, "maize to China by the mid-1500s CE; " + CROSBY),
        claim(0.4, R.SE_ASIA_MAINLAND, H, "maize to Southeast Asia in the 1500s CE; " + CROSBY),
        claim(0.35, R.SOUTH_INDIA, H, "maize to India in the 1500s-1600s CE; " + CROSBY),
        claim(0.16, R.AUSTRALIA, H, "maize to Australia, 1788 CE"),
    ), "Dates are for the earliest dated finds; Kistler 2018 shows a long, protracted southward spread of a partly domesticated crop."),

    Taxon("potato", "Potato", "crop", "root", "Andes, southern Peru and the Lake Titicaca basin", (
        claim(8.0, R.ANDES_C, D, "Spooner et al. 2005 PNAS 102:14694: a single origin in southern Peru; archaeological tubers/starch ~8 ka and possibly 10 ka (Ugent 1982; Pearsall). Recalled, low-medium confidence", origin=True),
        claim(4.0, R.ANDES_N, F, "potato: northern Andes ~4 ka; recalled, low confidence"),
        claim(4.0, R.ANDES_S, F, "potato: NW Argentina and N Chile; recalled, low confidence"),
        claim(1.5, R.SOUTH_CONE, D, "potato: southern Chile (Chiloe) land races, date a guess ~1.5 ka; recalled, low confidence"),
        claim(0.38, R.EUROPE_ALL, H, "potato in Spain by 1570s CE, widespread in Europe 1600s-1700s; " + CROSBY),
        claim(0.3, R.NORTH_CHINA, H, "potato to China in the 1600s CE; recalled"),
        claim(0.3, R.NW_INDIA, H, "potato to India in the 1600s CE; recalled"),
        claim(0.3, R.NA_EAST, H, "potato to North America (Londonderry, NH, 1719 CE); recalled"),
        claim(0.2, R.AFRICA_ALL, H, "potato to Africa through colonial gardens, 1800s CE; recalled, low confidence"),
        claim(0.16, R.AUSTRALIA, H, "potato to Australia, 1788 CE"),
    ), "The potato's Andean timeline is poorly dated: starch and tubers survive badly in the highlands."),

    Taxon("cassava", "Cassava (manioc)", "crop", "root", "Southwestern Amazon (Rondonia, Llanos de Moxos)", (
        claim(10.35, R.AMAZON_SW, D, "Lombardo et al. 2020 Nature 581:190: manioc phytoliths at ~10,350 cal BP, Llanos de Moxos, Bolivia (checked); the authors' claim of a fifth centre is debated", origin=True, checked=True),
        claim(3.0, R.LOWLAND_SOUTH_AMERICA, F, "cassava: lowland South America ~3-2 ka, Arawak and Tupi-Guarani; recalled, low confidence"),
        claim(7.0, R.AMAZON, F, "cassava: across the Amazon basin; recalled, low confidence"),
        claim(5.8, R.CENTRAL_AMERICA_S, D, "cassava: Panama (Aguadulce) ~7-5 ka (Piperno); recalled, low confidence"),
        claim(4.6, R.MESOAMERICA, D, "cassava: San Andres, Tabasco ~4.6 ka (Pope et al. 2001 Science 292:1370); recalled"),
        claim(4.0, R.CARIBBEAN, F, "cassava: Caribbean (a staple by ~2 ka; Arawak/Taino); recalled, low confidence"),
        claim(3.0, R.BRAZIL_E, F, "cassava: coastal Brazil, Tupi-Guarani; recalled, low confidence"),
        claim(0.45, R.W_AFRICA_FOREST, H, "cassava to West Africa via Portuguese Sao Tome/Congo, 1500s CE; " + CROSBY),
        claim(0.45, R.CONGO_BASIN, H, "cassava to the Congo, 1500s CE; " + CROSBY),
        claim(0.3, R.GREAT_LAKES, H, "cassava to East Africa, 1700s-1800s CE; recalled"),
        claim(0.3, R.SE_ASIA_MAINLAND, H, "cassava to Southeast Asia 1700s-1800s CE; recalled"),
    ), ""),

    Taxon("squash", "Squash and pumpkin (Cucurbita)", "crop", "vegetable", "Several: Oaxaca (C. pepo), Ecuador, SW Amazon, eastern North America", (
        claim(10.0, R.OAXACA, D, "Smith 1997 Science 276:932: Cucurbita pepo seeds at Guila Naquitz, ~10 ka (recalled)", origin=True),
        claim(3.5, R.NORTH_MEXICO, F, "squash: northern Mexico ~4-3.5 ka; recalled"),
        claim(3.0, R.LOWLAND_SOUTH_AMERICA, F, "squash: lowland South America ~3 ka; recalled, low confidence"),
        claim(10.25, R.AMAZON_SW, D, "Lombardo et al. 2020 Nature 581:190: Cucurbita phytoliths ~10,250 cal BP (checked)", origin=True, checked=True),
        claim(10.0, R.ANDES_N, D, "squash: Las Vegas, Ecuador ~10 ka (Piperno 2000 Nature); recalled", origin=True),
        claim(8.0, R.MESOAMERICA, F, "squash: Mesoamerica; recalled"),
        claim(5.0, R.EASTERN_NA, D, "squash: C. pepo ssp. ovifera in the Eastern Woodlands ~5 ka (Smith 2006 PNAS 103:12223); recalled, an independent domestication", origin=True),
        claim(4.0, R.SW_US, F, "squash: with maize ~4 ka; recalled"),
        claim(3.0, R.ANDES_C, F, "squash: Peru, C. maxima/moschata; recalled"),
        claim(0.4, R.EUROPE_ALL, H, "squash/pumpkin to Europe in the 1500s CE; " + CROSBY),
        claim(0.4, R.AFRICA_ALL, H, "squash/pumpkin to Africa in the 1500s-1600s CE; " + CROSBY),
        claim(0.4, R.SOUTH_CHINA, H, "squash to China by the 1500s CE; " + CROSBY),
        claim(0.4, R.NORTH_CHINA, H, "squash to China by the 1500s CE; " + CROSBY),
    ), ""),

    Taxon("common_bean", "Common bean (Phaseolus vulgaris)", "crop", "pulse", "Mesoamerica and the Andes (two separate domestications)", (
        claim(2.5, R.MESOAMERICA, D, "Kaplan & Lynch 1999 J Ethnobiol 19:261: oldest AMS-dated domestic Phaseolus vulgaris ~2.3-2.5 ka (Tehuacan, Oaxaca); cultivation probably earlier. Kwak et al. 2009 PNAS: two domestications. Recalled, low-medium", origin=True),
        claim(2.0, R.NORTH_MEXICO, F, "beans: northern Mexico ~2 ka; recalled"),
        claim(2.0, R.LOWLAND_SOUTH_AMERICA, F, "beans: lowland South America ~2 ka; recalled, low confidence"),
        claim(2.5, R.ANDES_C, D, "common bean: Andes (Guitarrero Cave) AMS ~2.5 ka after the earlier 8 ka claim was revised; recalled", origin=True),
        claim(2.0, R.SW_US, F, "beans: Southwest US ~2 ka; recalled"),
        claim(1.0, R.EASTERN_NA, F, "beans: Eastern Woodlands ~1 ka (the Three Sisters); recalled"),
        claim(1.0, R.NE_WOODLANDS, F, "beans: Iroquoia ~0.7 ka; recalled, low confidence"),
        claim(2.0, R.ANDES_N, F, "beans: northern Andes; recalled, low confidence"),
        claim(2.0, R.ANDES_S, F, "beans: NW Argentina; recalled, low confidence"),
        claim(0.4, R.EUROPE_ALL, H, "common bean to Europe in the 1500s CE; " + CROSBY),
        claim(0.4, R.AFRICA_ALL, H, "common bean to Africa in the 1500s CE; " + CROSBY),
        claim(0.4, R.NORTH_CHINA, H, "common bean to China in the 1500s-1600s CE; " + CROSBY),
    ), "Beans were probably in cultivation well before the earliest dated seeds; Lombardo found no beans in the Amazon."),

    Taxon("sweet_potato", "Sweet potato", "crop", "root", "Tropical America (Andes/Mesoamerica; wild relatives in both)", (
        claim(5.0, R.ANDES_C, D, "Ipomoea batatas: dry tubers at Chilca Canyon, Peru, ~8-4.5 ka (Engel); recalled, low confidence", origin=True),
        claim(3.0, R.CENTRAL_AMERICA_S, F, "sweet potato: Central America ~3 ka; recalled, low confidence"),
        claim(1.0, R.POLYNESIA_E, D, "Roullier et al. 2013 PNAS 110:2205; Ioannidis et al. 2020 Nature 583:572: reached eastern Polynesia ~1000-1200 CE through Native American contact; Hather & Kirch 1991 Atiu ~1000 CE. Recalled"),
        claim(0.8, R.HAWAII, F, "sweet potato: Hawaii ~1100-1200 CE, with Polynesian settlement; recalled"),
        claim(0.8, R.NEW_ZEALAND, F, "sweet potato: New Zealand, kumara, ~1300 CE; recalled"),
        claim(0.4, R.NEW_GUINEA, H, "sweet potato to New Guinea highlands ~1600s CE (the 'sweet potato revolution'; Golson); recalled"),
        claim(0.4, R.SOUTH_CHINA, H, "sweet potato to China, 1590s CE (Fujian); recalled"),
        claim(0.4, R.ISLAND_SEA, H, "sweet potato to Southeast Asia, 1500s CE (Spanish/Portuguese); recalled"),
        claim(0.4, R.AFRICA_ALL, H, "sweet potato to Africa, 1500s CE; recalled"),
    ), "Polynesian sweet potato is a lasting puzzle: pre-Columbian transfer is debated; the 2020 genome study supports Native American contact."),

    Taxon("taro", "Taro", "crop", "root", "New Guinea highlands and mainland/island Southeast Asia (likely several centres)", (
        claim(10.0, R.NEW_GUINEA, D, "Denham et al. 2003 Science 301:189: taro used at Kuk Swamp by 10.2-9.9 ka, cultivation by ~6.9-6.4 ka (checked, abstract); Fullagar et al. 2006: taro starch on stone tools from ~28 ka (not domestication)", origin=True, checked=True),
        claim(7.0, R.SE_ASIA_MAINLAND, F, "taro: Southeast Asia / India, wet-rice margins ~7 ka; domestication here is poorly dated; Matthews 1995, recalled, low confidence"),
        claim(5.0, R.ISLAND_SEA, F, "taro: Island SE Asia ~5 ka with early food production; recalled, low confidence"),
        claim(3.0, R.MELANESIA_W, D, "taro: Lapita ~3.3-3 ka (Kirch); recalled"),
        claim(2.8, R.FIJI_SAMOA, D, "taro: Fiji/Samoa ~2.9-2.7 ka with the Lapita expansion; recalled"),
        claim(1.2, R.POLYNESIA_E, F, "taro: eastern Polynesia ~1.2-1.0 ka; recalled"),
        claim(0.9, R.HAWAII, F, "taro: Hawaii ~0.8-1.0 ka (wet-field kalo); recalled"),
        claim(0.7, R.NEW_ZEALAND, F, "taro: New Zealand, limited by cold, ~0.7 ka; recalled"),
        claim(2.5, R.SOUTH_INDIA, F, "taro: India ~2.5 ka; recalled, low confidence"),
        claim(2.5, R.SOUTH_CHINA, F, "taro: South China ~2.5 ka; recalled, low confidence"),
        claim(2.5, R.EGYPT_NILE, F, "taro: Egypt/Mediterranean ~2.3 ka (Greek and Roman writers); recalled, low confidence"),
        claim(1.5, R.W_AFRICA_FOREST, F, "taro: West Africa ~1.5 ka via the Indian Ocean or the Nile; recalled, low confidence"),
        claim(1.5, R.MADAGASCAR, F, "taro: Madagascar ~1.5 ka with Austronesian-speaking settlers; recalled"),
    ), "Taro's domestication was multi-centre and its timing is among the weakest in this table."),

    Taxon("banana", "Banana and plantain", "crop", "fruit", "New Guinea highlands (Musa acuminata hybrids), Island SE Asia", (
        claim(6.7, R.NEW_GUINEA, D, "Denham et al. 2003 Science 301:189: intensively cultivated Musa at Kuk Swamp by 6.95-6.44 ka (checked, abstract); the seed-phytolith record at Kuk goes to ~10 ka", origin=True, checked=True),
        claim(5.0, R.ISLAND_SEA, F, "banana: Island SE Asia; recalled, low confidence"),
        claim(3.0, R.SOUTH_INDIA, F, "banana: South India ~3 ka; recalled, low confidence"),
        claim(3.0, R.SE_ASIA_MAINLAND, F, "banana: mainland SE Asia ~3-2.5 ka; recalled, low confidence"),
        claim(3.0, R.MELANESIA_W, F, "banana: Lapita region ~3 ka; recalled"),
        claim(2.8, R.FIJI_SAMOA, F, "banana: Fiji/Samoa with Lapita; recalled"),
        claim(1.2, R.POLYNESIA_E, F, "banana: eastern Polynesia; recalled"),
        claim(2.5, R.CAMEROON_NIGERIA, D, "banana in Africa: phytoliths at Nkang, Cameroon ~2.5 ka (Mbida et al. 2000; Lejju et al. 2006 Uganda); contested, recalled, low confidence"),
        claim(2.0, R.GREAT_LAKES, F, "banana: Great Lakes ~2 ka -> the highland banana region; recalled, low confidence"),
        claim(1.5, R.EAST_COAST, F, "banana: East African coast ~1.5 ka (Indian Ocean trade); recalled, low confidence"),
        claim(1.5, R.MADAGASCAR, F, "banana: Madagascar ~1.5 ka; recalled"),
        claim(0.45, R.LATIN_AMERICA, H, "banana to Santo Domingo in 1516 CE (Berlanga); recalled"),
        claim(0.4, R.CARIBBEAN, H, "banana to the Caribbean, 1516 CE; recalled"),
    ), "Banana is a hybrid and sterile crop, so there is little genetic or archaeological trail beyond phytoliths."),

    Taxon("yam", "Yams (Dioscorea)", "crop", "root", "West Africa (D. rotundata), Southeast Asia and New Guinea (D. alata, D. esculenta)", (
        claim(5.0, R.W_AFRICA_FOREST, D, "Dioscorea rotundata: West African forest-savanna yam, cultivated by ~5-3 ka; the record is poor (tubers do not survive), recalled, low confidence", origin=True),
        claim(5.0, R.NEW_GUINEA, D, "D. alata and D. nummularia in Melanesia ~5-4 ka; Lebot; recalled, low confidence", origin=True),
        claim(5.0, R.ISLAND_SEA, F, "yam: Island SE Asia (D. alata); recalled, low confidence"),
        claim(3.0, R.MELANESIA_W, F, "yam: Lapita ~3 ka; recalled"),
        claim(2.8, R.FIJI_SAMOA, F, "yam: Fiji/Samoa with Lapita; recalled"),
        claim(1.2, R.POLYNESIA_E, F, "yam: eastern Polynesia; recalled"),
        claim(3.0, R.CAMEROON_NIGERIA, F, "yam: Nigeria and Cameroon; recalled, low confidence"),
        claim(2.0, R.CONGO_BASIN, F, "yam: Congo basin with Bantu farmers; recalled, low confidence"),
        claim(1.5, R.SOUTH_INDIA, F, "yam: India (D. alata) ~2 ka; recalled, low confidence"),
        claim(1.5, R.MADAGASCAR, F, "D. alata to Madagascar ~1.5 ka; recalled"),
        claim(0.4, R.LATIN_AMERICA, H, "yam to Americas with the slave trade, 1500s CE; recalled"),
    ), "Yam dates are among the weakest here; treat them as ranges, not years."),

    Taxon("sugarcane", "Sugarcane", "crop", "sweet", "New Guinea (Saccharum officinarum)", (
        claim(6.0, R.NEW_GUINEA, D, "Saccharum officinarum domesticated in New Guinea, c. 6-8 ka (Daniels & Daniels; Grivet; recalled, low confidence)", origin=True),
        claim(3.0, R.MELANESIA_W, F, "sugarcane: Lapita region and Island SE Asia; recalled, low confidence"),
        claim(3.0, R.ISLAND_SEA, F, "sugarcane: Island SE Asia ~3 ka; recalled, low confidence"),
        claim(2.5, R.SOUTH_INDIA, F, "sugarcane: India (sugar refining by ~2.4 ka); recalled, low confidence"),
        claim(2.0, R.NW_INDIA, F, "sugarcane: northern India ~2 ka; recalled, low confidence"),
        claim(1.5, R.SOUTH_CHINA, F, "sugarcane: South China ~1.5 ka (Tang sugar from ~660 CE); recalled, low confidence"),
        claim(1.3, R.NEAR_EAST, F, "sugarcane: Persia and Mesopotamia ~1.3 ka (Arab agricultural revolution); recalled"),
        claim(1.0, R.EGYPT_NILE, F, "sugarcane: Egypt ~1.2 ka; recalled"),
        claim(0.5, R.W_MEDITERRANEAN, F, "sugarcane: Sicily, Andalusia and Madeira 1000-1450 CE; recalled"),
        claim(0.45, R.CARIBBEAN, H, "sugarcane to Hispaniola 1493-1500s CE; " + CROSBY),
        claim(0.43, R.LATIN_AMERICA, H, "sugarcane to Brazil and Spanish America 1500s CE; " + CROSBY),
    ), ""),

    Taxon("soybean", "Soybean", "crop", "pulse", "Northern and central China (disputed: Korea, Japan)", (
        claim(3.5, R.NORTH_CHINA, D, "Glycine max: cultivated by ~5 ka (disputed) and domesticated-size seeds ~3-2.5 ka in China, Korea and Japan (Lee et al. 2011 Plant Physiol; Crawford). Recalled, low confidence", origin=True),
        claim(3.5, R.KOREA_JAPAN, D, "soybean: Korea (Daema-ri) and Japan (Jomon cultivation ~7-3 ka debated); recalled, low confidence"),
        claim(2.5, R.MANCHURIA, F, "soybean: Manchuria; recalled"),
        claim(2.0, R.SOUTH_CHINA, F, "soybean: south China; recalled, low confidence"),
        claim(1.5, R.SE_ASIA_MAINLAND, F, "soybean: Southeast Asia ~1.5 ka; recalled, low confidence"),
        claim(0.25, R.EUROPE_ALL, H, "soybean to Europe in the 1700s CE; recalled"),
        claim(0.25, R.NA_EAST, H, "soybean to North America in the 1760s CE (Franklin); recalled"),
    ), ""),
)
