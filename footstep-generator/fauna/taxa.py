"""Which PHYLACINE species we keep, what we call them, and their role (prey, predator, herd).

PHYLACINE's trait table has no common names, so the names here are hand-written: species-level for
living animals, genus-level (with a few species overrides) for the extinct ones. Role is a coarse
rule over diet and family, not behaviour data (see docs/ops/fauna.md).
"""

from __future__ import annotations

from dataclasses import dataclass

MIN_KG = 44.0  # the task's size line: large mammals

# Smaller animals people hunted, herded or feared, kept "if easy": the living ones that matter most
# for a steppe/forest/savanna scene.
KEY_SMALLER = frozenset({
    "Canis_lupus", "Lycaon_pictus", "Cuon_alpinus", "Lynx_lynx", "Gulo_gulo", "Hyaena_hyaena",
    "Saiga_tatarica", "Procapra_gutturosa", "Pantholops_hodgsonii", "Gazella_subgutturosa",
    "Antidorcas_marsupialis", "Eudorcas_thomsonii", "Capreolus_capreolus", "Rupicapra_rupicapra",
})
# Terrestrial=1 and Marine=1 in PHYLACINE (it flags semi-aquatic animals); these we want anyway.
SEMI_AQUATIC_KEEP = frozenset({"Hippopotamus_amphibius"})
DROP_ORDERS = frozenset({"Primates"})
DROP_FAMILIES = frozenset({"Phocidae", "Odobenidae", "Otariidae", "Delphinidae", "Iniidae", "Platanistidae", "Lipotidae", "Pontoporiidae"})
DROP_GENERA = frozenset({"Homo"})
# Domesticated or no longer wild in a way that makes a "wild range" meaningless.
DROP_SPECIES = frozenset({"Camelus_dromedarius"})
# Marine mammals that PHYLACINE also marks Terrestrial (sea-ice or coastal dependants): out of scope.
DROP_MARINE_ICE = frozenset({"Ursus_maritimus"})


@dataclass(frozen=True)
class Traits:
    binomial: str
    order: str
    family: str
    mass_kg: float
    status: str  # IUCN code, plus EP = extinct in prehistory
    terrestrial: bool
    marine: bool
    plant_pct: float
    vertebrate_pct: float

    @property
    def genus(self) -> str:
        return self.binomial.split("_")[0]


def from_row(r: dict[str, str]) -> Traits:
    return Traits(
        binomial=r["Binomial.1.2"], order=r["Order.1.2"], family=r["Family.1.2"],
        mass_kg=float(r["Mass.g"]) / 1000, status=r["IUCN.Status.1.2"],
        terrestrial=r["Terrestrial"] == "1", marine=r["Marine"] == "1",
        plant_pct=float(r["Diet.Plant"]), vertebrate_pct=float(r["Diet.Vertebrate"]),
    )


def keep(t: Traits) -> bool:
    """Large (or key smaller) land mammals; no people, apes, seals, whales, domestic forms."""
    if t.binomial in DROP_SPECIES or t.binomial in DROP_MARINE_ICE:
        return False
    if t.order in DROP_ORDERS or t.family in DROP_FAMILIES or t.genus in DROP_GENERA:
        return False
    if not t.terrestrial:
        return False
    if t.marine and t.binomial not in SEMI_AQUATIC_KEEP:
        return False
    return t.mass_kg >= MIN_KG or t.binomial in KEY_SMALLER


# --- role -----------------------------------------------------------------------

HERD_FAMILIES = frozenset({
    "Bovidae", "Equidae", "Camelidae", "Antilocapridae", "Elephantidae", "Mammutidae",
    "Gomphotheriidae", "Stegodontidae", "Giraffidae", "Hippopotamidae",
})
HERD_GENERA = frozenset({"Rangifer", "Cervus", "Dama", "Axis", "Rusa", "Elaphurus", "Sus", "Phacochoerus", "Megaloceros"})
# Bovids that live alone or in small family groups, forest and mountain-ledge species.
NOT_HERD_GENERA = frozenset({"Cephalophus", "Capricornis", "Pseudoryx", "Nilgiritragus", "Oreamnos", "Okapia", "Tragelaphus", "Budorcas"})
BEAR_FAMILIES = frozenset({"Ursidae"})


