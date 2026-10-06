const MAX_LEVEL=45;
const MAX_STAT_LEVEL=9;
const SPAWN_SHIELD_SECONDS=5;
const MAP_WIDTH=6400;
const MAP_HEIGHT=6400;
const CENTER_ZONE_SIZE=1600;
const MAX_SHAPES=100;
const PENTAGON_CENTER_CHANCE=.80;
const BULLET_RAW_STATS=Object.freeze({health:.165,penetration:1,damage:6,range:90,pushability:.3,speed:3.75,acceleration:null,shield:0,regeneration:0,resist:null});
const BASIC_BARREL_STATS=Object.freeze({reload:10.5,recoil:1.4,shudder:.1,spray:15,size:1,health:1,penetration:1,damage:.75,speed:4.5,maxSpeed:1,density:1,resist:1});
const RAW_BULLET_RANGE_UNITS_PER_SECOND=45;
const DIFFICULTIES={easy:{botCount:4,statMultiplier:1,xpMultiplier:1},medium:{botCount:6,statMultiplier:1,xpMultiplier:1.25},hard:{botCount:8,statMultiplier:1,xpMultiplier:1.5}};
const BARREL_WIDTH_SCALE=1.42;
const BARREL_LENGTH_SCALE=.94;
const xpNeeded=(level)=>{
  const normalized=Math.max(1,Math.floor(level));
  if(normalized===1)return 1;
  if(normalized===2)return 4;
  const raw=normalized**2;
  return raw>1000?Math.round(raw/10)*10:Math.round(raw/5)*5;
};
const skillPointsForLevel=(level)=>level>=2&&level<=40?1:level>=41&&level<=45&&level%2===1?1:0;
const skillPointsAtLevel=(level)=>{let total=0;for(let current=2;current<=Math.min(MAX_LEVEL,Math.floor(level));current++)total+=skillPointsForLevel(current);return total};
const skillCurve=(rank)=>Math.log(1+4*Math.max(0,Math.min(MAX_STAT_LEVEL,rank))/MAX_STAT_LEVEL)/Math.log(5);
const tankRadius=(level)=>18+18*(Math.max(1,Math.min(MAX_LEVEL,level))-1)/(MAX_LEVEL-1);
const respawnLevel=(level)=>Math.max(1,Math.floor(level*.45));
const scoreForLevel=(level)=>Array.from({length:Math.max(0,level-1)},(_,i)=>xpNeeded(i+1)).reduce((sum,n)=>sum+n,0);
const levelProgressFromScore=(score)=>{let level=1,xp=Math.max(0,Math.floor(score));while(level<MAX_LEVEL&&xp>=xpNeeded(level)){xp-=xpNeeded(level);level++}if(level===MAX_LEVEL)xp=0;return {level,xp}};
// 75% normal, 15% Beta, 5% Crasher, 4% Alpha, 1% Omega.
const tierFromRoll=(roll)=>roll<.01?4:roll<.05?3:roll<.10?'crasher':roll<.25?2:1;
const bulletHealth=(rank,multiplier=1)=>5*multiplier*(1+2*skillCurve(rank));
const bulletDamage=(rank,multiplier=1)=>10*multiplier*(1+3*skillCurve(rank));
const tankBulletDamage=(rank,multiplier=1)=>5*multiplier*(1+3*skillCurve(rank));
const sizeSpeedMultiplier=(level)=>1-.18*(Math.max(1,Math.min(MAX_LEVEL,level))-1)/(MAX_LEVEL-1);
const tankStats=(ranks,level,m=1)=>({
  r:tankRadius(level),
  // Arras-style Max Health: diminishing gains through the 9 ranks, reaching
  // three times this game's baseline HP at rank 9. Regeneration stays custom.
  maxHp:100*m*(1+2*skillCurve(ranks.health)),
  regen:5*m+ranks.regen*2.5,
  bodyDamage:12*m*(1+skillCurve(ranks.body)),
  bulletSpeed:320*m*(1+skillCurve(ranks.bulletSpeed)),
  bulletHealth:bulletHealth(ranks.bulletHealth,m),
  bulletPenetration:1+2.5*skillCurve(ranks.bulletPenetration),
  damage:bulletDamage(ranks.damage,m),
  tankDamage:tankBulletDamage(ranks.damage,m),
  reload:.5/m*Math.pow(.5,skillCurve(ranks.reload)),
  speed:230*m*sizeSpeedMultiplier(level)*(1+.8*skillCurve(ranks.speed))
});
const SHAPE_IMPACT_DAMAGE={circle:6,square:7,triangle:10,pentagon:15,hexagon:20};
const SHAPE_STATS={
  circle:[12,1,5,0],
  square:[18,40,15,4],
  triangle:[21,100,50,3],
  pentagon:[28,400,150,5],
  hexagon:[36,1000,500,6]
};
const SHAPE_SIZE_MULTIPLIERS=[0,1,1.45,1.95,2.35];
const LARGE_SHAPE_SIZE_MULTIPLIERS=[0,1,1.30,1.60,1.90];
const EGG_TIER_RADII=[0,12,17,17*1.45,17*1.95];
const shapeRadius=(type,tier=1)=>{
  if(tier==='crasher')return SHAPE_STATS[type][0];
  if(type==='circle')return EGG_TIER_RADII[tier];
  if(type==='triangle'&&tier===4)return SHAPE_STATS[type][0]*2.55;
  const multipliers=type==='pentagon'||type==='hexagon'?LARGE_SHAPE_SIZE_MULTIPLIERS:SHAPE_SIZE_MULTIPLIERS;
  return SHAPE_STATS[type][0]*multipliers[tier];
};
const shapeTypeFromRoll=(roll)=>roll<.40?'circle':roll<.675?'square':roll<.85?'triangle':roll<.95?'pentagon':'hexagon';
const SHAPE_ORBIT_RADIUS=15;
const barrel=(angle=0,offset=0,length=43,width=18)=>({angle,offset,length,width});
const barrelWidth=(gun,tankSize)=>gun.width*BARREL_WIDTH_SCALE*tankSize/25;
const barrelLength=(gun,tankSize)=>gun.length*BARREL_LENGTH_SCALE*tankSize/25;
const bulletRadius=(gun,tankSize)=>barrelWidth(gun,tankSize)/2;
const classes={
  basic:{name:'Basic',tier:0,desc:'Podstawowe działo',guns:[{...barrel(),...BASIC_BARREL_STATS}],next:['twin','sniper','machine','flank']},
  twin:{name:'Twin',tier:1,desc:'Dwie równoległe lufy',guns:[barrel(0,-11),barrel(0,11)],damage:.62,reload:.95,next:['triple','quad']},
  sniper:{name:'Sniper',tier:1,desc:'Szybkie, mocne pociski o dużym zasięgu',guns:[barrel(0,0,58,16)],damage:1.55,reload:1.35,speed:1.4,life:1.9,next:['assassin','hunter']},
  machine:{name:'Machine Gun',tier:1,desc:'Szybki ogień z rozrzutem',guns:[barrel(0,0,40,26)],damage:.58,reload:.48,spread:.15,next:['destroyer','gunner']},
  flank:{name:'Flank Guard',tier:1,desc:'Strzela jednocześnie do przodu i do tyłu',guns:[barrel(),barrel(Math.PI)],damage:.72,reload:1,next:['triAngle']},
  triple:{name:'Triple Shot',tier:2,desc:'Salwa w trzech kierunkach',guns:[barrel(-.35),barrel(),barrel(.35)],damage:.62,reload:1,next:['triplet','spread']},
  quad:{name:'Quad Tank',tier:2,desc:'Cztery lufy dookoła kadłuba',guns:[0,Math.PI/2,Math.PI,Math.PI*1.5].map(a=>barrel(a)),damage:.82,next:['octo']},
  assassin:{name:'Assassin',tier:2,desc:'Długi zasięg i bardzo szybkie pociski',guns:[barrel(0,0,65,17)],damage:1.85,reload:1.4,speed:1.65,life:2,next:['ranger']},
  hunter:{name:'Hunter',tier:2,desc:'Podwójna skoncentrowana salwa',guns:[barrel(0,-7,58,14),barrel(0,7,48,20)],damage:.95,reload:1.25,speed:1.4,life:1.8,next:['predator']},
  destroyer:{name:'Destroyer',tier:2,desc:'Wielkie pociski, silny odrzut',guns:[barrel(0,0,49,34)],damage:4,reload:2.1,speed:.8,radius:14,recoil:2.2,next:['annihilator']},
  gunner:{name:'Gunner',tier:2,desc:'Cztery małe lufy, gęsty ostrzał',guns:[-15,-5,5,15].map(o=>barrel(0,o,45,9)),damage:.31,reload:.65,radius:4,next:['sprayer']},
  triAngle:{name:'Tri-Angle',tier:2,desc:'Tylne działa pomagają szybko atakować i uciekać',guns:[barrel(),barrel(Math.PI-.48,0,39,15),barrel(Math.PI+.48,0,39,15)],damage:.65,reload:.86,recoil:1.15,next:['booster','fighter']},
  triplet:{name:'Triplet',tier:3,desc:'Trzy mocne lufy skierowane do przodu',guns:[barrel(0,-16),barrel(0,16),barrel(0,0,55)],damage:.72,reload:.9,next:[]},
  spread:{name:'Spread Shot',tier:3,desc:'Pięć pocisków szeroką salwą',guns:[-.5,-.25,0,.25,.5].map(a=>barrel(a)),damage:.56,reload:.95,next:[]},
  octo:{name:'Octo Tank',tier:3,desc:'Osiem luf — ostrzał pełnego okręgu',guns:Array.from({length:8},(_,i)=>barrel(i*Math.PI/4)),damage:.72,next:[]},
  ranger:{name:'Ranger',tier:3,desc:'Największy zasięg i moc precyzyjnego strzału',guns:[barrel(0,0,73,18)],damage:2.3,reload:1.45,speed:1.9,life:2.2,next:[]},
  predator:{name:'Predator',tier:3,desc:'Trzy dalekosiężne pociski w salwie',guns:[barrel(0,-12,53,13),barrel(0,12,53,13),barrel(0,0,67,20)],damage:.9,reload:1.35,speed:1.55,life:2,next:[]},
  annihilator:{name:'Annihilator',tier:3,desc:'Potężne działo z ogromnymi pociskami',guns:[barrel(0,0,56,42)],damage:5.5,reload:2.3,speed:.85,radius:18,recoil:3,next:[]},
  sprayer:{name:'Sprayer',tier:3,desc:'Bardzo szybkie podwójne salwy',guns:[barrel(0,-7,49,16),barrel(0,8,37,10)],damage:.5,reload:.45,spread:.12,next:[]},
  booster:{name:'Booster',tier:3,desc:'Bardzo szybki tank napędzany czterema tylnymi lufami',guns:[barrel(),barrel(Math.PI-.22,0,39,14),barrel(Math.PI+.22,0,39,14),barrel(Math.PI-.50,0,35,12),barrel(Math.PI+.50,0,35,12)],damage:.44,reload:.58,recoil:1.35,next:[]},
  fighter:{name:'Fighter',tier:3,desc:'Mobilny ostrzał do przodu, na boki i do tyłu',guns:[barrel(),barrel(Math.PI,0,40,15),barrel(Math.PI/2,0,38,14),barrel(-Math.PI/2,0,38,14)],damage:.56,reload:.72,recoil:1.15,next:[]}
};

