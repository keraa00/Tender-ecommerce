/**
 * Region lists for the countries whose addresses need one picked from a fixed
 * set — a US state, a Japanese prefecture, an Italian province. Codes are ISO
 * 3166-2 without the country prefix; names are as the country writes them in
 * Latin script, which is what goes on a parcel. They are proper nouns and are
 * not translated.
 *
 * Plain data, dependency-free, so the checkout form can import it.
 */

export type Region = { code: string; name: string };

const list = (entries: string): Region[] =>
  entries
    .trim()
    .split("\n")
    .map((line) => {
      const [code, ...name] = line.trim().split(" ");
      return { code, name: name.join(" ") };
    });

/** The 50 states and the District of Columbia. Territories are countries of their own in ISO 3166-1. */
export const US_STATES = list(`
AL Alabama
AK Alaska
AZ Arizona
AR Arkansas
CA California
CO Colorado
CT Connecticut
DE Delaware
DC District of Columbia
FL Florida
GA Georgia
HI Hawaii
ID Idaho
IL Illinois
IN Indiana
IA Iowa
KS Kansas
KY Kentucky
LA Louisiana
ME Maine
MD Maryland
MA Massachusetts
MI Michigan
MN Minnesota
MS Mississippi
MO Missouri
MT Montana
NE Nebraska
NV Nevada
NH New Hampshire
NJ New Jersey
NM New Mexico
NY New York
NC North Carolina
ND North Dakota
OH Ohio
OK Oklahoma
OR Oregon
PA Pennsylvania
RI Rhode Island
SC South Carolina
SD South Dakota
TN Tennessee
TX Texas
UT Utah
VT Vermont
VA Virginia
WA Washington
WV West Virginia
WI Wisconsin
WY Wyoming
`);

const CA_PROVINCES = list(`
AB Alberta
BC British Columbia
MB Manitoba
NB New Brunswick
NL Newfoundland and Labrador
NT Northwest Territories
NS Nova Scotia
NU Nunavut
ON Ontario
PE Prince Edward Island
QC Quebec
SK Saskatchewan
YT Yukon
`);

const AU_STATES = list(`
ACT Australian Capital Territory
NSW New South Wales
NT Northern Territory
QLD Queensland
SA South Australia
TAS Tasmania
VIC Victoria
WA Western Australia
`);

const MX_STATES = list(`
AGU Aguascalientes
BCN Baja California
BCS Baja California Sur
CAM Campeche
CHP Chiapas
CHH Chihuahua
CMX Ciudad de México
COA Coahuila
COL Colima
DUR Durango
GUA Guanajuato
GRO Guerrero
HID Hidalgo
JAL Jalisco
MEX Estado de México
MIC Michoacán
MOR Morelos
NAY Nayarit
NLE Nuevo León
OAX Oaxaca
PUE Puebla
QUE Querétaro
ROO Quintana Roo
SLP San Luis Potosí
SIN Sinaloa
SON Sonora
TAB Tabasco
TAM Tamaulipas
TLA Tlaxcala
VER Veracruz
YUC Yucatán
ZAC Zacatecas
`);

const BR_STATES = list(`
AC Acre
AL Alagoas
AP Amapá
AM Amazonas
BA Bahia
CE Ceará
DF Distrito Federal
ES Espírito Santo
GO Goiás
MA Maranhão
MT Mato Grosso
MS Mato Grosso do Sul
MG Minas Gerais
PA Pará
PB Paraíba
PR Paraná
PE Pernambuco
PI Piauí
RJ Rio de Janeiro
RN Rio Grande do Norte
RS Rio Grande do Sul
RO Rondônia
RR Roraima
SC Santa Catarina
SP São Paulo
SE Sergipe
TO Tocantins
`);

/** States and union territories. */
const IN_STATES = list(`
AN Andaman and Nicobar Islands
AP Andhra Pradesh
AR Arunachal Pradesh
AS Assam
BR Bihar
CH Chandigarh
CG Chhattisgarh
DH Dadra and Nagar Haveli and Daman and Diu
DL Delhi
GA Goa
GJ Gujarat
HR Haryana
HP Himachal Pradesh
JK Jammu and Kashmir
JH Jharkhand
KA Karnataka
KL Kerala
LA Ladakh
LD Lakshadweep
MP Madhya Pradesh
MH Maharashtra
MN Manipur
ML Meghalaya
MZ Mizoram
NL Nagaland
OD Odisha
PY Puducherry
PB Punjab
RJ Rajasthan
SK Sikkim
TN Tamil Nadu
TS Telangana
TR Tripura
UP Uttar Pradesh
UK Uttarakhand
WB West Bengal
`);