def role_of(t: Traits) -> str:
    """'predator' | 'herd' | 'prey'.

    predator: eats mostly vertebrates (>= 50%), or is a bear (omnivorous, but the big ones are
              the danger on the ground; the giant panda is the exception).
    herd:     a plant eater from a family or genus whose members form large groups.
    prey:     every other plant eater or omnivore: solitary or small-group animals people hunted.
    """
    if t.vertebrate_pct >= 50:
        return "predator"
    if t.family in BEAR_FAMILIES and t.genus != "Ailuropoda":
        return "predator"
    if t.genus in NOT_HERD_GENERA:
        return "prey"
    if t.family in HERD_FAMILIES or t.genus in HERD_GENERA:
        return "herd"
    return "prey"


# --- names ----------------------------------------------------------------------

def _parse(block: str) -> dict[str, str]:
    out = {}
    for line in block.strip().splitlines():
        key, _, name = line.partition("=")
        out[key.strip()] = name.strip()
    return out


SPECIES_NAMES = _parse("""
Panthera_tigris=Tiger
Panthera_leo=Lion
Panthera_onca=Jaguar
Panthera_pardus=Leopard
Panthera_uncia=Snow leopard
Panthera_spelaea=Cave lion
Panthera_atrox=American lion
Puma_concolor=Puma
Acinonyx_jubatus=Cheetah
Crocuta_crocuta=Spotted hyena
Hyaena_hyaena=Striped hyena
Canis_lupus=Wolf
Canis_dirus=Dire wolf
Lycaon_pictus=African wild dog
Cuon_alpinus=Dhole
Lynx_lynx=Eurasian lynx
Gulo_gulo=Wolverine
Ursus_arctos=Brown bear
Ursus_americanus=American black bear
Ursus_thibetanus=Asian black bear
Ursus_spelaeus=Cave bear
Arctodus_simus=Giant short-faced bear
Tremarctos_ornatus=Spectacled bear
Tremarctos_floridanus=Florida cave bear
Ailuropoda_melanoleuca=Giant panda
Melursus_ursinus=Sloth bear
Helarctos_malayanus=Sun bear
Smilodon_populator=Smilodon (South America)
Smilodon_fatalis=Sabre-toothed cat
Homotherium_latidens=Scimitar-toothed cat
Homotherium_serum=Scimitar-toothed cat (America)
Miracinonyx_trumani=American cheetah
Thylacoleo_carnifex=Marsupial lion
Mammuthus_primigenius=Woolly mammoth
Mammuthus_columbi=Columbian mammoth
Mammuthus_exilis=Channel Islands pygmy mammoth
Mammut_americanum=American mastodon
Elephas_antiquus=Straight-tusked elephant
Elephas_cypriotes=Cyprus dwarf elephant
Elephas_tiliensis=Tilos dwarf elephant
Elephas_mnaidriensis=Sicilian dwarf elephant
Elephas_maximus=Asian elephant
Loxodonta_africana=African elephant
Coelodonta_antiquitatis=Woolly rhinoceros
Elasmotherium_sibiricum=Siberian unicorn (Elasmotherium)
Stephanorhinus_kirchbergensis=Merck's rhinoceros
Stephanorhinus_hemitoechus=Narrow-nosed rhinoceros
Ceratotherium_simum=White rhinoceros
Diceros_bicornis=Black rhinoceros
Rhinoceros_unicornis=Indian rhinoceros
Rhinoceros_sondaicus=Javan rhinoceros
Dicerorhinus_sumatrensis=Sumatran rhinoceros
Megaloceros_giganteus=Giant deer (Irish elk)
Cervalces_scotti=Stag-moose
Alces_alces=Elk / moose
Rangifer_tarandus=Reindeer / caribou
Cervus_elaphus=Red deer
Cervus_canadensis=Wapiti
Cervus_nippon=Sika deer
Dama_dama=Fallow deer
Capreolus_capreolus=Roe deer
Odocoileus_virginianus=White-tailed deer
Odocoileus_hemionus=Mule deer
Bison_bison=American bison
Bison_bonasus=European bison
Bos_primigenius=Aurochs
Bos_gaurus=Gaur
Bos_javanicus=Banteng
Bos_mutus=Wild yak
Bos_sauveli=Kouprey
Bubalus_arnee=Wild water buffalo
Syncerus_caffer=African buffalo
Ovibos_moschatus=Muskox
Saiga_tatarica=Saiga
Equus_ferus=Wild horse
Equus_francisci=Hemionine horse (North America)
Equus_hydruntinus=European wild ass
Equus_ovodovi=Ovodov's horse
Equus_hemionus=Asiatic wild ass (onager)
Equus_kiang=Kiang
Equus_africanus=African wild ass
Equus_grevyi=Grevy's zebra
Equus_quagga=Plains zebra
Equus_zebra=Mountain zebra
Camelus_ferus=Wild Bactrian camel
Lama_guanicoe=Guanaco
Vicugna_vicugna=Vicuna
Camelops_hesternus=Western camel
Antilocapra_americana=Pronghorn
Giraffa_camelopardalis=Giraffe
Okapia_johnstoni=Okapi
Hippopotamus_amphibius=Hippopotamus
Choeropsis_liberiensis=Pygmy hippopotamus
Hippopotamus_lemerlei=Madagascar dwarf hippo
Hippopotamus_madagascariensis=Madagascar hippo
Sus_scrofa=Wild boar
Hylochoerus_meinertzhageni=Giant forest hog
Phacochoerus_africanus=Common warthog
Phacochoerus_aethiopicus=Desert warthog
Hydrochoerus_hydrochaeris=Capybara
Orycteropus_afer=Aardvark
Priodontes_maximus=Giant armadillo
Budorcas_taxicolor=Takin
Boselaphus_tragocamelus=Nilgai
Elaphurus_davidianus=Pere David's deer
Cervus_albirostris=White-lipped deer
Blastocerus_dichotomus=Marsh deer
Pseudoryx_nghetinhensis=Saola
Beatragus_hunteri=Hirola
Nilgiritragus_hylocrius=Nilgiri tahr
Dama_mesopotamica=Persian fallow deer
Addax_nasomaculatus=Addax
Aepyceros_melampus=Impala
Ammotragus_lervia=Barbary sheep
Pseudois_nayaur=Bharal (blue sheep)
Antidorcas_marsupialis=Springbok
Procapra_gutturosa=Mongolian gazelle
Pantholops_hodgsonii=Tibetan antelope (chiru)
Rupicapra_rupicapra=Chamois
Eudorcas_thomsonii=Thomson's gazelle
Macropus_rufus=Red kangaroo
Tapirus_terrestris=Lowland tapir
Tapirus_bairdii=Baird's tapir
Tapirus_indicus=Malayan tapir
Tapirus_pinchaque=Mountain tapir
Diprotodon_optatum=Diprotodon
Megatherium_americanum=Giant ground sloth
Glyptodon_clavipes=Glyptodon
Castoroides_ohioensis=Giant beaver
Macrauchenia_patachonica=Macrauchenia
Toxodon_platensis=Toxodon
""")

