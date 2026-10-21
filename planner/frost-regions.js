/* State and region level zones for the frost-based planting guides (see frost.js).
   One line per place:  code | name shown | typical last spring frost (month-day) | frost-free days | extra weeks tender crops wait | flags
   flags: w = mild winter (cool crops can also be sown through winter), h = hot summer (Jul-Aug), d = hot summer (Jun-Aug),
          x = very hot summer (Jun-Sep).  Southern hemisphere: H = warm summer (Jan-Feb), D = hot summer (Dec-Feb), X = very hot summer (Nov-Mar).
   Australia: the Australian rows are typical values from Bureau of Meteorology station records (days a year with a screen minimum of 2 C or less;
   last spring frost = about one frost day left), set by the planner author. The rows marked LOW in the research notes are estimates; check them against your own garden.
   Rows for the tropical north (au-qld-north, au-wa-north, au-nt-top) are listed so people can pick them, but their months come from the hand-written tropical guide (guides.js), because wet and dry seasons rule there, not frost.
   South Africa: the South African regions are "estimate" rows: typical values set by the planner author from the South African Weather
   Service and Agricultural Research Council climate descriptions and local gardening calendars.  Check them against your own garden.
   Source "table": the United States and Canadian dates are the average frost dates of a representative town in each state or
   province, taken from the Harvest to Table frost-date tables (which draw on NOAA records), checked against the Farmers'
   Almanac city pages.  Source "estimate": the British, Irish, German, French, Dutch, Spanish and New Zealand regions are typical values
   set by the planner author from national weather-service climate descriptions and gardening guides.  Both are
   starting points for the owner to review; a garden in a hollow, on a hill or beside the sea can differ by weeks. */