/** In their conventional north-to-south order, which is the order of their codes. */
const JP_PREFECTURES = list(`
01 Hokkaido
02 Aomori
03 Iwate
04 Miyagi
05 Akita
06 Yamagata
07 Fukushima
08 Ibaraki
09 Tochigi
10 Gunma
11 Saitama
12 Chiba
13 Tokyo
14 Kanagawa
15 Niigata
16 Toyama
17 Ishikawa
18 Fukui
19 Yamanashi
20 Nagano
21 Gifu
22 Shizuoka
23 Aichi
24 Mie
25 Shiga
26 Kyoto
27 Osaka
28 Hyogo
29 Nara
30 Wakayama
31 Tottori
32 Shimane
33 Okayama
34 Hiroshima
35 Yamaguchi
36 Tokushima
37 Kagawa
38 Ehime
39 Kochi
40 Fukuoka
41 Saga
42 Nagasaki
43 Kumamoto
44 Oita
45 Miyazaki
46 Kagoshima
47 Okinawa
`);

/** The provinces Italian addresses carry as a two-letter abbreviation. */
const IT_PROVINCES = list(`
AG Agrigento
AL Alessandria
AN Ancona
AO Aosta
AR Arezzo
AP Ascoli Piceno
AT Asti
AV Avellino
BA Bari
BT Barletta-Andria-Trani
BL Belluno
BN Benevento
BG Bergamo
BI Biella
BO Bologna
BZ Bolzano
BS Brescia
BR Brindisi
CA Cagliari
CL Caltanissetta
CB Campobasso
CE Caserta
CT Catania
CZ Catanzaro
CH Chieti
CO Como
CS Cosenza
CR Cremona
KR Crotone
CN Cuneo
EN Enna
FM Fermo
FE Ferrara
FI Firenze
FG Foggia
FC Forlì-Cesena
FR Frosinone
GE Genova
GO Gorizia
GR Grosseto
IM Imperia
IS Isernia
AQ L'Aquila
SP La Spezia
LT Latina
LE Lecce
LC Lecco
LI Livorno
LO Lodi
LU Lucca
MC Macerata
MN Mantova
MS Massa-Carrara
MT Matera
ME Messina
MI Milano
MO Modena
MB Monza e Brianza
NA Napoli
NO Novara
NU Nuoro
OR Oristano
PD Padova
PA Palermo
PR Parma
PV Pavia
PG Perugia
PU Pesaro e Urbino
PE Pescara
PC Piacenza
PI Pisa
PT Pistoia
PN Pordenone
PZ Potenza
PO Prato
RG Ragusa
RA Ravenna
RC Reggio Calabria
RE Reggio Emilia
RI Rieti
RN Rimini
RM Roma
RO Rovigo
SA Salerno
SS Sassari
SV Savona
SI Siena
SR Siracusa
SO Sondrio
SU Sud Sardegna
TA Taranto
TE Teramo
TR Terni
TO Torino
TP Trapani
TN Trento
TV Treviso
TS Trieste
UD Udine
VA Varese
VE Venezia
VB Verbano-Cusio-Ossola
VC Vercelli
VR Verona
VV Vibo Valentia
VI Vicenza
VT Viterbo
`);

const ES_PROVINCES = list(`
C A Coruña
VI Álava
AB Albacete
A Alicante
AL Almería
O Asturias
AV Ávila
BA Badajoz
PM Baleares
B Barcelona
BI Bizkaia
BU Burgos
CC Cáceres
CA Cádiz
S Cantabria
CS Castellón
CE Ceuta
CR Ciudad Real
CO Córdoba
CU Cuenca
SS Gipuzkoa
GI Girona
GR Granada
GU Guadalajara
H Huelva
HU Huesca
J Jaén
LO La Rioja
GC Las Palmas
LE León
L Lleida
LU Lugo
M Madrid
MA Málaga
ML Melilla
MU Murcia
NA Navarra
OR Ourense
P Palencia
PO Pontevedra
SA Salamanca
TF Santa Cruz de Tenerife
SG Segovia
SE Sevilla
SO Soria
T Tarragona
TE Teruel
TO Toledo
V Valencia
VA Valladolid
ZA Zamora
Z Zaragoza
`);

const IE_COUNTIES = list(`
CW Carlow
CN Cavan
CE Clare
CO Cork
DL Donegal
D Dublin
G Galway
KY Kerry
KE Kildare
KK Kilkenny
LS Laois
LM Leitrim
LK Limerick
LD Longford
LH Louth
MO Mayo
MH Meath
MN Monaghan
OY Offaly
RN Roscommon
SO Sligo
TA Tipperary
WD Waterford
WH Westmeath
WX Wexford
WW Wicklow
`);

export const REGIONS: Readonly<Record<string, readonly Region[]>> = {
  US: US_STATES,
  CA: CA_PROVINCES,
  AU: AU_STATES,
  MX: MX_STATES,
  BR: BR_STATES,
  IN: IN_STATES,
  JP: JP_PREFECTURES,
  IT: IT_PROVINCES,
  ES: ES_PROVINCES,
  IE: IE_COUNTIES,
};

/** The regions a country's addresses are picked from, or null for free text. */
export function regionsOf(countryCode: string): readonly Region[] | null {
  return REGIONS[countryCode] ?? null;
}

export function regionName(countryCode: string, regionCode: string): string | null {
  return regionsOf(countryCode)?.find((region) => region.code === regionCode)?.name ?? null;
}