// Class tree follows the Arras-style 15 / 30 / 45 progression. All branches
// share player stats; classes only change weapon layout and firing behavior.
const classInfo={
  twin:['Twin',1,'Dwie identyczne lufy strzelają naprzemiennie','twin',.82,.5],
  sniper:['Sniper',1,'Dłuższa lufa, szybszy pocisk i większy zasięg, ale wolniejsze przeładowanie','long',1,1.35],
  machine:['Machine Gun',1,'Trapezowa lufa strzela dwa razy szybciej, ale z większym rozrzutem','wide',.58,.5],
  flank:['Flank Guard',1,'Jedna lufa z przodu i dwie identyczne lufy z tyłu','rear',.58,1],
  director:['Director',1,'Steruje maksymalnie sześcioma dronami','drone',.65,1.05],
  pounder:['Pounder',1,'Wielkie pociski z mocnym odrzutem','heavy',2.8,1.8],
  trapper:['Trapper',1,'Wyrzutnia min spowalniających przeciwników','trap',.7,1.1],
  desmos:['Desmos',1,'Działo z bocznymi trójkątami strzela pociskami po sinusoidzie','wave',.75,1],
  smasher:['Smasher',2,'Bez lufy; duże obrażenia ciała i obracająca się sześciokątna osłona','none',0,1],
  doubleTwin:['Double Twin',2,'Cztery równoległe lufy','quadTwin',.34,.9],
  hewnDouble:['Hewn Double',3,'Sześć równych luf: dwie prosto i cztery pod kątem 25 stopni','hewn',.48,1],
  autoDoubleTwin:['Auto-Double Twin',3,'Double Twin z centralną automatyczną wieżyczką','autoTwin',.48,1],
  triple:['Triple Shot',2,'Trzy lufy rozłożone wachlarzowo','triple',.55,1],
  hexaTank:['Hexa Tank',2,'Sześć identycznych luf rozmieszczonych równomiernie','hexa',.58,1],
  helix:['Helix',2,'Dwa działa Desmosa strzelają falującymi pociskami w przeciwnych kierunkach','helix',.52,.86],
  assassin:['Assassin',2,'Bardzo daleki i mocny strzał','long',1.6,1.35],
  hunter:['Hunter',2,'Dwie lufy oddają skupioną salwę','hunter',.78,1.15],
  minigun:['Minigun',2,'Bardzo szybki ostrzał','wide',.48,.42],
  rifle:['Rifle',2,'Długa lufa z szybkim pociskiem','rifle',1.1,.82],
  marksman:['Marksman',2,'Działo z zębami: mniej obrażeń, ale większa wytrzymałość pocisku','marksman',1.15,1.05],
  artillery:['Artillery',2,'Działo i boczne lufy wspierające salwę','artillery',.78,1.1],
  sprayer:['Sprayer',2,'Szybkie, krótkie serie z dwóch luf','spray',.48,.45],
  destroyer:['Destroyer',2,'Wielki pocisk z silnym odrzutem','heavy',3.7,1.9],
  gunner:['Gunner',2,'Cztery wąskie lufy','gunner',.28,.58],
  triAngle:['Tri-Angle',2,'Tylne działa zwiększają mobilność','triangle',.58,.82],
  auto3:['Auto-3',2,'Trzy lufy z osłaniającymi automatami','auto3',.54,.9],
  trapGuard:['Trap Guard',2,'Działo i wyrzutnia min','trapGuard',.64,1],
  triTrapper:['Tri-Trapper',2,'Wyrzutnie min w trzech kierunkach','triTrap',.58,.95],
  overseer:['Overseer',2,'Podwójna wyrzutnia dronów','dronePair',.52,1],
  cruiser:['Cruiser',2,'Działa wysyłające samonaprowadzające drony','cruiser',.42,.85],
  underseer:['Underseer',2,'Wyrzutnie min i dronów','underseer',.56,1],
  spawner:['Spawner',2,'Wyrzutnia kolejnych dronów','drone',.5,.8],
  builder:['Builder',2,'Wyrzutnia blokujących min','trap',.78,1.1],
  launcher:['Launcher',2,'Wyrzutnia przyspieszających rakiet','missile',1.15,1.05],
  hexTrapper:['Hexa-Trapper',2,'Sześć wyrzutni min wokół czołgu','hexTrap',.4,1],
  skimmer:['Skimmer',2,'Wyrzutnia sterowanej rakiety','missile',1.1,1.1],
  twister:['Twister',2,'Rakiety rozdzielające się na pociski','missilePair',.72,1],
  swarmer:['Swarmer',3,'Wiele lekkich rakiet','missileFan',.38,.82],
  sidewinder:['Sidewinder',3,'Boczne rakiety z falującym ruchem','sidewinder',.6,.9],
  triplet:['Triplet',3,'Trzy skupione lufy','triplet',.68,.88],
  spread:['Spreadshot',3,'Jedna główna i dziesięć coraz mniejszych luf tworzy szeroką salwę','spread',.28,.95],
  penta:['Penta Shot',3,'Pięć luf pokrywa szeroki obszar','penta',.4,1],
  hewnHybrid:['Hewn Hybrid',3,'Ciężkie działo i wyrzutnia dronów','hybrid',1.45,1.35],
  triplex:['Triplex',3,'Trzy koncentryczne lufy','triplex',.55,.9],
  octo:['Octo Tank',3,'Osiem luf dookoła kadłuba','octo',.55,1],
  ranger:['Ranger',3,'Maksymalny zasięg i precyzja','long',1.95,1.3],
  predator:['Predator',3,'Dalmierz i trzy skupione lufy','predator',.75,1.15],
  annihilator:['Annihilator',3,'Największe działo i potężny odrzut','huge',4.5,2.1],
  streamliner:['Streamliner',3,'Pięć luf w jednej linii','stream',.35,.72],
  nailgun:['Nailgun',3,'Szybka seria drobnych pocisków','nail',.24,.42],
  autoGunner:['Auto-Gunner',3,'Wąskie działa z automatycznym celowaniem','gunner',.28,.58],
  gunnerTrapper:['Gunner Trapper',3,'Wąskie lufy oraz wyrzutnia min','trapGuard',.38,.72],
  cyclone:['Cyclone',3,'Dwanaście małych luf tworzy gęsty pierścień pocisków','cyclone',.22,.72],
  hexaTrapper:['Hexa-Trapper',3,'Sześć wyrzutni min','hexTrap',.36,.9],
  fighter:['Fighter',3,'Mobilny ostrzał w czterech kierunkach','fighter',.48,.72],
  booster:['Booster',3,'Tylne lufy napędzają szybki czołg','booster',.4,.56],
  fortress:['Fortress',3,'Trzy wyrzutnie min i trzy wyrzutnie rojów ustawione na przemian','fortress',.42,.95],
  overlord:['Overlord',3,'Wiele dronów osłania czołg','dronePair',.5,.82],
  autoOverseer:['Auto-Overseer',3,'Automatyczne celowanie i drony','autoDrone',.44,.9],
  overdrive:['Overdrive',3,'Szybkie drony i krótki czas odnowienia','dronePair',.4,.68],
  carrier:['Carrier',3,'Wyrzutnie dużej liczby dronów','carrier',.34,.72],
  battleship:['Battleship',3,'Boczne wyrzutnie dronów','battleship',.4,.8],
  necromancer:['Necromancer',3,'Drony krążące wokół czołgu','necro',.5,.95],
  maleficitor:['Maleficitor',3,'Kamuflaż i przywoływane drony','necro',.48,.9],
  infestor:['Infestor',3,'Wyrzutnie przejmujących dronów','dronePair',.46,.9],
  factory:['Factory',3,'Fabryka małych dronów','carrier',.3,.72],
  autoSpawner:['Auto-Spawner',3,'Automatyczna wyrzutnia dronów','autoDrone',.42,.82],
  hybrid:['Hybrid',3,'Działo Destroyera i tylna wyrzutnia trzech niekontrolowanych dronów','hybrid',1.45,1.35],
  conqueror:['Conqueror',3,'Działo i miny blokujące','conqueror',1.35,1.35],
  landmine:['Landmine',3,'Po 10 sekundach bez ruchu staje się niewidzialny','none',0,1],
  spike:['Spike',3,'Smasher ze znacznie większymi obrażeniami ciała','none',0,1],
  autoSmasher:['Auto-Smasher',3,'Smasher z podwójną automatyczną wieżyczką','autoTwin',.6,1],
  falcon:['Falcon',3,'Lufa Assassina z przodu i trzy lufy napędowe z tyłu','falcon',.58,.8],
  stalker:['Stalker',3,'Długa trapezowa lufa; po dwóch sekundach postoju staje się niewidzialny','stalker',1.7,1.3],
  deadeye:['Deadeye',3,'Działo Assassin-Marksman z charakterystycznymi zębami','deadeye',1.35,1.2],
  nimrod:['Nimrod',3,'Warstwowa, skupiona przednia salwa','nimrod',.62,.8],
  revolver:['Revolver',3,'Krótka lufa i szybki strzał','revolver',.62,.55],
  fork:['Fork',3,'Pocisk po zniszczeniu rozdziela się na trzy mniejsze pociski','fork',1.35,1.05],
  hexa:['Hexa Tank',3,'Sześć luf pokrywa niemal pełne koło','hexa',.42,.95],
  auto5:['Auto-5',3,'Pięć automatycznych dział','auto5',.28,.65],
  mega3:['Mega-3',3,'Trzy ciężkie lufy','mega3',.8,1.2],
  banshee:['Banshee',3,'Drony wspierają wielolufowy ostrzał','banshee',.42,.8],
  constructor:['Constructor',3,'Rozstawia miny budujące osłonę','trap',.8,1.1],
  engineer:['Engineer',3,'Wyrzutnia min osłonowych i działo','trapGuard',.62,.9],
  boomer:['Boomer',3,'Miny odbijają się i wracają','boomer',.7,1],
  assembler:['Assembler',3,'Składa pociski z kilku części','assembler',.7,1],
  skimmer2:['Skimmer',3,'Rakieta o dużym zasięgu','missile',1.2,1.05],
  twister2:['Twister',3,'Wielopoziomowa wyrzutnia rakiet','missilePair',.72,.92],
  ordnance:['Ordnance',3,'Podwójna dalekosiężna salwa','ordnance',.7,1],
  poacher:['Poacher',3,'Zestaw Huntera z tylnym spawnerem niekontrolowanych dronów','poacher',.65,1.15],
  cropDuster:['Crop Duster',3,'Pięć przednich luf Miniguna i tylny spawner dronów','cropDuster',.32,.68],
  vulture:['Vulture',3,'Przednie lufy Miniguna i trzy lufy napędowe z tyłu','vulture',.36,.72],
  bomber:['Bomber',3,'Salwa pocisków i min','bomber',.48,.82],
  surfer:['Surfer',3,'Tri-Angle z dwiema bocznymi wyrzutniami rojów','surfer',.4,.58],
  eagle:['Eagle',3,'Działo Poundera z przodu i trzy lufy napędowe z tyłu','eagle',.82,1.15],
  phoenix:['Phoenix',3,'Działo Sprayera z przodu i trzy lufy napędowe z tyłu','phoenix',.42,.62],
  redistributor:['Redistributor',3,'Sześć luf rozkładających salwę','hexa',.4,.9],
  atomizer:['Atomizer',3,'Szybkie, krótkie pociski','nail',.28,.42],
  focal:['Focal',3,'Skupia salwę w wąskim kącie','triplet',.7,1],
  bulwark:['Bulwark',3,'Pancerna osłona z działem i minami','trapGuard',.75,1],
  musket:['Musket',3,'Długa lufa wsparta boczną salwą','musket',.9,1],
  armsman:['Armsman',3,'Wiele precyzyjnych luf','armsman',.37,.78],
  quadruplex:['Quadruplex',3,'Cztery lufy oddają skupioną salwę','quad',.48,.86],
  septaTrapper:['Septa-Trapper',3,'Siedem wyrzutni min','septaTrap',.31,.9],
  architect:['Architect',3,'Buduje osłony z rozstawianych min','fortress',.48,.92],
  autoCruiser:['Auto-Cruiser',3,'Automatyczny celownik i drony','autoDrone',.43,.82],
  commander:['Commander',3,'Trzy wyrzutnie dronów i trzy wyrzutnie rojów na przemian','commander',.36,.76],
  tripleTwin:['Triple Twin',3,'Sześć równych luf ustawionych w trzech parach','tripleTwin',.45,1],
  bentDouble:['Bent Double',3,'Dwie potrójne salwy skierowane do przodu i do tyłu','bentDouble',.42,1],
  bentHybrid:['Bent Hybrid',3,'Triple Shot z tylnym spawnerem niekontrolowanych dronów','bentHybrid',.48,1],
  auto4:['Auto-4',3,'Cztery podwójne automatyczne wieżyczki','auto4',.27,.7],
  machineGunner:['Machine Gunner',3,'Pięć trapezowych miniluf z większym rozrzutem','machineGunner',.23,.5],
  overgunner:['Overgunner',3,'Dwie lufy Gunnera z przodu i dwie wyrzutnie dronów z tyłu','overgunner',.35,.75],
  quadruplex:['Quadruplex',3,'Cztery działa Desmosa oddalone od siebie o 90 stopni','quadruplex',.55,1],
  dual:['Dual',3,'Dwa zestawy luf Huntera ustawione jak Twin','dual',.48,1.1],
  autoAssassin:['Auto-Assassin',3,'Assassin z centralną automatyczną wieżyczką','autoAssassin',1.35,1.3],
  single:['Single',3,'Krótka pojedyncza lufa z szybkim przeładowaniem','single',.9,.65],
  xHunter:['X-Hunter',3,'Hunter z trapezową podstawą i większym przybliżeniem','xHunter',.72,1.2],
  mortar:['Mortar',3,'Główne ciężkie działo i cztery mniejsze lufy boczne','mortar',.55,1],
  beekeeper:['Beekeeper',3,'Działo główne i krótkie wyrzutnie samonaprowadzających dronów','beekeeper',.48,.9],
  fieldGun:['Field Gun',3,'Wyrzutnia rakiet z dwiema małymi lufami po bokach','fieldGun',.72,1],
  autoTriAngle:['Auto-Tri-Angle',3,'Tri-Angle z centralną automatyczną wieżyczką','autoTriAngle',.48,.82],
  bushwhacker:['Bushwhacker',3,'Długa lufa Snipera z przodu i wyrzutnia min z tyłu','bushwhacker',.9,1.2],
  overtrapper:['Overtrapper',3,'Wyrzutnia min z przodu i dwie wyrzutnie dronów z tyłu','overtrapper',.48,1],
  manager:['Manager',3,'Dłuższy spawner dronów; po postoju staje się niewidzialny','manager',.58,1],
  bigCheese:['Big Cheese',3,'Jeden bardzo duży i wytrzymały dron','bigCheese',1.5,1.8],
  autoBuilder:['Auto-Builder',3,'Builder z centralną automatyczną wieżyczką','autoBuilder',.72,1.1],
  shotgun:['Shotgun',3,'Skupiona salwa dużych i małych pocisków rozprasza się w locie','shotgun',.32,1.25],
  megaSmasher:['Mega Smasher',3,'Większa sześciokątna osłona i większa gęstość','none',0,1],
  barricade:['Barricade',3,'Trzy wyrzutnie min ustawione w jednej linii','barricade',.42,.58],
  crossbow:['Crossbow',3,'Trzy lufy Rifle i cztery dodatkowe małe lufy rozchodzące się na boki','crossbow',.38,.8]
};
const patterns={
  none:[],twin:[barrel(0,-15,43,14),barrel(0,15,43,14)],long:[barrel(0,0,66,16)],wide:[{...barrel(0,0,42,26),shape:'trapezoid'}],rear:[barrel(0,0,43,18),barrel(Math.PI-.28,-7,40,15),barrel(Math.PI+.28,7,40,15)],
  heavy:[barrel(0,0,49,34)],quadTwin:[barrel(0,-13),barrel(0,13),barrel(Math.PI,-13),barrel(Math.PI,13)],
  hewn:[barrel(0,-14,44,14),barrel(0,14,44,14),barrel(-.44,-12,42,14),barrel(.44,12,42,14),barrel(Math.PI-.44,-12,42,14),barrel(Math.PI+.44,12,42,14)],autoTwin:[barrel(0,-15,43,14),barrel(0,15,43,14),barrel(Math.PI,-15,43,14),barrel(Math.PI,15,43,14)],
  triple:[barrel(-.34),barrel(),barrel(.34)],quad:[0,Math.PI/2,Math.PI,Math.PI*1.5].map(a=>barrel(a)),
  wave:[{...barrel(0,0,43,18),shape:'desmos'}],helix:[{...barrel(0,-14,43,14),shape:'desmos'},{...barrel(Math.PI,14,43,14),shape:'desmos'}],hunter:[barrel(0,0,58,24),barrel(0,0,48,12)],rifle:[barrel(0,0,59,12)],marksman:[{...barrel(0,0,62,17),shape:'desmos'}],
  artillery:[barrel(),barrel(-.24,0,34,12),barrel(.24,0,34,12)],spray:[barrel(0,-8,48,16),barrel(0,8,36,12)],
  gunner:[-14,-5,5,14].map(o=>barrel(0,o,44,9)),triangle:[barrel(),barrel(Math.PI-.5,0,39,15),barrel(Math.PI+.5,0,39,15)],
  auto3:[barrel(),barrel(-2.1),barrel(2.1)],trapGuard:[barrel(),barrel(Math.PI,0,35,22)],triTrap:[-.75,0,.75].map(a=>barrel(a,0,35,22)),
  drone:[{...barrel(0,0,34,25),shape:'spawner'}],dronePair:[{...barrel(Math.PI/2,0,35,22),shape:'spawner'},{...barrel(-Math.PI/2,0,35,22),shape:'spawner'}],cruiser:[{...barrel(-.3,-9,35,18),shape:'spawner'},{...barrel(.3,9,35,18),shape:'spawner'}],underseer:[{...barrel(Math.PI/2,0,34,24),shape:'spawner'},{...barrel(-Math.PI/2,0,34,22),shape:'spawner'}],
  trap:[{...barrel(0,0,38,24),shape:'launcher'}],missile:[{...barrel(0,0,45,23),shape:'deployer'}],missilePair:[{...barrel(-.16,-7,42,19),shape:'deployer'},{...barrel(.16,7,42,19),shape:'deployer'}],missileFan:[-.3,0,.3].map(a=>({...barrel(a,0,39,17),shape:'deployer'})),
  sidewinder:[barrel(Math.PI/2,0,40,21),barrel(-Math.PI/2,0,40,21)],hexTrap:Array.from({length:6},(_,i)=>barrel(i*Math.PI/3,0,32,20)),
  triplet:[barrel(0,-15,48,16),barrel(0,15,48,16),barrel(0,0,55,20)],spread:[barrel(0,0,52,18),...[-.82,-.66,-.5,-.34,-.18,.18,.34,.5,.66,.82].map((a,i)=>barrel(a,0,42-Math.abs(i-4.5)*3,11-Math.abs(i-4.5)*.55))],
  penta:[-.7,-.35,0,.35,.7].map(a=>barrel(a)),hybrid:[barrel(0,0,49,34),{...barrel(Math.PI,0,34,22),shape:'spawner'}],triplex:[{...barrel(-.34,0,43,17),shape:'desmos'},barrel(0,0,53,15),{...barrel(.34,0,43,17),shape:'desmos'}],
  octo:Array.from({length:8},(_,i)=>barrel(i*Math.PI/4)),predator:[barrel(0,0,67,28),barrel(0,0,56,18),barrel(0,0,45,10)],huge:[barrel(0,0,56,42)],
  stream:[barrel(0,-13,55,9),barrel(0,-6,58,9),barrel(0,0,62,10),barrel(0,6,58,9),barrel(0,13,55,9)],nail:[barrel(0,-7,43,9),barrel(0,7,43,9)],
  cyclone:Array.from({length:12},(_,i)=>barrel(i*Math.PI/6,0,35,9)),fighter:[barrel(),barrel(Math.PI-.48,0,36,14),barrel(Math.PI+.48,0,36,14),barrel(Math.PI/2,0,36,13),barrel(-Math.PI/2,0,36,13)],
  booster:[barrel(),barrel(Math.PI-.22,0,39,14),barrel(Math.PI+.22,0,39,14),barrel(Math.PI-.5,0,35,12),barrel(Math.PI+.5,0,35,12)],
  fortress:Array.from({length:6},(_,i)=>({...barrel(i*Math.PI/3,0,32,19),shape:i%2?'spawner':'launcher'})),auto:[barrel()],autoDrone:[{...barrel(Math.PI/2,0,34,22),shape:'spawner'},{...barrel(-Math.PI/2,0,34,22),shape:'spawner'}],
  carrier:[-.45,0,.45].map(a=>({...barrel(a,0,34,21),shape:'spawner'})),battleship:[{...barrel(Math.PI/2,-10,34,18),shape:'spawner'},{...barrel(Math.PI/2,10,34,18),shape:'spawner'},{...barrel(-Math.PI/2,-10,34,18),shape:'spawner'},{...barrel(-Math.PI/2,10,34,18),shape:'spawner'}],
  necro:[0,Math.PI/2,Math.PI,Math.PI*1.5].map(a=>({...barrel(a,0,33,22),shape:'spawner'})),conqueror:[barrel(0,0,50,34),{...barrel(Math.PI,0,39,28),shape:'launcher'}],deadeye:[{...barrel(0,0,55,22),shape:'desmos'}],nimrod:[{...barrel(0,0,62,27),shape:'desmos'},barrel(0,0,50,14)],
  revolver:[{...barrel(0,0,49,14),shape:'desmos'}],fork:[{...barrel(0,0,55,20),shape:'desmos'}],hexa:Array.from({length:6},(_,i)=>barrel(i*Math.PI/3)),
  auto5:[barrel(),...Array.from({length:4},(_,i)=>barrel(Math.PI/2+i*Math.PI/2,0,32,15))],mega3:[barrel(0,-12,48,24),barrel(0,0,55,30),barrel(0,12,48,24)],
  banshee:[{...barrel(Math.PI/3,0,34,21),shape:'spawner'},{...barrel(Math.PI,0,34,21),shape:'spawner'},{...barrel(Math.PI*5/3,0,34,21),shape:'spawner'}],trapGuard2:[barrel(),barrel(Math.PI,0,36,22)],boomer:[barrel(0,0,38,22)],assembler:[barrel(0,-8,38,17),barrel(0,8,38,17)],
  ordnance:[barrel(0,0,58,23),barrel(0,0,47,12),barrel(-.34,-10,35,10),barrel(.34,10,35,10)],musket:[barrel(0,-14,55,12),barrel(0,14,55,12)],cropDuster:[...[-12,-6,0,6,12].map(o=>barrel(0,o,45,9)),{...barrel(Math.PI,0,32,20),shape:'spawner'}],
  bomber:[barrel(),{...barrel(Math.PI,0,38,24),shape:'launcher'},barrel(Math.PI-.48,0,34,12),barrel(Math.PI+.48,0,34,12)],redistribute:[barrel(0,0,50,20),barrel(0,0,44,14),barrel(0,0,38,9)],armsman:[barrel(0,0,55,12),{...barrel(Math.PI,0,32,20),shape:'spawner'}],
  septaTrap:Array.from({length:7},(_,i)=>({...barrel(i*Math.PI*2/7,0,32,19),shape:'launcher'})),
  tripleTwin:Array.from({length:3},(_,i)=>[barrel(i*Math.PI*2/3,-12,42,14),barrel(i*Math.PI*2/3,12,42,14)]).flat(),
  bentDouble:[-.44,0,.44].flatMap(a=>[barrel(a),barrel(Math.PI+a)]),bentHybrid:[barrel(-.34),barrel(),barrel(.34),{...barrel(Math.PI,0,34,22),shape:'spawner'}],
  auto4:Array.from({length:4},(_,i)=>barrel(i*Math.PI/2,-8,30,10)).flatMap((g,i)=>[g,{...g,offset:8}]),machineGunner:[-18,-9,0,9,18].map(o=>({...barrel(0,o,42,10),shape:'trapezoid'})),
  overgunner:[barrel(0,-8,43,9),barrel(0,8,43,9),{...barrel(Math.PI,-10,32,20),shape:'spawner'},{...barrel(Math.PI,10,32,20),shape:'spawner'}],quadruplex:Array.from({length:4},(_,i)=>({...barrel(i*Math.PI/2,0,42,18),shape:'desmos'})),
  dual:[barrel(0,-15,54,18),barrel(0,-15,43,10),barrel(0,15,54,18),barrel(0,15,43,10)],autoAssassin:[barrel(0,0,66,16)],single:[barrel(0,0,43,18)],
  xHunter:[{...barrel(0,0,60,25),base:true},barrel(0,0,49,13)],mortar:[barrel(0,0,49,30),barrel(-.34,-8,38,11),barrel(.34,8,38,11),barrel(-.62,-12,34,9),barrel(.62,12,34,9)],
  beekeeper:[barrel(0,0,49,30),{...barrel(-.36,-9,30,15),shape:'spawner'},{...barrel(.36,9,30,15),shape:'spawner'}],fieldGun:[{...barrel(0,0,45,23),shape:'deployer'},barrel(-.25,-8,34,10),barrel(.25,8,34,10)],
  autoTriAngle:[barrel(),barrel(Math.PI-.5,0,39,15),barrel(Math.PI+.5,0,39,15)],bushwhacker:[barrel(0,0,62,16),{...barrel(Math.PI,0,38,24),shape:'launcher'}],
  overtrapper:[{...barrel(0,0,38,24),shape:'launcher'},{...barrel(Math.PI,-12,32,20),shape:'spawner'},{...barrel(Math.PI,12,32,20),shape:'spawner'}],manager:[{...barrel(0,0,42,25),shape:'spawner'}],bigCheese:[{...barrel(0,0,46,36),shape:'spawner'}],
  autoBuilder:[{...barrel(0,0,40,29),shape:'launcher'}],shotgun:[barrel(-.22,-12,43,15),barrel(0,-5,47,19),barrel(0,5,47,12),barrel(.22,12,43,15)],commander:Array.from({length:6},(_,i)=>({...barrel(i*Math.PI/3,0,32,i%2?17:21),shape:'spawner'})),
  stalker:[{...barrel(0,0,66,22),shape:'trapezoid'}],falcon:[barrel(0,0,65,16),barrel(Math.PI,0,38,14),barrel(Math.PI-.42,-8,34,12),barrel(Math.PI+.42,8,34,12)],poacher:[barrel(0,0,58,24),barrel(0,0,48,12),{...barrel(Math.PI,0,32,20),shape:'spawner'}],
  vulture:[...[-12,-6,0,6,12].map(o=>barrel(0,o,43,8)),barrel(Math.PI,0,36,13),barrel(Math.PI-.42,-8,33,11),barrel(Math.PI+.42,8,33,11)],surfer:[barrel(),barrel(Math.PI-.48,0,36,14),barrel(Math.PI+.48,0,36,14),{...barrel(Math.PI/2,0,29,16),shape:'spawner'},{...barrel(-Math.PI/2,0,29,16),shape:'spawner'}],
  eagle:[barrel(0,0,49,34),barrel(Math.PI,0,38,14),barrel(Math.PI-.42,-8,34,12),barrel(Math.PI+.42,8,34,12)],phoenix:[barrel(0,-8,48,16),barrel(0,8,36,12),barrel(Math.PI,0,38,14),barrel(Math.PI-.42,-8,34,12),barrel(Math.PI+.42,8,34,12)]
  ,barricade:[-13,0,13].map(o=>({...barrel(0,o,40,13),shape:'launcher'})),crossbow:[barrel(0,0,54,12),barrel(-.2,-9,42,9),barrel(.2,9,42,9),barrel(-.45,-14,34,8),barrel(.45,14,34,8),barrel(-.68,-16,30,7),barrel(.68,16,30,7)]
};
const links={
  basic:['twin','sniper','machine','flank','director','pounder','trapper','desmos'],
  twin:['doubleTwin','triple','gunner','hexaTank','helix'],
  sniper:['assassin','hunter','minigun','rifle','marksman'],
  machine:['artillery','minigun','gunner','sprayer'],
  flank:['hexaTank','triAngle','auto3','trapGuard','triTrapper'],
  director:['overseer','cruiser','underseer','spawner'],
  pounder:['destroyer','builder','artillery','launcher'],
  trapper:['builder','triTrapper','trapGuard'],
  desmos:['helix'],
  smasher:['megaSmasher','spike','autoSmasher','landmine'],
  doubleTwin:['tripleTwin','hewnDouble','autoDoubleTwin','bentDouble'],
  triple:['penta','spread','bentHybrid','bentDouble','triplet','triplex'],
  gunner:['autoGunner','nailgun','auto4','machineGunner','gunnerTrapper','cyclone','overgunner'],
  hexaTank:['octo','cyclone','hexaTrapper'],
  helix:['triplex','quadruplex'],
  assassin:['ranger','falcon','stalker','autoAssassin','single','deadeye'],
  hunter:['predator','xHunter','poacher','ordnance','dual','nimrod'],
  minigun:['streamliner','nailgun','cropDuster','barricade','vulture'],
  rifle:['musket','crossbow','armsman','revolver'],
  marksman:['deadeye','nimrod','revolver','fork'],
  artillery:['mortar','ordnance','beekeeper','fieldGun'],
  sprayer:['redistributor','phoenix','atomizer','focal'],
  triAngle:['fighter','booster','falcon','bomber','autoTriAngle','surfer','eagle','phoenix','vulture'],
  auto3:['auto5','mega3','auto4','banshee'],
  trapGuard:['bushwhacker','gunnerTrapper','bomber','conqueror','bulwark'],
  triTrapper:['fortress','hexaTrapper','septaTrapper','architect'],
  overseer:['overlord','overtrapper','overgunner','banshee','autoOverseer','overdrive','commander'],
  cruiser:['carrier','battleship','fortress','autoCruiser','commander'],
  underseer:['necromancer','maleficitor','infestor'],
  spawner:['factory','autoSpawner'],
  destroyer:['conqueror','annihilator','hybrid','constructor'],
  builder:['constructor','autoBuilder','engineer','boomer','assembler','architect','conqueror'],
  launcher:['skimmer2','twister2','swarmer','sidewinder','fieldGun']
};
for(const [id,info] of Object.entries(classInfo)){
  const [name,tier,desc,pattern,damage,reload]=info;
  classes[id]={name,tier,desc,visual:pattern,guns:(patterns[pattern]??[barrel()]).map(g=>({...g,mode:g.mode??(/drone|overseer|carrier|banshee|necro|cruiser|spawner|manager|cheese|commander/.test(pattern)?'drone':/trap|builder|fortress|septa|boomer|architect|barricade|overtrapper/.test(pattern)?'trap':/missile|fieldGun/.test(pattern)?'missile':/wave|helix|triplex|quadruplex/.test(pattern)?'wave':'bullet')})),damage,reload,next:[]};
  if(pattern==='none')classes[id].guns=[];
}
classes.triAngle.recoil=1.15;classes.booster.recoil=1.35;classes.fighter.recoil=1.15;classes.destroyer.recoil=2.2;classes.annihilator.recoil=3;classes.ranger.speed=1.7;classes.assassin.speed=1.45;classes.sniper.speed=1.4;
classes.smasher.bodyDamage=1.7;classes.landmine.bodyDamage=1.5;classes.spike.bodyDamage=2.5;classes.stalker.cloak=true;
classes.twin.fireGroups=[[0],[1]];classes.dual.fireGroups=[[0,1],[2,3]];classes.machine.spread=.16;classes.machineGunner.spread=.14;classes.smasher.bodyDamage=1.7;classes.megaSmasher.bodyDamage=2;classes.landmine.bodyDamage=1.5;classes.landmine.cloak=true;classes.landmine.cloakDelay=10;classes.spike.bodyDamage=2.5;classes.stalker.cloak=true;classes.stalker.cloakDelay=2;classes.manager.cloak=true;classes.manager.cloakDelay=2;classes.maleficitor.cloak=true;classes.maleficitor.cloakDelay=2;
for(const id of ['autoDoubleTwin','auto3','autoGunner','auto4','auto5','mega3','banshee','architect','autoAssassin','autoTriAngle','autoOverseer','autoCruiser','autoSpawner','autoBuilder','autoSmasher'])classes[id].autoAim=true;
for(const id of ['smasher','megaSmasher','spike','landmine','autoSmasher'])classes[id].shell=true;
Object.assign(classes.smasher,{shellType:'hex'});Object.assign(classes.megaSmasher,{shellType:'megaHex',shellScale:1.34});Object.assign(classes.spike,{shellType:'spike',shellScale:1.34});Object.assign(classes.landmine,{shellType:'landmine',shellScale:1.30});Object.assign(classes.autoSmasher,{shellType:'hex',hideBodyGuns:true,centralTwin:true});
Object.assign(classes.auto3,{turretCount:3,hideBodyGuns:true});Object.assign(classes.auto5,{turretCount:5,hideBodyGuns:true});Object.assign(classes.mega3,{turretCount:3,turretScale:1.25,hideBodyGuns:true});Object.assign(classes.auto4,{turretCount:4,turretTwin:true,hideBodyGuns:true});Object.assign(classes.architect,{turretCount:3,turretLauncher:true,hideBodyGuns:true,autoAim:true});Object.assign(classes.banshee,{turretCount:3});classes.hexaTrapper.autoAim=false;classes.fork.split=3;
for(const id of ['underseer','necromancer','maleficitor','overdrive'])if(classes[id])classes[id].bodyShape='square';

