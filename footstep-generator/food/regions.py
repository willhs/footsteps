"""Named boxes for the domesticate claims. One place, so a claim says WHERE with a name.

Box = (min_lon, max_lon, min_lat, max_lat) in degrees. A 5-degree cell is "in" a box when the
cell's centre is inside it (edges inclusive), so the boxes are coarse: they are for drawing a
diffusion front on a 5-degree grid, not for borders. A box never crosses the antimeridian
(Fiji/Samoa is two boxes).
"""

from __future__ import annotations

Box = tuple[float, float, float, float]

# --- Southwest and Central Asia -----------------------------------------------------------
NEAR_EAST: Box = (32, 48, 30, 40)  # Levant, upper Mesopotamia, Zagros foothills, Cyprus
ANATOLIA_C: Box = (26, 38, 36, 42)
EGYPT_NILE: Box = (30, 35, 20, 32)
IRAN_TURKMEN: Box = (48, 66, 28, 42)
ARABIA_SE: Box = (50, 60, 16, 28)
ARABIA: Box = (35, 60, 12, 30)
CAUCASUS: Box = (38, 55, 38, 46)
# --- South Asia --------------------------------------------------------------------------
INDUS: Box = (60, 75, 20, 38)
NW_INDIA: Box = (68, 82, 20, 32)
GANGES_E: Box = (82, 95, 22, 30)
SOUTH_INDIA: Box = (72, 85, 5, 22)
# --- East and Southeast Asia -------------------------------------------------------------
NORTH_CHINA: Box = (105, 125, 30, 44)
NW_CHINA: Box = (75, 112, 32, 47)
YANGTZE: Box = (105, 122, 26, 34)
SOUTH_CHINA: Box = (105, 125, 20, 28)
KOREA_JAPAN: Box = (125, 146, 30, 47)
MANCHURIA: Box = (118, 138, 40, 56)
TIBET: Box = (80, 100, 28, 36)
SE_ASIA_MAINLAND: Box = (90, 113, 5, 26)
ISLAND_SEA: Box = (95, 128, -10, 8)  # Sumatra, Java, Borneo, Sulawesi
TAIWAN_PHILIPPINES: Box = (118, 128, 5, 26)
NEW_GUINEA: Box = (130, 157, -12, 0)
# --- Pacific -----------------------------------------------------------------------------
MELANESIA_W: Box = (140, 175, -25, 0)  # Bismarcks, Solomons, Vanuatu, New Caledonia
FIJI_SAMOA: tuple[Box, Box] = ((175, 180, -22, -12), (-180, -170, -22, -12))
POLYNESIA_E: Box = (-160, -130, -30, -5)  # Cooks, Societies, Marquesas, Tuamotus
HAWAII: Box = (-160, -154, 15, 25)
NEW_ZEALAND: Box = (166, 179, -48, -34)
# --- Europe ------------------------------------------------------------------------------
GREECE_BALKANS: Box = (19, 30, 35, 45)
W_MEDITERRANEAN: Box = (-10, 20, 35, 45)  # Iberia, Italy, S France
IBERIA: Box = (-10, 3, 36, 43)
CENTRAL_EUROPE: Box = (5, 25, 45, 55)  # LBK: Rhine to the Carpathians
ATLANTIC_FRANCE: Box = (-5, 5, 45, 52)
BRITAIN_IRELAND: Box = (-10, 2, 50, 59)
S_SCANDINAVIA: Box = (5, 25, 55, 60)
BALTIC_E: Box = (20, 32, 55, 62)
N_FENNOSCANDIA: Box = (10, 35, 60, 70)
UKRAINE: Box = (25, 40, 45, 55)
PONTIC_CASPIAN: Box = (25, 60, 43, 55)
KAZAKH_STEPPE: Box = (60, 80, 45, 55)
MONGOLIA: Box = (85, 120, 43, 52)
EUROPE_ALL: Box = (-10, 40, 35, 66)
# --- Africa ------------------------------------------------------------------------------
SAHARA: Box = (-10, 35, 17, 30)  # the green Sahara
SAHEL_W: Box = (-20, 10, 10, 18)
SAHEL_E: Box = (22, 40, 5, 18)  # Sudan, Butana
NIGER_DELTA_INLAND: Box = (-8, 2, 10, 18)
ETHIOPIA: Box = (35, 48, 5, 15)
TURKANA: Box = (34, 42, -4, 6)
W_AFRICA_FOREST: Box = (-20, 12, 4, 10)
CAMEROON_NIGERIA: Box = (5, 18, 0, 8)  # the Bantu homeland edge
CONGO_BASIN: Box = (5, 32, -6, 8)
GREAT_LAKES: Box = (28, 36, -5, 5)
EAST_COAST: Box = (34, 45, -12, 5)  # coast and Kenya highlands
ZAMBEZI: Box = (10, 45, -18, -4)  # Angola, Zambia, Mozambique
SOUTH_AFRICA: Box = (18, 45, -35, -18)
KHOE_CAPE: Box = (15, 28, -35, -18)
MADAGASCAR: Box = (43, 51, -28, -11)
AFRICA_ALL: tuple[Box, Box] = ((-20, 34, -35, 37), (34, 52, -35, 12))  # all of Africa, without Sinai-Levant or Arabia
# --- Americas ----------------------------------------------------------------------------
BALSAS: Box = (-105, -98, 16, 21)
OAXACA: Box = (-100, -90, 15, 22)
MESOAMERICA: Box = (-110, -85, 12, 25)
SW_US: Box = (-115, -100, 28, 43)
EASTERN_NA: Box = (-100, -70, 25, 43)  # Eastern Woodlands and the Central Plains edge
NE_WOODLANDS: Box = (-85, -60, 43, 50)
CARIBBEAN: Box = (-85, -60, 10, 25)
CENTRAL_AMERICA_S: Box = (-92, -75, 5, 14)
ANDES_N: Box = (-85, -70, -5, 10)
ANDES_C: Box = (-85, -65, -20, -5)
ANDES_S: Box = (-80, -60, -35, -18)
AMAZON_SW: Box = (-70, -60, -17, -8)
AMAZON: Box = (-75, -45, -30, 10)
BRAZIL_E: Box = (-50, -35, -25, -5)
SOUTH_CONE: Box = (-80, -55, -50, -30)
# colonial arrival fronts (Columbian exchange): coarse, for Old World domesticates reaching the Americas
LATIN_AMERICA: Box = (-120, -35, -56, 25)
NA_EAST: Box = (-95, -52, 25, 55)
NA_WEST: Box = (-125, -95, 25, 55)
AUSTRALIA: Box = (112, 155, -45, -10)
# --- fill-in regions found by the coverage check (HYDE cropland with no crop claimed; research 0008 §gaps) ---
EAST_INDIA: Box = (80, 90, 15, 24)
RUSSIA_VOLGA_URALS: Box = (35, 65, 44, 63)
SIBERIA_BELT: Box = (65, 138, 45, 62)
CENTRAL_ASIA_OASES: Box = (60, 80, 36, 45)  # Bactria, Sogdia, Fergana, Tarim edge
MAGHREB: Box = (-18, 35, 27, 38)
NORTH_MEXICO: Box = (-120, -85, 20, 30)
LOWLAND_SOUTH_AMERICA: Box = (-70, -45, -35, 10)
CHAD_BASIN: Box = (10, 25, 8, 18)
ICELAND: Box = (-25, -12, 60, 68)
STEPPE_BELT_E: Box = (60, 120, 44, 55)  # Kazakh and Mongolian steppe farming edge
SW_CHINA: Box = (95, 108, 22, 32)  # Yunnan, Sichuan basin
UPPER_MIDWEST: Box = (-100, -85, 43, 49)  # Minnesota, Wisconsin, Michigan