# Genus-level names for everything not named above. Extinct genera first, then living ones.
GENUS_NAMES = _parse("""
Arctotherium=South American short-faced bear
Bubalus=Buffalo
Pelorovis=Giant African buffalo
Megaceroides=Giant deer (North Africa)
Spirocerus=Spiral-horned antelope
Candiacervus=Cretan dwarf deer
Sinomegaceros=East Asian giant deer
Euceratherium=Shrub-ox
Bootherium=Woodland muskox
Hexaprotodon=Hexaprotodon (Asian hippo)
Kolpochoerus=Giant pig
Metridiochoerus=Giant warthog
Soergelia=Soergel's ox
Megalotragus=Giant wildebeest
Phanourios=Cyprus pygmy hippo
Sangamona=Fugitive deer
Damaliscus=Hartebeest relative
Rusingoryx=Rusinga antelope
Hemiauchenia=Large-headed llama
Palaeolama=Stout-legged llama
Platygonus=Flat-headed peccary
Haploidoceros=Mediterranean deer
Antifer=South American antlered deer
Sivacobus=Siwalik antelope
Megalovis=Giant sheep
Mylohyus=Long-nosed peccary
Oreamnos=Mountain goat
Praemegaceros=Giant deer
Hemitragus=Tahr
CapriniGen=Goat-antelope
Agalmaceros=Blick's deer
Tetrameryx=Four-horned pronghorn
Stockoceros=Pronghorn (extinct)
Morenelaphus=South American deer
Paraceros=Fragile-horned deer
Navahoceros=Mountain deer
Gazella=Gazelle
Glyptodon=Glyptodont
Doedicurus=Club-tailed glyptodont
Glyptotherium=Glyptodont
Panochthus=Glyptodont
Neuryurus=Glyptodont
Hoplophorus=Glyptodont
Holmesina=Pampathere (giant armadillo relative)
Neosclerocalyptus=Glyptodont
Pampatherium=Pampathere
Eutatus=Giant armadillo
Pachyarmatherium=Armoured xenarthran
Diprotodon=Diprotodon
Palorchestes=Marsupial tapir
Zygomaturus=Giant wombat-like marsupial
Procoptodon=Short-faced kangaroo
Phascolonus=Giant wombat
Sthenurus=Short-faced kangaroo
Simosthenurus=Short-faced kangaroo
Metasthenurus=Short-faced kangaroo
Protemnodon=Giant kangaroo
Macropus=Giant kangaroo
Thylacoleo=Marsupial lion
Maokopia=New Guinea diprotodont
Xenorhinotherium=Litoptern
Macrauchenia=Macrauchenia
Neolicaphrium=Small litoptern
Trigonodops=Toxodont
Toxodon=Toxodon
Mixotoxodon=Toxodont
Stephanorhinus=Forest rhinoceros
Tapirus=Tapir
Hippidion=Hippidion (South American horse)
Equus=Horse / ass
Megatherium=Giant ground sloth
Eremotherium=Giant ground sloth
Lestodon=Giant ground sloth
Scelidodon=Ground sloth
Glossotherium=Ground sloth
Mylodon=Mylodon (ground sloth)
Paramylodon=Harlan's ground sloth
Scelidotherium=Ground sloth
Megalonyx=Jefferson's ground sloth
Nothrotheriops=Shasta ground sloth
Valgipes=Ground sloth
Catonyx=Ground sloth
Nothrotherium=Ground sloth
Megalocnus=Cuban giant sloth
Diabolotherium=Ground sloth (Andean)
Parocnus=Caribbean ground sloth
Elephas=Elephant
Palaeoloxodon=Straight-tusked elephant
Cuvieronius=Cuvier's gomphothere
Notiomastodon=South American gomphothere
Stegodon=Stegodon
Neochoerus=Giant capybara
Amblyrhiza=Giant hutia
Tragelaphus=Spiral-horned antelope
Kobus=Waterbuck / kob
Hippotragus=Sable / roan antelope
Oryx=Oryx
Connochaetes=Wildebeest
Alcelaphus=Hartebeest
Capra=Wild goat / ibex
Ovis=Wild sheep
Capricornis=Serow
Cephalophus=Duiker
Nanger=Gazelle
Redunca=Reedbuck
Axis=Axis deer
Rusa=Rusa deer
Rucervus=Swamp deer
Hippocamelus=Andean deer
Babyrousa=Babirusa
Potamochoerus=Bushpig
Sus=Wild pig
Pongo=Orangutan
""")


def common_name(binomial: str) -> str:
    """Species name, else genus name, else the Latin binomial spelled out."""
    if binomial in SPECIES_NAMES:
        return SPECIES_NAMES[binomial]
    genus = binomial.split("_")[0]
    if genus in GENUS_NAMES:
        return f"{GENUS_NAMES[genus]} ({binomial.replace('_', ' ')})"
    return binomial.replace("_", " ")