// Exact barrel silhouettes copied from the named tanks in the supplied Arras tree.
// Mixed classes keep a mode on every barrel so their bullets, traps and drones
// behave like the weapon that is actually visible.
const vg=(angle=0,offset=0,length=43,width=18,extra={})=>({...barrel(angle,offset,length,width),...extra});
const bullet=(angle=0,offset=0,length=43,width=18,extra={})=>vg(angle,offset,length,width,{mode:'bullet',...extra});
const trap=(angle=0,offset=0,length=38,width=24,extra={})=>vg(angle,offset,length,width,{mode:'trap',shape:'launcher',...extra});
const block=(angle=0,offset=0,length=40,width=29,extra={})=>vg(angle,offset,length,width,{mode:'trap',shape:'block',...extra});
const drone=(angle=0,offset=0,length=34,width=24,extra={})=>vg(angle,offset,length,width,{mode:'drone',shape:'spawner',...extra});
const swarm=(angle=0,offset=0,length=31,width=18,extra={})=>vg(angle,offset,length,width,{mode:'swarm',shape:'swarm',...extra});
const missile=(angle=0,offset=0,length=45,width=23,extra={})=>vg(angle,offset,length,width,{mode:'missile',shape:'deployer',...extra});
const desmos=(angle=0,offset=0,length=48,width=18,extra={})=>vg(angle,offset,length,width,{mode:'wave',shape:'desmos',...extra});
const exactGuns={
  basic:[bullet()],twin:[bullet(0,-15,43,14),bullet(0,15,43,14)],sniper:[bullet(0,0,61,15)],machine:[bullet(0,0,43,27,{shape:'trapezoid'})],
  flank:[bullet(),bullet(Math.PI-.62,0,40,15),bullet(Math.PI+.62,0,40,15)],director:[drone()],pounder:[bullet(0,0,49,34)],trapper:[trap()],desmos:[desmos()],smasher:[],
  doubleTwin:[bullet(0,-13,43,15),bullet(0,13,43,15),bullet(Math.PI,-13,43,15),bullet(Math.PI,13,43,15)],
  triple:[bullet(-.34),bullet(0,0,49,18),bullet(.34)],gunner:[-14,-5,5,14].map(o=>bullet(0,o,43,9)),hexaTank:Array.from({length:6},(_,i)=>bullet(i*Math.PI/3,0,39,15)),helix:[desmos(0,-12,43,14,{wavePhase:0}),desmos(0,12,43,14,{wavePhase:Math.PI})],
  assassin:[bullet(0,0,65,16,{base:true})],hunter:[bullet(0,0,59,25),bullet(0,0,48,12)],minigun:[bullet(0,0,43,22,{shape:'trapezoid'}),bullet(0,0,49,15),bullet(0,0,55,9)],rifle:[bullet(0,0,59,12,{base:true})],marksman:[bullet(0,0,61,17,{shape:'marksman'})],
  artillery:[bullet(0,0,50,28),bullet(-.27,-8,37,10),bullet(.27,8,37,10)],sprayer:[bullet(0,0,48,24,{shape:'trapezoid'}),bullet(0,0,40,11)],
  triAngle:[bullet(),bullet(Math.PI-.47,0,38,14),bullet(Math.PI+.47,0,38,14)],auto3:[bullet(),bullet(Math.PI*2/3),bullet(Math.PI*4/3)],trapGuard:[bullet(),trap(Math.PI)],triTrapper:[trap(0),trap(Math.PI*2/3),trap(Math.PI*4/3)],
  overseer:[drone(Math.PI/2),drone(-Math.PI/2)],cruiser:[swarm(-.42,-7),swarm(.42,7)],underseer:[drone(0,0,34,24,{projectile:'square'}),drone(Math.PI,0,34,24,{projectile:'square'})],spawner:[drone(0,0,38,27,{shape:'minion',mode:'minion'})],
  destroyer:[bullet(0,0,52,39)],builder:[block()],launcher:[missile()],
  tripleTwin:Array.from({length:3},(_,i)=>[bullet(i*Math.PI*2/3,-12,42,14),bullet(i*Math.PI*2/3,12,42,14)]).flat(),
  hewnDouble:[bullet(0,-14,43,14),bullet(0,14,43,14),bullet(-.44,0,40,14),bullet(.44,0,40,14),bullet(Math.PI,-14,43,14),bullet(Math.PI,14,43,14)],
  autoDoubleTwin:[bullet(0,-13),bullet(0,13),bullet(Math.PI,-13),bullet(Math.PI,13)],bentDouble:[-.44,0,.44].flatMap(a=>[bullet(a),bullet(Math.PI+a)]),
  penta:[bullet(-.70,0,40,15),bullet(-.35,0,46,16),bullet(0,0,52,18),bullet(.35,0,46,16),bullet(.70,0,40,15)],spread:[bullet(0,0,52,18),...[-.82,-.66,-.50,-.34,-.18,.18,.34,.50,.66,.82].map((a,i)=>bullet(a,0,42-Math.abs(i-4.5)*3,11-Math.abs(i-4.5)*.55))],
  bentHybrid:[bullet(-.34),bullet(),bullet(.34),drone(Math.PI)],triplet:[bullet(0,-15,48,16),bullet(0,15,48,16),bullet(0,0,55,20)],triplex:[desmos(-.34,0,43,17),bullet(0,0,53,15),desmos(.34,0,43,17)],
  autoGunner:[-14,-5,5,14].map(o=>bullet(0,o,43,9)),nailgun:[bullet(0,0,45,19,{shape:'trapezoid'}),bullet(0,0,51,13),bullet(0,0,57,8)],auto4:[bullet(),bullet(Math.PI/2),bullet(Math.PI),bullet(Math.PI*1.5)],
  machineGunner:[-18,-9,0,9,18].map(o=>bullet(0,o,42,10,{shape:'trapezoid'})),gunnerTrapper:[bullet(0,-6,43,9,{base:true}),bullet(0,6,43,9,{base:true}),trap(Math.PI,0,40,27)],cyclone:Array.from({length:12},(_,i)=>bullet(i*Math.PI/6,0,34,9)),overgunner:[bullet(0,-7,43,9,{base:true}),bullet(0,7,43,9,{base:true}),drone(Math.PI,-10),drone(Math.PI,10)],
  octo:Array.from({length:8},(_,i)=>bullet(i*Math.PI/4,0,37,14)),hexaTrapper:Array.from({length:6},(_,i)=>trap(i*Math.PI/3,0,34,20)),quadruplex:Array.from({length:4},(_,i)=>desmos(i*Math.PI/2,0,42,18)),
  ranger:[bullet(0,0,69,14,{base:true})],predator:[bullet(0,0,67,28),bullet(0,0,56,18),bullet(0,0,45,10)],stalker:[bullet(0,0,66,22,{shape:'trapezoid'})],falcon:[bullet(0,0,65,16,{base:true}),bullet(Math.PI,0,38,14),bullet(Math.PI-.43,0,34,12),bullet(Math.PI+.43,0,34,12)],
  poacher:[bullet(0,0,58,24),bullet(0,0,48,12),drone(Math.PI)],deadeye:[bullet(0,0,65,18,{shape:'marksman',base:true})],nimrod:[bullet(0,0,62,27,{shape:'marksman'}),bullet(0,0,50,14,{shape:'marksman'})],revolver:[bullet(0,0,54,13,{shape:'marksman',base:true})],fork:[bullet(0,0,58,20,{shape:'marksman'})],
  streamliner:[-12,-6,0,6,12].map((o,i)=>bullet(0,o,52-Math.abs(i-2)*4,8)),crossbow:[bullet(0,0,56,12,{base:true}),bullet(-.20,-9,42,9),bullet(.20,9,42,9),bullet(-.45,-14,34,8),bullet(.45,14,34,8),bullet(-.68,-16,30,7),bullet(.68,16,30,7)],
  musket:[bullet(0,-13,56,12,{base:true}),bullet(0,13,56,12,{base:true})],armsman:[bullet(0,0,59,12,{base:true}),drone(Math.PI)],dual:[bullet(0,-15,56,19),bullet(0,-15,44,10),bullet(0,15,56,19),bullet(0,15,44,10)],autoAssassin:[bullet(0,0,65,16,{base:true})],single:[bullet(0,0,45,18)],xHunter:[bullet(0,0,61,26,{base:true}),bullet(0,0,49,13)],
  mortar:[bullet(0,0,52,28),bullet(-.27,-8,39,11),bullet(.27,8,39,11),bullet(-.53,-12,34,9),bullet(.53,12,34,9)],ordnance:[bullet(0,0,60,24),bullet(0,0,49,12),bullet(-.32,-9,36,10),bullet(.32,9,36,10)],beekeeper:[bullet(0,0,50,29),swarm(-.35,-9),swarm(.35,9)],fieldGun:[missile(),bullet(-.27,-8,34,10),bullet(.27,8,34,10)],
  redistributor:[bullet(0,0,51,23,{shape:'trapezoid'}),bullet(0,0,44,14),bullet(0,0,37,8)],atomizer:[bullet(0,0,49,24,{shape:'trapezoid'}),bullet(0,0,40,10,{shape:'trapezoid'})],focal:[bullet(0,0,57,20,{shape:'trapezoid'}),bullet(0,0,50,9)],
  cropDuster:[bullet(0,-9,49,10),bullet(0,0,54,11),bullet(0,9,49,10),drone(Math.PI)],vulture:[bullet(0,-9,47,9),bullet(0,0,52,10),bullet(0,9,47,9),bullet(Math.PI,0,37,13),bullet(Math.PI-.43,0,33,11),bullet(Math.PI+.43,0,33,11)],
  fighter:[bullet(),bullet(Math.PI-.48,0,36,14),bullet(Math.PI+.48,0,36,14),bullet(Math.PI/2,0,36,13),bullet(-Math.PI/2,0,36,13)],booster:[bullet(),bullet(Math.PI-.22,0,39,14),bullet(Math.PI+.22,0,39,14),bullet(Math.PI-.50,0,35,12),bullet(Math.PI+.50,0,35,12)],
  bomber:[bullet(),trap(Math.PI),bullet(Math.PI-.48,0,34,12),bullet(Math.PI+.48,0,34,12)],surfer:[bullet(),bullet(Math.PI-.48,0,36,14),bullet(Math.PI+.48,0,36,14),swarm(Math.PI/2),swarm(-Math.PI/2)],eagle:[bullet(0,0,50,34),bullet(Math.PI,0,38,14),bullet(Math.PI-.43,0,34,12),bullet(Math.PI+.43,0,34,12)],phoenix:[bullet(0,0,49,24,{shape:'trapezoid'}),bullet(0,0,40,10),bullet(Math.PI,0,38,14),bullet(Math.PI-.43,0,34,12),bullet(Math.PI+.43,0,34,12)],
  autoTriAngle:[bullet(),bullet(Math.PI-.47,0,38,14),bullet(Math.PI+.47,0,38,14)],
  overlord:[drone(0),drone(Math.PI/2),drone(Math.PI),drone(-Math.PI/2)],overtrapper:[trap(),drone(Math.PI,-11),drone(Math.PI,11)],autoOverseer:[drone(Math.PI/2),drone(-Math.PI/2)],overdrive:[drone(Math.PI/2),drone(-Math.PI/2)],
  carrier:[swarm(-.45,-7),swarm(0),swarm(.45,7)],battleship:[swarm(Math.PI/2,-9),swarm(Math.PI/2,9),swarm(-Math.PI/2,-9),swarm(-Math.PI/2,9)],fortress:Array.from({length:6},(_,i)=>i%2?swarm(i*Math.PI/3):trap(i*Math.PI/3,0,34,20)),
  commander:Array.from({length:6},(_,i)=>i%2?swarm(i*Math.PI/3):drone(i*Math.PI/3)),necromancer:[drone(0,0,34,24,{projectile:'square'}),drone(Math.PI/2,0,34,24,{projectile:'square'}),drone(Math.PI,0,34,24,{projectile:'square'}),drone(-Math.PI/2,0,34,24,{projectile:'square'})],maleficitor:[drone(0,0,34,24,{projectile:'square'})],infestor:[swarm(Math.PI/2,-9),swarm(Math.PI/2,9),swarm(-Math.PI/2,-9),swarm(-Math.PI/2,9)],
  factory:[drone(0,0,44,27,{shape:'minion',mode:'minion'})],autoSpawner:[drone(0,0,38,27,{shape:'minion',mode:'minion'})],manager:[drone(0,0,42,25)],bigCheese:[drone(0,0,47,38)],
  hybrid:[bullet(0,0,52,39),drone(Math.PI)],conqueror:[bullet(0,0,52,39),block(Math.PI)],annihilator:[bullet(0,0,58,44)],constructor:[block(0,0,47,35)],autoBuilder:[block()],
  engineer:[block(0,0,42,29,{shape:'engineer',mode:'sentry'})],boomer:[block(0,0,42,27,{base:true,shape:'boomer',mode:'boomer'})],assembler:[block(0,0,43,28,{shape:'assembler',mode:'assembler'})],architect:[block(),block(Math.PI*2/3),block(Math.PI*4/3)],
  skimmer2:[missile()],twister2:[missile(0,-7,43,19),missile(Math.PI,7,43,19)],swarmer:[missile(0,0,44,25,{shape:'hive',mode:'hive'})],sidewinder:[missile(0,0,51,22,{mode:'wave',waveAmplitude:24,waveFrequency:6})],
  shotgun:[bullet(-.24,-12,43,15),bullet(-.08,-5,48,19),bullet(.08,5,45,11),bullet(.24,12,40,8)],barricade:[trap(0,-13,40,13),trap(0,0,43,13),trap(0,13,40,13)],bulwark:[bullet(0,-12,43,14),bullet(0,12,43,14),trap(Math.PI,-12,36,18),trap(Math.PI,12,36,18)],bushwhacker:[bullet(0,0,62,15),trap(Math.PI)],septaTrapper:Array.from({length:7},(_,i)=>trap(i*Math.PI*2/7,0,33,19)),
  autoSmasher:[bullet(0,0,35,11)],megaSmasher:[],spike:[],landmine:[],
  auto5:Array.from({length:5},(_,i)=>bullet(i*Math.PI*2/5)),mega3:Array.from({length:3},(_,i)=>bullet(i*Math.PI*2/3,0,47,23)),banshee:[drone(Math.PI/3),drone(Math.PI),drone(Math.PI*5/3)],
  autoCruiser:[swarm(-.42,-7),swarm(.42,7)]
};
for(const [id,guns] of Object.entries(exactGuns))if(classes[id])classes[id].guns=guns;
// Timing and active-projectile limits observed in the supplied gameplay video.
// Multi-barrel weapons below fire in a smooth sequence instead of releasing an
// artificial single-frame wall of projectiles.
classes.doubleTwin.fireGroups=[[0,2],[1,3]];
classes.tripleTwin.fireGroups=[[0,2,4],[1,3,5]];
classes.minigun.fireGroups=[[0],[1],[2]];classes.minigun.cycleInterval=1/3;
classes.nailgun.fireGroups=[[0],[1],[2]];classes.nailgun.cycleInterval=1/3;
classes.redistributor.fireGroups=[[0],[1],[2]];classes.redistributor.cycleInterval=1/3;
classes.gunner.fireGroups=[[0],[1],[2],[3]];classes.gunner.cycleInterval=1/4;
classes.autoGunner.fireGroups=[[0],[1],[2],[3]];classes.autoGunner.cycleInterval=1/4;
classes.cyclone.fireGroups=classes.cyclone.guns.map((_,i)=>[i]);classes.cyclone.cycleInterval=1/12;
for(const id of ['auto3','auto5']){const def=classes[id];def.autoTurrets=true;def.fireGroups=def.guns.map((_,i)=>[i]);def.cycleInterval=1/def.guns.length}
classes.engineer.activeCap=6;classes.engineer.activeMode='sentry';
for(const id of ['director','overseer','underseer'])Object.assign(classes[id],{activeCap:6,activeMode:'drone'});
Object.assign(classes.overlord,{activeCap:8,activeMode:'drone'});
for(const id of ['overtrapper','overgunner','autoOverseer','overdrive','manager','bigCheese'])if(classes[id])Object.assign(classes[id],{activeCap:id==='bigCheese'?1:6,activeMode:'drone'});
for(const id of ['necromancer','maleficitor'])if(classes[id])Object.assign(classes[id],{activeCap:6,activeMode:'drone'});
for(const id of ['spawner','factory','autoSpawner'])if(classes[id])Object.assign(classes[id],{activeCap:id==='factory'?6:4,activeMode:'minion'});
classes.autoSmasher.centralTwin=false;
for(const [parent,children] of Object.entries(links))classes[parent].next=children;
classes.basic.specialNext={30:['smasher']};classes.twin.specialNext={45:['dual','bulwark','musket']};classes.sniper.specialNext={45:['bushwhacker']};classes.flank.specialNext={45:['tripleTwin','quadruplex']};classes.director.specialNext={45:['manager','bigCheese']};classes.pounder.specialNext={45:['shotgun','eagle']};classes.trapper.specialNext={45:['barricade','overtrapper']};
const reachableClasses=new Set(['basic']),visitClass=id=>{const c=classes[id];if(!c)return;for(const next of [...c.next,...Object.values(c.specialNext??{}).flat()])if(!reachableClasses.has(next)){reachableClasses.add(next);visitClass(next)}};visitClass('basic');for(const id of Object.keys(classes))if(!reachableClasses.has(id))delete classes[id];
const availableClassIds=(classId,level)=>{const current=classes[classId];if(!current)return [];const result=level>=(current.tier+1)*15?[...current.next]:[];for(const [gate,ids] of Object.entries(current.specialNext??{}))if(level>=Number(gate))result.push(...ids);return [...new Set(result)]};