const T = `
us-al|Alabama (Birmingham)|3-19|241|2|w
us-ak|Alaska (Anchorage)|5-18|118|0|
us-az-desert|Arizona desert (Phoenix)|1-27|317|0|wx
us-az-tucson|Arizona south-east (Tucson)|3-12|225|0|wd
us-az-high|Arizona highlands (Flagstaff)|6-8|116|0|
us-ar|Arkansas (Little Rock)|3-16|244|2|wh
us-ca-socal|California south coast (Los Angeles, San Diego)|1-3|355|10|w
us-ca-bay|California Bay Area (San Francisco)|1-7|350|14|w
us-ca-central|California Central Valley (Sacramento, Fresno)|1-24|321|4|wd
us-ca-bakers|California southern valley (Bakersfield)|2-14|287|3|wd
us-ca-inland|California Inland Empire (Riverside)|3-6|265|2|wd
us-ca-desert|California desert (Palm Springs)|1-8|334|0|wx
us-ca-north|California north coast (Eureka)|3-10|253|8|w
us-ca-wine|California wine country (Santa Rosa)|4-10|207|3|w
us-ca-sierra|California Sierra and mountains|5-15|140|0|
us-co-front|Colorado Front Range (Denver)|5-2|165|0|
us-co-west|Colorado western slope (Grand Junction)|4-20|173|0|
us-co-mtn|Colorado mountains|6-10|90|0|
us-ct|Connecticut (Hartford)|4-22|180|1|
us-de|Delaware (Dover)|4-17|188|1|
us-dc|Washington DC|4-10|200|1|
us-fl-north|Florida north (Jacksonville, Tallahassee)|2-14|295|0|wd
us-fl-central|Florida central (Orlando)|1-31|319|0|wd
us-fl-south|Florida south (Tampa, Miami)|1-10|350|0|wx
us-ga|Georgia (Atlanta)|3-20|244|2|wh
us-ga-coast|Georgia and South Carolina coast (Savannah, Charleston)|2-20|292|1|wh
us-hi|Hawaii|1-1|355|0|wx
us-id|Idaho (Boise)|4-29|171|0|
us-id-north|Idaho north and east (Coeur d'Alene, Pocatello)|5-10|155|0|
us-il-north|Illinois north (Chicago)|4-19|192|1|
us-il-central|Illinois central (Springfield)|4-8|205|1|
us-il-south|Illinois south (Cairo)|3-23|233|1|w
us-in|Indiana (Indianapolis)|4-17|193|1|
us-ia|Iowa (Des Moines)|4-20|183|0|
us-ks|Kansas (Topeka, Wichita)|4-7|205|0|
us-ky|Kentucky (Louisville, Lexington)|4-5|212|1|
us-la|Louisiana (New Orleans, Shreveport)|2-20|290|0|wd
us-me|Maine (Portland)|4-29|169|1|
us-me-north|Maine north (Caribou)|5-19|125|0|
us-md|Maryland (Baltimore)|3-28|234|1|w
us-md-west|Maryland west (Cumberland)|5-1|163|0|
us-ma|Massachusetts (Boston)|4-16|192|2|
us-ma-west|Massachusetts west and central (Amherst, Pittsfield)|5-12|135|0|
us-mi-south|Michigan south (Detroit, Grand Rapids)|4-25|185|1|
us-mi-central|Michigan central (Lansing)|5-6|155|0|
us-mi-up|Michigan Upper Peninsula (Marquette)|5-13|150|0|
us-mn|Minnesota (Minneapolis)|4-30|166|0|
us-mn-north|Minnesota north (Duluth)|5-22|125|0|
us-ms|Mississippi (Jackson)|3-10|248|1|wh
us-mo|Missouri (Kansas City, St. Louis)|4-4|213|1|
us-mt|Montana (Billings, Great Falls)|5-12|136|0|
us-ne|Nebraska (Omaha, Lincoln)|4-17|185|0|
us-nv-south|Nevada south (Las Vegas)|3-13|245|0|wd
us-nv-reno|Nevada north-west (Reno)|5-14|141|0|
us-nv-elko|Nevada north-east (Elko)|6-6|89|0|
us-nh|New Hampshire (Concord)|5-11|143|0|
us-nh-north|New Hampshire north (Berlin)|5-29|109|0|
us-nj|New Jersey (Trenton, New Brunswick)|4-14|195|1|
us-nj-coast|New Jersey coast (Atlantic City)|3-31|225|2|w
us-nm|New Mexico (Albuquerque)|4-16|196|0|
us-nm-north|New Mexico north (Santa Fe)|4-23|179|0|
us-ny-city|New York City and Long Island|4-7|219|2|
us-ny-upstate|New York upstate (Albany, Syracuse, Buffalo)|4-29|170|1|
us-ny-north|New York north (Watertown, Binghamton)|5-5|152|0|
us-nc|North Carolina (Raleigh, Charlotte)|3-23|238|2|w
us-nc-mtn|North Carolina mountains (Asheville)|4-12|195|0|
us-nd|North Dakota (Fargo, Bismarck)|5-12|137|0|
us-oh|Ohio (Columbus, Cincinnati)|4-17|194|1|
us-oh-north|Ohio north (Cleveland, Toledo)|4-22|190|1|
us-ok|Oklahoma (Oklahoma City, Tulsa)|3-30|220|1|wh
us-or-west|Oregon west (Portland)|2-25|279|9|w
us-or-eugene|Oregon Willamette Valley (Eugene, Salem)|4-13|201|2|w
us-or-south|Oregon south (Medford)|4-25|178|1|
us-or-high|Oregon high desert (Bend)|6-8|91|0|
us-pa-east|Pennsylvania east (Philadelphia)|3-30|232|1|w
us-pa-central|Pennsylvania central (Harrisburg)|4-10|201|1|
us-pa-west|Pennsylvania west (Pittsburgh)|4-20|187|1|
us-pa-north|Pennsylvania north-east (Scranton)|4-24|174|0|
us-ri|Rhode Island (Providence)|4-13|197|2|
us-sc|South Carolina (Columbia)|3-14|252|2|wh
us-sd|South Dakota (Sioux Falls, Rapid City)|5-5|151|0|
us-tn|Tennessee (Nashville, Memphis)|3-26|228|2|wh
us-tx-gulf|Texas Gulf coast (Houston, Corpus Christi)|2-5|309|0|wx
us-tx-north|Texas north and central (Dallas)|3-18|249|0|wd
us-tx-plains|Texas Panhandle (Lubbock)|4-1|205|0|
us-tx-west|Texas west (El Paso)|3-26|238|0|wd
us-ut|Utah (Salt Lake City, Ogden)|4-12|200|0|
us-ut-north|Utah north and high (Logan)|5-15|144|0|
us-vt|Vermont (Burlington)|5-8|148|0|
us-va|Virginia (Richmond, Norfolk)|4-2|225|2|w
us-va-west|Virginia west (Roanoke)|4-20|187|0|
us-wa-west|Washington west (Seattle)|2-23|281|10|w
us-wa-east|Washington east (Spokane)|4-20|175|0|
us-wa-yakima|Washington Yakima Valley|4-15|190|0|
us-wv|West Virginia (Charleston)|4-18|193|1|
us-wi|Wisconsin (Madison, Milwaukee)|4-23|182|0|
us-wi-north|Wisconsin north (Green Bay)|5-6|161|0|
us-wy|Wyoming (Cheyenne, Casper)|5-19|130|0|
ca-bc-victoria|British Columbia south coast and Victoria|2-28|284|10|w
ca-bc-van|British Columbia Vancouver and Fraser Valley|3-28|222|7|w
ca-bc-interior|British Columbia southern interior (Kelowna)|4-28|160|0|
ca-bc-north|British Columbia north and mountains (Prince George)|6-10|79|0|
ca-ab-south|Alberta south (Calgary)|5-25|110|0|
ca-ab-central|Alberta central and north (Edmonton)|5-14|123|0|
ca-sk|Saskatchewan (Regina, Saskatoon)|5-24|110|0|
ca-mb|Manitoba (Winnipeg)|5-25|119|0|
ca-on-south|Ontario south (Toronto, Windsor)|4-28|185|1|
ca-on-east|Ontario east and central (Ottawa)|5-6|155|0|
ca-on-north|Ontario north (Thunder Bay, Sudbury)|5-25|110|0|
ca-qc-montreal|Quebec south (Montreal)|5-3|155|0|
ca-qc-city|Quebec City and north|5-18|123|0|
ca-nb|New Brunswick (Fredericton)|5-18|130|0|
ca-ns|Nova Scotia (Halifax)|5-10|160|2|
ca-pe|Prince Edward Island (Charlottetown)|5-17|151|1|
ca-nl|Newfoundland and Labrador (St. John's)|6-2|131|1|
ca-yt|Yukon (Whitehorse, Dawson)|6-3|88|0|
ca-nt|Northwest Territories (Yellowknife)|5-30|109|0|
gb-sw-coast|South-west England coast (Cornwall, Devon, Scilly)|3-15|240|5|w
gb-se|South-east England and London|4-15|200|3|
gb-s-eng|Southern England (Hampshire, Dorset, Oxfordshire)|4-20|190|3|
gb-east|East Anglia and East Midlands|4-25|185|3|
gb-west-mid|West Midlands and the Welsh borders|4-25|185|3|
gb-nw|North-west England (Lancashire, Cumbria)|4-25|190|3|
gb-ne|North-east England and Yorkshire|5-1|170|2|
gb-wales|Wales|4-20|190|4|
gb-scot-low|Scotland lowlands (Edinburgh, Glasgow)|5-5|165|2|
gb-scot-high|Scottish Highlands and Islands|5-20|125|1|
gb-ni|Northern Ireland|4-25|180|3|
ie-munster|Munster (Cork, Kerry, Limerick)|3-28|215|4|
ie-leinster|Leinster (Dublin, Wicklow, Kildare)|4-20|185|3|
ie-connacht|Connacht (Galway, Mayo, Sligo)|4-15|190|3|
ie-ulster|Ulster (Donegal, Cavan, Monaghan)|4-25|175|2|
de-bw|Baden-Württemberg|4-22|185|2|
de-by|Bavaria|5-5|160|2|
de-by-alps|Bavarian Alps and foothills|5-15|140|1|
de-be-bb|Berlin and Brandenburg|5-1|170|2|
de-ni-hb|Lower Saxony and Bremen|5-1|170|2|
de-hh-sh|Hamburg and Schleswig-Holstein|5-5|165|2|
de-he|Hesse|4-28|175|2|
de-mv|Mecklenburg-Western Pomerania|5-5|165|2|
de-nw|North Rhine-Westphalia|4-20|190|2|
de-rp-sl|Rhineland-Palatinate and Saarland|4-15|195|2|
de-sn|Saxony|5-1|165|2|
de-st|Saxony-Anhalt|4-28|170|2|
de-th|Thuringia|5-5|160|2|
fr-bretagne|Brittany|4-1|225|5|
fr-normandie|Normandy|4-10|210|4|
fr-hdf|Hauts-de-France|4-20|195|3|
fr-idf|Île-de-France (Paris)|4-15|200|3|
fr-grand-est|Grand Est (Alsace, Lorraine, Champagne)|4-25|185|2|
fr-pdl|Pays de la Loire|4-5|220|4|
fr-cvl|Centre-Val de Loire|4-15|205|3|
fr-bfc|Burgundy-Franche-Comté|4-25|185|2|
fr-na|Nouvelle-Aquitaine (Bordeaux, Poitiers)|3-25|235|3|
fr-ara|Auvergne-Rhône-Alpes (Lyon)|4-15|200|2|
fr-occitanie|Occitanie (Toulouse, Montpellier)|3-20|240|1|wh
fr-paca|Provence-Alpes-Côte d'Azur|3-1|270|0|wh
fr-corse|Corsica|2-20|285|0|wh
nl-west|Netherlands west coast (Holland, Zeeland)|4-15|205|3|
nl-north|Netherlands north (Groningen, Friesland, Drenthe)|4-28|180|2|
nl-centre|Netherlands centre (Utrecht, Gelderland, Flevoland)|4-28|180|2|
nl-east|Netherlands east (Overijssel)|4-30|175|2|
nl-south|Netherlands south (Brabant, Limburg)|4-20|190|2|
es-galicia|Galicia (Santiago, A Coruña, Vigo)|3-15|255|3|w
es-asturias|Asturias and Cantabria|3-10|260|3|w
es-vasco|Basque Country (Bilbao, San Sebastián)|3-20|245|2|w
es-navarra|Navarre and La Rioja|4-8|205|1|h
es-castilla-leon|Castilla y León (Valladolid, Burgos, León)|5-8|160|0|
es-aragon|Aragon (Zaragoza, Huesca, Teruel valleys)|3-30|220|0|d
es-pirineos|Pyrenees and high mountains|5-25|125|0|
es-cat-coast|Catalonia coast (Barcelona, Tarragona)|2-15|290|0|wh
es-cat-inland|Catalonia inland (Lleida, Girona hills)|3-28|225|0|h
es-madrid|Madrid and Castilla-La Mancha|4-12|200|0|d
es-extremadura|Extremadura|3-5|250|0|wd
es-valencia|Valencia and Alicante|1-25|330|0|wd
es-murcia|Murcia and Almería inland|2-15|300|0|wx
es-andalucia|Andalusia interior (Seville, Córdoba, Jaén)|2-20|290|0|wd
es-costa-sol|Andalusia coast (Málaga, Cádiz, Almería coast)|1-10|350|0|wh
es-baleares|Balearic Islands|2-1|320|0|wh
es-canarias|Canary Islands|1-1|360|0|w
nz-northland|Northland|8-15|285|5|w
nz-auckland|Auckland|8-20|280|5|w
nz-waikato|Waikato and Taranaki|9-1|260|6|w
nz-bop|Bay of Plenty and Gisborne|8-25|270|6|w
nz-hb|Hawke's Bay|9-10|245|6|w
nz-wellington|Wellington and Wairarapa|9-5|250|7|w
nz-nelson|Nelson and Marlborough|9-20|225|5|w
nz-westcoast|West Coast|9-10|240|7|w
nz-canterbury|Canterbury|10-10|190|2|
nz-otago|Otago and coastal Southland|10-15|185|2|
nz-central-otago|Central Otago and Queenstown|10-30|160|1|
au-nsw-northcoast|NSW mid and north coast (Coffs Harbour, Port Macquarie)|8-5|320|0|w
au-nsw-sydney|Sydney basin and Central Coast, Newcastle|8-1|340|0|w
au-nsw-southcoast|Illawarra and NSW south coast|8-1|335|0|w
au-nsw-hunter|Hunter Valley and outer western Sydney|9-5|255|1|w
au-nsw-mountains|Blue Mountains and Southern Highlands|10-10|205|2|
au-nsw-tablelands|Central Tablelands (Bathurst, Orange, Lithgow)|10-28|160|2|
au-nsw-centralwest|Central west and south-west slopes (Cowra, Mudgee, Wagga Wagga)|10-20|180|2|D
au-nsw-northwest|North-west slopes and plains (Gunnedah, Moree, Narrabri)|9-1|265|1|D
au-nsw-northtablelands|Northern Tablelands (Armidale, Glen Innes)|11-5|150|3|
au-nsw-goulburn|Southern Tablelands (Goulburn, Yass)|10-26|168|2|
au-act|Canberra and Queanbeyan|11-5|150|3|
au-nsw-snowy|Monaro and Snowy (Cooma, Jindabyne)|12-10|75|0|
au-vic-melbourne|Melbourne and Bellarine|8-25|290|1|w
au-vic-southwest|South-west coast (Port Fairy, Warrnambool)|7-25|335|0|w
au-vic-gippsland|Gippsland|9-10|250|1|w
au-vic-highlands|Central highlands (Ballarat, Daylesford)|11-10|145|3|
au-vic-north|Northern and central Victoria (Bendigo, Shepparton)|10-15|195|2|D
au-vic-mallee|Mallee and Sunraysia (Mildura)|8-31|259|0|D
au-vic-alpine|High country valleys (Bright, Mansfield)|11-15|140|3|
au-qld-north|Tropical north (Cairns, Townsville, Bowen, Mackay)|1-1|365|0|wX
au-qld-seq|South-east Queensland (Brisbane, Gold and Sunshine Coasts)|7-20|350|0|wH
au-qld-downs|Darling Downs (Toowoomba, Warwick, Dalby)|8-28|275|1|D
au-qld-granite|Granite Belt (Stanthorpe, Applethorpe)|10-10|199|2|
au-qld-central|Central Queensland (Rockhampton, Emerald, Longreach)|7-10|350|0|X
au-tas-south|Hobart and the south-east|9-8|266|2|
au-tas-north|Launceston and the north|10-5|200|2|
au-tas-northwest|North-west coast (Devonport, Burnie)|9-20|240|2|
au-tas-highlands|Central highlands and east coast uplands|11-15|120|3|
au-sa-adelaide|Adelaide and plains|7-25|345|0|wD
au-sa-hills|Adelaide Hills|10-5|205|2|
au-sa-barossa|Barossa, Clare and Fleurieu|10-10|202|2|
au-sa-southeast|South-east (Mount Gambier)|10-24|193|2|
au-sa-riverland|Riverland and Mallee|8-31|259|0|D
au-sa-outback|Far north and outback (Oodnadatta, Coober Pedy)|8-5|308|0|X
au-wa-perth|Perth and the Swan Coastal Plain|7-25|345|0|wD
au-wa-southwest|South-west (Busselton, Margaret River, Albany)|9-9|288|1|w
au-wa-wheatbelt|Wheatbelt (Northam, Goomalling, Merredin)|9-15|275|1|D
au-wa-goldfields|Goldfields (Kalgoorlie)|8-19|305|0|X
au-wa-north|Pilbara and Kimberley|1-1|365|0|wX
au-nt-top|Top End (Darwin, Katherine)|1-1|365|0|wX
au-nt-centre|Alice Springs and central Australia|8-30|256|0|X
za-highveld|Highveld: Johannesburg, Pretoria, Midrand|8-25|275|0|
za-eastern|Eastern Highveld and Free State east (Ermelo, Bethlehem, Lydenburg)|10-5|200|0|
za-freestate|Free State and North West (Bloemfontein, Kroonstad, Potchefstroom)|9-10|235|0|D
za-karoo|Karoo and Northern Cape (Kimberley, Upington, Beaufort West)|8-15|280|0|X
za-limpopo|Limpopo bushveld and Mpumalanga lowveld (Polokwane, Nelspruit)|7-20|315|0|wX
za-kzn-coast|KwaZulu-Natal coast and north (Durban, Richards Bay)|7-10|350|0|wD
za-kzn-midlands|KZN Midlands and foothills (Pietermaritzburg, Howick)|9-5|245|0|
za-ec-coast|Eastern Cape coast (East London, Gqeberha, Garden Route)|7-25|340|2|w
za-ec-inland|Eastern Cape inland (Queenstown, Graaff-Reinet, Makhanda)|9-10|235|0|D
za-wc-coast|Western Cape coast and Cape Peninsula (Cape Town, Hermanus)|7-25|345|0|wH
za-wc-inland|Western Cape inland valleys (Paarl, Worcester, Oudtshoorn)|8-5|320|0|wD
`;
const HOT = { h: [7, 8], d: [6, 7, 8], x: [6, 7, 8, 9], H: [1, 2], D: [12, 1, 2], X: [11, 12, 1, 2, 3] };   // lower case: northern summers; upper case: southern summers
const AU_STATE = { nsw: 'New South Wales', act: 'New South Wales', vic: 'Victoria', qld: 'Queensland', tas: 'Tasmania', sa: 'South Australia', wa: 'Western Australia', nt: 'Northern Territory' };
const GROUP = { US: 'By state or region', CA: 'By province or territory', GB: 'By region', IE: 'By province', DE: 'By state', FR: 'By region', NL: 'By region', NZ: 'By region', ES: 'By region', ZA: 'By region' };
/* returns { US: [[code, name, [m, d], days, {winter, hot, late, group}], ...], ... } */
export const REGIONS = {};
for (const line of T.trim().split('\n')) {
  const [code, name, md, free, late, flags] = line.split('|');
  const cc = code.slice(0, 2).toUpperCase(), [m, d] = md.split('-').map(Number), o = { group: cc === 'AU' ? AU_STATE[code.split('-')[1]] : GROUP[cc] };
  if (+late) o.late = +late;
  if (flags.includes('w')) o.winter = 1;
  for (const k of Object.keys(HOT)) if (flags.includes(k)) o.hot = HOT[k];
  if (cc === 'AU') {   // southern summer crops: planting stops by the end of January; winter sowing of cool crops where winters are mild (255+ frost-free days); autumn jobs (garlic, broad beans, autumn sowings) are counted from the end of May at the latest, because the first frost comes in July or never; slow-spring wait is at most one week
    o.cap = [1, 31]; o.fcap = [5, 31]; if (+free >= 255) o.winter = 1; if (o.late) o.late = Math.round(o.late / 3);
  }
  (REGIONS[cc] = REGIONS[cc] || []).push([code, name, [m, d], +free, o]);
}