export {MAX_LEVEL, MAX_STAT_LEVEL, SPAWN_SHIELD_SECONDS, MAP_WIDTH, MAP_HEIGHT, CENTER_ZONE_SIZE, MAX_SHAPES, DIFFICULTIES, PENTAGON_CENTER_CHANCE, SHAPE_STATS, SHAPE_IMPACT_DAMAGE, BULLET_RAW_STATS, BASIC_BARREL_STATS, RAW_BULLET_RANGE_UNITS_PER_SECOND, xpNeeded, skillPointsForLevel, skillPointsAtLevel, skillCurve, tankRadius, respawnLevel, scoreForLevel, levelProgressFromScore, tierFromRoll, shapeTypeFromRoll, shapeRadius, bulletHealth, bulletDamage, tankBulletDamage, tankStats, classes, availableClassIds, barrelWidth, barrelLength, bulletRadius};

export function randomSpawnPoint(random=Math.random,margin=180){
  return {x:margin+random()*(MAP_WIDTH-margin*2),y:margin+random()*(MAP_HEIGHT-margin*2)};
}

export function shapeSpawnPoint(type,random=Math.random,existingShapes=[]){
  if(existingShapes.length){
    const candidates=Array.from({length:24},()=>shapeSpawnPoint(type,random,[]));
    const density=point=>existingShapes.filter(shape=>Math.hypot(shape.x-point.x,shape.y-point.y)<270+shape.r*.25).length;
    const empty=candidates.filter(point=>density(point)===0),sparse=candidates.filter(point=>density(point)>0&&density(point)<=2);
    const roll=random();
    if(roll<.25&&empty.length)return empty[Math.floor(random()*empty.length)];
    if(roll<.35&&sparse.length)return sparse[Math.floor(random()*sparse.length)];
    return candidates[Math.floor(random()*candidates.length)];
  }
  const centerX=MAP_WIDTH/2,centerY=MAP_HEIGHT/2;
  const centerShape=type==='hexagon'||(type==='pentagon'&&random()<PENTAGON_CENTER_CHANCE);
  if(centerShape){
    const half=CENTER_ZONE_SIZE/2-90;
    return {x:centerX+(random()*2-1)*half,y:centerY+(random()*2-1)*half};
  }
  const margin=90,clear=CENTER_ZONE_SIZE/2+80;
  for(let i=0;i<40;i++){
    const x=margin+random()*(MAP_WIDTH-margin*2),y=margin+random()*(MAP_HEIGHT-margin*2);
    if(Math.abs(x-centerX)>=clear||Math.abs(y-centerY)>=clear)return {x,y};
  }
  return {x:margin,y:margin};
}

export function orbitShape(shape,dt){
  const previous=shape.rot,next=previous+shape.vr*dt;
  shape.x+=(Math.cos(next)-Math.cos(previous))*SHAPE_ORBIT_RADIUS;
  shape.y+=(Math.sin(next)-Math.sin(previous))*SHAPE_ORBIT_RADIUS;
  shape.rot=next;
}

export function separateBodies(a,b){
  let dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy),overlap=a.r+b.r-d;
  if(overlap<=0)return false;
  if(d<.001){dx=1;dy=0;d=1}
  const nx=dx/d,ny=dy/d,am=a.r*a.r,bm=b.r*b.r,total=am+bm,correction=Math.min(overlap,2.6,Math.max(overlap*.38,.08));
  a.x+=nx*correction*(bm/total);a.y+=ny*correction*(bm/total);
  b.x-=nx*correction*(am/total);b.y-=ny*correction*(am/total);
  const push=Math.min(60,overlap*7);
  a.vx=(a.vx??0)+nx*push*(bm/total);a.vy=(a.vy??0)+ny*push*(bm/total);
  b.vx=(b.vx??0)-nx*push*(am/total);b.vy=(b.vy??0)-ny*push*(am/total);
  return true;
}
