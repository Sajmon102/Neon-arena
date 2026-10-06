import {MAX_LEVEL, MAX_STAT_LEVEL, SPAWN_SHIELD_SECONDS, MAP_WIDTH, MAP_HEIGHT, CENTER_ZONE_SIZE, MAX_SHAPES, DIFFICULTIES, SHAPE_STATS, SHAPE_IMPACT_DAMAGE, BULLET_RAW_STATS, BASIC_BARREL_STATS, RAW_BULLET_RANGE_UNITS_PER_SECOND, xpNeeded, skillPointsForLevel, skillPointsAtLevel, tankRadius, scoreForLevel, levelProgressFromScore, tierFromRoll, shapeTypeFromRoll, shapeRadius, shapeSpawnPoint, randomSpawnPoint, tankStats, classes, availableClassIds, orbitShape, separateBodies, barrelWidth, barrelLength, bulletRadius} from './rules.js?v=94';
import {OnlineArena} from './online.js';
import {createBot,gainBot,steerBot} from './bots.js?v=95';
(() => {
  'use strict';
  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const $ = (s) => document.querySelector(s);
  const ui = { menu:$('#menu'), pause:$('#pauseMenu'), over:$('#gameOver'), score:$('#score'), level:$('#level'), levelBottom:$('#levelBottom'), tankNameBottom:$('#tankNameBottom'), scoreMeterValue:$('#scoreMeterValue'), killsValue:$('#killsValue'), scoreFill:$('#scoreFill'), killsFill:$('#killsFill'), xp:$('#xpFill'), xpText:$('#xpText'), board:$('#leaderboardList'), upgrades:$('#upgradePanel') };
  const keys = new Set();
  const mouse = {x:0,y:0,down:false};
  let W=0,H=0,dpr=1,viewScale=1,last=0,state='menu',shake=0,nextId=1;
  let player, bullets=[], shapes=[], enemies=[], particles=[], floaters=[], bulletFades=[], shapeFades=[];
  let mode='solo',network=null,onlineCount=0,firstSnapshot=true,lastSnapshot=0,classKey='',classPanelGate='',classDismissedFor='',networkState='connected';
  const world={w:MAP_WIDTH,h:MAP_HEIGHT}, camera={x:0,y:0};
  const REGEN_DELAY=5;
  const SHAPE_RESPAWN_DELAY=5;
  const CRASHER_SPEED=135;
  const CRASHER_VISION_RANGE=650;
  const BULLET_IMPACT_FADE=.18;
  const SHAPE_DEATH_FADE=.26;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const normalRandom=()=>{const a=Math.max(Number.EPSILON,Math.random()),b=Math.random();return Math.sqrt(-2*Math.log(a))*Math.cos(2*Math.PI*b)};
  function boundaryForce(value,max){const depth=value<0?-value:value>max?value-max:0;return (value<0?1:-1)*(depth*10+depth*depth*.16)}
  function applyBoundary(o,dt){o.vx+=boundaryForce(o.x,world.w)*dt;o.vy+=boundaryForce(o.y,world.h)*dt}

  const palettes={square:'#ffd84a',triangle:'#ff6174',pentagon:'#6f78ff',circle:'#ffffff',hexagon:'#75df9d'};
  const shapeColor=(shape)=>shape?.crasher?'#fa96da':palettes[shape?.type]??'#ff6174';
  let autoFire=false,autoSpin=false,pendingUpgrades=0;
  let elapsed=0,respawns=[],ranks={};
  let selectedDifficulty='easy';
  const classKeys=['Y','U','I','H','J','K','B','O','M'];
  const classColors=['#24282d','#7ab9c7','#9abf70','#d86d70'];
  function availableClasses(){return availableClassIds(player.tankClass,player.level)}
  function drawGunShape(c,g,start,length,width,lineWidth){
    c.fillStyle='#a8abb2';c.strokeStyle='#0a0c10';c.lineWidth=lineWidth;c.lineJoin='round';
    if(g.base){c.beginPath();c.moveTo(start,-width*.72);c.lineTo(start+length*.46,-width*.48);c.lineTo(start+length*.46,width*.48);c.lineTo(start,width*.72);c.closePath();c.fill();c.stroke()}
    if(g.shape==='trapezoid'||g.shape==='spawner'||g.shape==='deployer'||g.shape==='swarm'||g.shape==='minion'||g.shape==='block'||g.shape==='hive'){
      const front=g.shape==='spawner'?width*.42:g.shape==='swarm'?width*.28:g.shape==='minion'?width*.56:g.shape==='block'?width*1.18:g.shape==='hive'?width*.82:g.shape==='deployer'?width*.72:width*1.28;
      c.beginPath();c.moveTo(start,-width/2);c.lineTo(start+length,-front/2);c.lineTo(start+length,front/2);c.lineTo(start,width/2);c.closePath();c.fill();c.stroke();
    }else if(g.shape==='launcher'){
      c.beginPath();c.moveTo(start,-width*.28);c.lineTo(start+length*.42,-width*.28);c.lineTo(start+length*.72,-width*.50);c.lineTo(start+length,-width*.38);c.lineTo(start+length,width*.38);c.lineTo(start+length*.72,width*.50);c.lineTo(start+length*.42,width*.28);c.lineTo(start,width*.28);c.closePath();c.fill();c.stroke();
    }else if(g.shape==='engineer'){
      c.fillRect(start,-width/2,length*.72,width);c.strokeRect(start,-width/2,length*.72,width);c.fillRect(start+length*.72,-width/2,length*.28,width*.36);c.strokeRect(start+length*.72,-width/2,length*.28,width*.36);c.fillRect(start+length*.72,width*.14,length*.28,width*.36);c.strokeRect(start+length*.72,width*.14,length*.28,width*.36);
    }else if(g.shape==='boomer'){
      c.beginPath();c.moveTo(start,-width/2);c.lineTo(start+length*.76,-width*.38);c.lineTo(start+length,width*0);c.lineTo(start+length*.76,width*.38);c.lineTo(start,width/2);c.closePath();c.fill();c.stroke();
    }else if(g.shape==='assembler'){
      c.fillRect(start,-width/2,length,width);c.strokeRect(start,-width/2,length,width);c.fillStyle='#35393f';c.fillRect(start+length*.72,-width*.22,width*.44,width*.44);c.strokeRect(start+length*.72,-width*.22,width*.44,width*.44);
    }else{
      c.fillRect(start,-width/2,length,width);c.strokeRect(start,-width/2,length,width);
    }
    if(g.shape==='desmos'||g.shape==='marksman'){
      c.beginPath();c.moveTo(start+length*.42,-width/2);c.lineTo(start+length*.57,-width*.82);c.lineTo(start+length*.7,-width/2);c.moveTo(start+length*.42,width/2);c.lineTo(start+length*.57,width*.82);c.lineTo(start+length*.7,width/2);c.stroke();
    }
  }
  function drawTankBodyShape(c,def,cx,cy,r,angle,color,stroke){
    c.save();c.translate(cx,cy);if(def.bodyShape==='square')c.rotate(angle+Math.PI/4);c.beginPath();if(def.bodyShape==='square')c.rect(-r*.78,-r*.78,r*1.56,r*1.56);else c.arc(0,0,r,0,Math.PI*2);c.fillStyle=color;c.fill();c.lineWidth=Math.max(2.5,r*.13);c.strokeStyle=stroke;c.stroke();c.restore();
  }
  function drawTankDecoration(c,def,cx,cy,r,angle=0){
    if(def.shell){
      const kind=def.shellType??'hex',points=kind==='spike'?12:kind==='landmine'?16:6,scale=def.shellScale??1.22;c.save();c.translate(cx,cy);c.rotate(angle+elapsed*.9);c.beginPath();for(let i=0;i<points;i++){const a=i*Math.PI*2/points,star=kind==='spike'?(i%2?1:.76):kind==='landmine'?(i%2?1:.88):1,rr=r*scale*star;c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr)}c.closePath();c.fillStyle='#30353c';c.fill();c.lineWidth=Math.max(3,r*.13);c.strokeStyle='#1a1e24';c.stroke();c.restore();
    }
    if(def.turretCount){
      for(let i=0;i<def.turretCount;i++){const a=angle+i*Math.PI*2/def.turretCount;c.save();c.translate(cx+Math.cos(a)*r*.56,cy+Math.sin(a)*r*.56);c.rotate(a);c.fillStyle='#92979f';c.strokeStyle='#0a0c10';c.lineWidth=Math.max(2,r*.08);const tw=def.turretScale??1,barrels=def.turretTwin?[-r*.13,r*.13]:[0];for(const off of barrels){if(def.turretLauncher){c.beginPath();c.moveTo(0,off-r*.14*tw);c.lineTo(r*.66*tw,off-r*.22*tw);c.lineTo(r*.66*tw,off+r*.22*tw);c.lineTo(0,off+r*.14*tw);c.closePath();c.fill();c.stroke()}else{c.fillRect(0,off-r*.1*tw,r*.62*tw,r*.2*tw);c.strokeRect(0,off-r*.1*tw,r*.62*tw,r*.2*tw)}}c.beginPath();c.arc(0,0,r*.25*tw,0,Math.PI*2);c.fill();c.stroke();c.restore()}
    }else if(def.autoAim){c.save();c.translate(cx,cy);c.rotate(angle);c.fillStyle='#92979f';c.strokeStyle='#0a0c10';c.lineWidth=Math.max(2,r*.1);const barrels=def.centralTwin?[-r*.14,r*.14]:[0];for(const off of barrels){c.fillRect(0,off-r*.11,r*.72,r*.22);c.strokeRect(0,off-r*.11,r*.72,r*.22)}c.beginPath();c.arc(0,0,r*.34,0,Math.PI*2);c.fill();c.stroke();c.restore()}
  }
  function drawClassIcon(canvas,def){
    const c=canvas.getContext('2d'),cx=66,cy=64,r=28,angle=-Math.PI/4;c.clearRect(0,0,132,116);c.save();c.translate(cx,cy);c.rotate(angle);
    if(!def.hideBodyGuns)for(const g of def.guns){c.save();c.rotate(g.angle);c.translate(0,(g.offset??0)*.92);const width=Math.max(8,(g.width??17)*.9),length=Math.min(58,(g.length??43)*.9);drawGunShape(c,g,5,length,width,2.5);c.restore()}
    c.restore();drawTankDecoration(c,{...def,autoAim:false,turretCount:0},cx,cy,r,angle);drawTankBodyShape(c,def,cx,cy,r,angle,'#43b2d2','#456477');drawTankDecoration(c,{...def,shell:false},cx,cy,r,angle);
  }
  function updateClassPanel(){
    const c=classes[player.tankClass],options=availableClasses();
    $('#tankName').textContent=c.name;
    $('#classProgress').textContent=c.tier===3?'Klasa końcowa':options.length?'Wybierz nowy czołg':'Nowa klasa: poziom '+((c.tier+1)*15);
    $('#classChoiceHint').textContent='Poziom '+player.level+' · statystyki zostają';
    const gate=player.tankClass+':'+((c.tier+1)*15),available=options.length>0&&player.alive&&state==='playing';
    if(classPanelGate!==gate){classPanelGate=gate;classDismissedFor=''}
    $('#classPanel').hidden=!available||classDismissedFor===gate;
    $('#classToggle').hidden=!available||classDismissedFor!==gate;
    $('#classOptions').replaceChildren();
    for(const [index,id] of options.entries()){
      const def=classes[id],b=document.createElement('button'),icon=document.createElement('canvas'),name=document.createElement('strong'),key=document.createElement('small');
      b.type='button';b.title=def.desc;b.setAttribute('aria-label',def.name+'. '+def.desc);b.style.setProperty('--class-tint',classColors[def.tier]??classColors[3]);
      icon.width=132;icon.height=116;drawClassIcon(icon,def);name.textContent=def.name;key.textContent=classKeys[index]??String(index+1);
      b.append(icon,name,key);b.onclick=()=>chooseClass(id);$('#classOptions').appendChild(b);
    }
  }
  $('#classDismiss').onclick=()=>{classDismissedFor=player.tankClass+':'+((classes[player.tankClass].tier+1)*15);updateClassPanel()};
  $('#classToggle').onclick=()=>{$('#classPanel').hidden=false;$('#classToggle').hidden=true};
  function chooseClass(id){if(state!=='playing'||!player.alive||!availableClasses().includes(id))return false;if(mode==='online'){network.command('class',id);return true}player.tankClass=id;player.cool=Math.min(player.cool,player.reload*(classes[id].reload??1));updateClassPanel();return true}
  const upgrades=[
    ['regen','Health Regeneration','#ee93cd'],['health','Max Health','#87d981'],
    ['body','Body Damage','#ed9a70'],['bulletSpeed','Bullet Speed','#efdc76'],
    ['bulletHealth','Bullet Health','#97b1ef'],['bulletPenetration','Bullet Penetration','#a9a0f4'],['damage','Bullet Damage','#ee7b87'],
    ['reload','Reload','#78dcca'],['speed','Movement Speed','#bfa0f3']
  ];
  function refreshStats(){
    Object.assign(player,tankStats(ranks,player.level));
  }
  function updateVitals(){
    $('#upgradeCount').textContent='Punkty: '+pendingUpgrades;
    $('#mobileUpgradeCount').textContent=pendingUpgrades;
    for(const [kind] of upgrades){const b=$('[data-upgrade="'+kind+'"]');b.disabled=state!=='playing'||pendingUpgrades===0||ranks[kind]>=MAX_STAT_LEVEL;b.querySelector('small').textContent=ranks[kind]+'/'+MAX_STAT_LEVEL;b.style.setProperty('--fill',ranks[kind]/MAX_STAT_LEVEL*100+'%')}
  }
  function hitTarget(target,amount,credit=true){
    if(target!==player&&!target.type&&target.shieldUntil>elapsed)return;
    if(target.hp<=0)return;target.hp-=amount;target.hit=.1;target.lastDamage=elapsed;
    if(target.hp<=0){
      target.hp=0;
      if(target.type)addShapeFade(target);
      if(credit===true){if(!target.type){player.kills++;gain(Math.floor(target.score*.30),target.x,target.y)}else gain(target.reward,target.x,target.y)}
      else if(credit){if(!target.type){credit.kills=(credit.kills??0)+1;gainBot(credit,Math.floor(player.score*.30))}else gainBot(credit,target.reward)}
      burst(target.x,target.y,shapeColor(target),14)
    }
  }
  function collide(target,dt){
    if(target.hp<=0||!player.alive)return;
    let dx=player.x-target.x,dy=player.y-target.y,d=Math.hypot(dx,dy),overlap=player.r+target.r-d;
    if(overlap<=0)return;if(d<.001){dx=1;dy=0;d=1}
    const nx=dx/d,ny=dy/d,impulse=Math.min(110,overlap*14)*dt;
    player.vx+=nx*impulse*4.2;player.vy+=ny*impulse*4.2;target.vx-=nx*impulse*3.2;target.vy-=ny*impulse*3.2;
      if(elapsed>=(target.nextContact??0)){target.nextContact=elapsed+.35;const alive=player.alive;if(target.type||target.shieldUntil<=elapsed)damagePlayer(target.type?SHAPE_IMPACT_DAMAGE[target.type]:target.bodyDamage);if(alive&&!player.alive&&!target.type){target.kills=(target.kills??0)+1;gainBot(target,Math.floor(player.score*.30))}if(player.alive)hitTarget(target,player.bodyDamage*(classes[player.tankClass].bodyDamage??1))}
  }
  function drift(o,dt){const decay=Math.exp(-8*dt),step=(1-decay)/8;o.x+=o.vx*step;o.y+=o.vy*step;o.vx*=decay;o.vy*=decay;if(o!==player){o.x=Math.max(o.r,Math.min(world.w-o.r,o.x));o.y=Math.max(o.r,Math.min(world.h-o.r,o.y))}}
  const names=['Kobalt','Byte','Vektor','Pixel','Nova','Hex','Riko','Mika','Zed','Luna','Orion','Echo'];

  function resize(){
    dpr=Math.min(devicePixelRatio||1,2);
    canvas.style.width='100dvw';canvas.style.height='100dvh';
    const rect=canvas.getBoundingClientRect();
    viewScale=matchMedia('(pointer:coarse) and (orientation:landscape) and (max-height:800px)').matches ? .82 : 1;
    W=Math.max(1,Math.round(rect.width/viewScale));H=Math.max(1,Math.round(rect.height/viewScale));
    canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)
  }
  function rand(a,b){return a+Math.random()*(b-a)}
  function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
  function reset(savedLevel=1,keepWorld=false,savedScore=null,difficulty=selectedDifficulty){
    selectedDifficulty=difficulty;
    const progress=savedScore===null?{level:savedLevel,xp:0}:levelProgressFromScore(savedScore);
    savedLevel=progress.level;
    let spawn=randomSpawnPoint();
    if(keepWorld){
      let bestGap=-Infinity;
      for(let i=0;i<80;i++){
        const point=randomSpawnPoint();
        const gap=Math.min(10000,...shapes.map(s=>Math.hypot(s.x-point.x,s.y-point.y)-s.r-65),...enemies.map(e=>Math.hypot(e.x-point.x,e.y-point.y)-550),...bullets.map(b=>Math.hypot(b.x-point.x,b.y-point.y)-b.r-120));
        if(gap>bestGap){spawn=point;bestGap=gap}if(gap>=0)break;
      }
    }else{elapsed=0;respawns=[]}
    player={x:spawn.x,y:spawn.y,vx:0,vy:0,r:tankRadius(savedLevel),angle:0,hp:100,maxHp:100,speed:230,damage:18,reload:.55,cool:0,score:savedScore??scoreForLevel(savedLevel),kills:0,xp:progress.xp,level:savedLevel,name:($('#nickname').value.trim()||'Gracz').slice(0,16),alive:true,difficulty,shieldUntil:elapsed+SPAWN_SHIELD_SECONDS};
    autoFire=false;autoSpin=false;pendingUpgrades=skillPointsAtLevel(savedLevel);classPanelGate='';classDismissedFor='';keys.clear();mouse.down=false;ui.upgrades.classList.remove('visible');
    ranks=Object.fromEntries(upgrades.map(([kind])=>[kind,0]));player.lastDamage=elapsed-REGEN_DELAY;player.tankClass='basic';refreshStats();touchMove={x:0,y:0};touchFire=false;shake=0;updateClassPanel();
    camera.x=player.x-W/2;camera.y=player.y-H/2;
    if(!keepWorld){
      bullets=[];shapes=[];enemies=[];particles=[];floaters=[];bulletFades=[];shapeFades=[];
      for(let i=0;i<MAX_SHAPES;i++) spawnShape();
      for(let i=0;i<DIFFICULTIES[difficulty].botCount;i++) spawnEnemy(i,difficulty);
    }
    updateHud();
  }
  function spawnShape(){
    let type=shapeTypeFromRoll(Math.random());const tier=tierFromRoll(Math.random()),crasher=tier==='crasher';
    const stats=SHAPE_STATS[type];
    const health=stats[1]*(crasher?1:[0,1,2.5,6,12][tier]);
    const r=shapeRadius(type,tier);
    let x,y,tries=0;do{({x,y}=shapeSpawnPoint(type,Math.random,shapes));tries++}while(tries<80&&(Math.hypot(x-player.x,y-player.y)<140||shapes.some(s=>Math.hypot(x-s.x,y-s.y)<r+s.r+6)));
    shapes.push({id:nextId++,type,tier,crasher,x,y,r,hp:health,maxHp:health,reward:stats[2]*(crasher?1:[0,1,4,12,30][tier]),sides:stats[3],rot:rand(0,Math.PI),vr:rand(.40,.80)*(Math.random()<.5?-1:1),vx:0,vy:0,hit:0});
  }
  function spawnEnemy(i,difficulty=player?.difficulty??selectedDifficulty){
    let x,y;do{x=rand(180,world.w-180);y=rand(180,world.h-180)}while(Math.hypot(x-player.x,y-player.y)<550);
    enemies.push(createBot(nextId++,names[i%names.length],x,y,Math.random,difficulty,elapsed));
  }
  function start(savedLevel=1,keepWorld=false,savedScore=null,difficulty=selectedDifficulty){network?.leave();network=null;mode='solo';$('#onlineHud').hidden=true;$('#pauseNotice').hidden=true;reset(savedLevel,keepWorld,savedScore,difficulty);state='playing';ui.menu.classList.remove('visible');ui.over.classList.remove('visible');ui.pause.classList.remove('visible');ui.upgrades.classList.toggle('visible',pendingUpgrades>0);$('.mobile-controls').classList.add('active');updateClassPanel();updateVitals();last=performance.now()}
  function pause(toggle=true){if(mode==='online'&&!network?.running)return;if(state==='playing'&&toggle){state='paused';ui.pause.classList.add('visible')}else if(state==='paused'){state='playing';ui.pause.classList.remove('visible');last=performance.now()}}
  function toMenu(){network?.leave();network=null;mode='solo';$('#onlineHud').hidden=true;state='menu';ui.pause.classList.remove('visible');ui.over.classList.remove('visible');ui.menu.classList.add('visible');$('.mobile-controls').classList.remove('active');setUpgradeDrawer(false)}
  function onlineInput(){
    const active=state==='playing'&&player?.alive&&networkState==='connected';
    const aimDistance=Math.max(90,touchAimStrength*520),aimX=touchAimAngle===null?camera.x+mouse.x:player.x+Math.cos(touchAimAngle)*aimDistance,aimY=touchAimAngle===null?camera.y+mouse.y:player.y+Math.sin(touchAimAngle)*aimDistance;
    return {x:active?((keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+touchMove.x):0,
      y:active?((keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+touchMove.y):0,
      angle:player?.angle??0,aimX,aimY,fire:!!(active&&(mouse.down||keys.has(' ')||touchFire||autoFire))};
  }
  function onlineStatus(status,message){
    networkState=status;$('#onlineHud').dataset.state=status;
    $('#connectionStatus').textContent=status==='connected'?onlineCount+'/8 graczy · '+(network?.rtt??0)+' ms':message;
    if(status==='closed'){
      keys.clear();mouse.down=false;touchFire=false;touchMove={x:0,y:0};state='paused';ui.over.classList.remove('visible');ui.pause.classList.add('visible');
      $('#pauseNotice').textContent=message;$('#resumeBtn').disabled=true;
    }
  }
  function receiveOnline(packet,rtt){
    if(mode!=='online'||!packet.self)return;
    const previous=player,s=packet.self,wasAlive=previous?.alive,respawn=wasAlive===false&&s.alive;
    const oldScore=previous?.score??0,oldHp=previous?.hp??s.hp;
    const aim=previous?.angle??s.angle;
    const input=onlineInput(),len=Math.max(1,Math.hypot(input.x,input.y)),prediction=Math.min(.12,rtt/2000);
    const predictedX=s.x+(s.alive?input.x/len*s.speed*prediction:0),predictedY=s.y+(s.alive?input.y/len*s.speed*prediction:0);
    const snap=firstSnapshot||respawn||Math.hypot(previous.x-s.x,previous.y-s.y)>180;
    player={...s,angle:firstSnapshot?s.angle:aim,x:snap?s.x:previous.x*.25+predictedX*.75,y:snap?s.y:previous.y*.25+predictedY*.75};
    elapsed=packet.time;ranks={...s.ranks};pendingUpgrades=s.points;refreshStats();
    const oldEnemies=new Map(enemies.map(e=>[e.id,e]));
    const oldShapes=new Map(shapes.map(shape=>[shape.id,shape]));
    const oldBullets=new Map(bullets.map(bullet=>[bullet.id,bullet]));
    enemies=packet.players.filter(p=>p.id!==s.id&&p.alive).map(p=>{const old=oldEnemies.get(p.id);return {...p,x:old?.x??p.x,y:old?.y??p.y,tx:p.x,ty:p.y,ta:p.angle}});
    shapes=packet.shapes;bullets=packet.bullets.map(b=>({...b,x:b.x+b.vx*prediction,y:b.y+b.vy*prediction,enemy:b.owner!==s.id}));
    if(!firstSnapshot){
      const shapeIds=new Set(shapes.map(shape=>shape.id)),bulletIds=new Set(bullets.map(bullet=>bullet.id));
      for(const old of oldShapes.values())if(!shapeIds.has(old.id))addShapeFade(old);
      for(const old of oldBullets.values())if(!bulletIds.has(old.id)&&old.life>0)addBulletFade(old,old.x,old.y);
    }
    onlineCount=packet.players.length;lastSnapshot=performance.now();
    if(snap){camera.x=player.x-W/2;camera.y=player.y-H/2}
    if(!firstSnapshot&&s.score>oldScore)floaters.push({x:s.x,y:s.y,text:'+'+(s.score-oldScore),life:1});
    if(s.hp<oldHp){shake=4;burst(s.x,s.y,'#ff6174',4)}
    if(!s.alive&&wasAlive){state='over';ui.pause.classList.remove('visible');$('#finalScore').textContent=s.score;$('#finalLevel').textContent=s.level;ui.over.classList.add('visible');$('.mobile-controls').classList.remove('active');mouse.down=false;keys.clear()}
    if(respawn){state='playing';ui.over.classList.remove('visible');ui.pause.classList.remove('visible');$('.mobile-controls').classList.add('active');autoFire=false}
    const key=s.tankClass+':'+s.level+':'+s.alive;
    if(firstSnapshot||key!==classKey){classKey=key;updateClassPanel()}
    ui.upgrades.classList.toggle('visible',pendingUpgrades>0);firstSnapshot=false;updateHud();updateVitals();
  }
  async function startOnline(){
    const code=$('#roomCode').value.trim().toUpperCase();
    if(code&&!/^[A-Z0-9]{6}$/.test(code)){$('#joinStatus').textContent='Kod pokoju: dokładnie 6 liter lub cyfr.';return}
    $('#playBtn').disabled=true;$('#onlineBtn').disabled=true;$('#newRoomBtn').disabled=true;$('#joinStatus').textContent='Łączenie ze wspólną areną…';
    network?.leave();mode='online';firstSnapshot=true;classKey='';networkState='connected';reset();enemies=[];shapes=[];
    const client=new OnlineArena({input:onlineInput,onState:receiveOnline,onStatus:onlineStatus});network=client;
    try{
      const packet=await client.join(code,player.name);if(!packet)return;
      state='playing';ui.menu.classList.remove('visible');ui.over.classList.remove('visible');ui.pause.classList.remove('visible');$('.mobile-controls').classList.add('active');
      $('#onlineHud').hidden=false;$('#roomLabel').textContent='POKÓJ '+packet.code;
      $('#pauseNotice').hidden=false;$('#pauseNotice').textContent='Gra online trwa dalej. Twój czołg nadal może zostać trafiony.';$('#resumeBtn').disabled=false;
      $('#joinStatus').textContent='';last=performance.now();updateVitals();
    }catch(error){client.leave();network=null;mode='solo';state='menu';$('#joinStatus').textContent=error.name==='AbortError'?'Arena nie odpowiedziała. Spróbuj ponownie.':error.message}
    finally{$('#playBtn').disabled=false;$('#onlineBtn').disabled=false;$('#newRoomBtn').disabled=false}
  }
  function updateOnline(dt){
    if(!player||state==='menu')return;
    if(state==='playing'&&player.alive){
      const sx=player.x-camera.x,sy=player.y-camera.y;player.angle=autoSpin?(player.angle+1.7*dt)%(Math.PI*2):(touchAimAngle??Math.atan2(mouse.y-sy,mouse.x-sx));
      // Visual movement prediction only. Every snapshot reconciles to the server.
      if(networkState==='connected'&&performance.now()-lastSnapshot<600){const input=onlineInput(),len=Math.max(1,Math.hypot(input.x,input.y));player.x+=input.x/len*player.speed*dt;player.y+=input.y/len*player.speed*dt;applyBoundary(player,dt);drift(player,dt)}
    }
    for(const e of enemies){const mix=Math.min(1,dt*14);e.x+=(e.tx-e.x)*mix;e.y+=(e.ty-e.y)*mix;let delta=Math.atan2(Math.sin(e.ta-e.angle),Math.cos(e.ta-e.angle));e.angle+=delta*mix}
    if(performance.now()-lastSnapshot<250){for(const s of shapes)if(!s.crasher)orbitShape(s,dt);for(const b of bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt}bullets=bullets.filter(b=>b.life>0)}
    for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt}particles=particles.filter(p=>p.life>0);
    for(const f of floaters){f.y-=35*dt;f.life-=dt}floaters=floaters.filter(f=>f.life>0);
    updateImpactFades(dt);
    camera.x+=(player.x-W/2-camera.x)*Math.min(1,dt*7);camera.y+=(player.y-H/2-camera.y)*Math.min(1,dt*7);shake*=.86;
  }
  function shoot(owner,angle,enemy=false){
    const def=classes[owner.tankClass];
    const groups=def.fireGroups,indices=groups?groups[(owner.shotIndex??0)%groups.length]:def.guns.map((_,i)=>i);owner.shotIndex=(owner.shotIndex??0)+1;
    for(const index of indices){const gun=def.guns[index],barrelStats={...BASIC_BARREL_STATS,...gun};
      if(def.activeCap&&gun.mode===def.activeMode&&bullets.filter(b=>b.owner===(enemy?owner.id:'player')&&b.mode===def.activeMode&&b.life>0).length>=def.activeCap)continue;
      const candidates=def.autoTurrets?(enemy?[player,...shapes]:[...shapes,...enemies]).filter(t=>t?.hp>0&&(t!==player||player.alive)).sort((x,y)=>Math.hypot(x.x-owner.x,x.y-owner.y)-Math.hypot(y.x-owner.x,y.y-owner.y)):[];
      const target=candidates.length?candidates[index%candidates.length]:null,base=target?Math.atan2(target.y-owner.y,target.x-owner.x):angle+gun.angle;
      const shudder=barrelStats.shudder??0,spray=barrelStats.spray??0;
      const speedJitter=shudder?clamp(normalRandom()*Math.sqrt(shudder),-2*shudder,2*shudder):0;
      const sprayDegrees=spray?clamp(normalRandom()*spray*shudder,-spray/2,spray/2):0;
      const a=base+rand(-(def.spread??0),def.spread??0)+sprayDegrees*Math.PI/180;
      const scale=owner.r/25,muzzle=5*scale+barrelLength(gun,owner.r),offset=gun.offset*scale;
      const rawStats={health:BULLET_RAW_STATS.health*(owner.bulletHealth/5)*barrelStats.health,damage:BULLET_RAW_STATS.damage*(owner.damage/10)*barrelStats.damage,penetration:BULLET_RAW_STATS.penetration*(owner.bulletPenetration??1)*barrelStats.penetration,range:BULLET_RAW_STATS.range,pushability:BULLET_RAW_STATS.pushability,speed:BULLET_RAW_STATS.speed*(owner.bulletSpeed/320)*(barrelStats.speed/BASIC_BARREL_STATS.speed),acceleration:BULLET_RAW_STATS.acceleration,shield:BULLET_RAW_STATS.shield,regeneration:BULLET_RAW_STATS.regeneration,resist:barrelStats.resist};
      const hp=rawStats.health*(5/BULLET_RAW_STATS.health),damage=rawStats.damage*(10/BULLET_RAW_STATS.damage),tankDamage=rawStats.damage*(5/BULLET_RAW_STATS.damage);
      const mode=gun.mode??'bullet',life=mode==='drone'||mode==='minion'?60:mode==='sentry'||mode==='assembler'?20:mode==='boomer'?3.2:mode==='swarm'?2.1:mode==='hive'?1.65:gun.life??def.life??BULLET_RAW_STATS.range/RAW_BULLET_RANGE_UNITS_PER_SECOND;
      const speed=rawStats.speed*(320/BULLET_RAW_STATS.speed)*barrelStats.maxSpeed*(def.speed??1)*(1+speedJitter);
      bullets.push({id:'b'+nextId++,owner:enemy?owner.id:'player',x:owner.x+Math.cos(base)*muzzle-Math.sin(base)*offset,y:owner.y+Math.sin(base)*muzzle+Math.cos(base)*offset,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,baseSpeed:speed,r:bulletRadius(gun,owner.r)*barrelStats.size,life,damage:damage*(def.damage??1),tankDamage:tankDamage*(def.damage??1),penetration:rawStats.penetration,rawStats,density:barrelStats.density,pushability:rawStats.pushability*(barrelStats.density??1),resist:rawStats.resist,hp,maxHp:hp,enemy,mode,projectileShape:gun.projectile??gun.shape,wavePhase:gun.wavePhase??0,waveAmplitude:gun.waveAmplitude??13,waveFrequency:gun.waveFrequency??8,split:def.split??0,age:0,hits:new Set(),bulletHits:new Set()});
      const recoil=65*barrelStats.recoil*(def.recoil??1)/Math.sqrt(Math.max(1,indices.length));
      owner.vx-=Math.cos(a)*recoil;owner.vy-=Math.sin(a)*recoil;
    }
    const reloadGun=def.guns[indices[0]??0];
    owner.cool=owner.reload*((reloadGun?.reload??BASIC_BARREL_STATS.reload)/BASIC_BARREL_STATS.reload)*(def.reload??1)*(def.cycleInterval??1);
  }
  function burst(x,y,color,count=8){for(let i=0;i<count;i++){const a=rand(0,6.28),s=rand(40,180);particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:rand(.2,.55),max:.55,color,r:rand(2,5)})}}
  function addBulletFade(b,x=b.x,y=b.y){
    if(b.impactFadeAdded)return;b.impactFadeAdded=true;
    bulletFades.push({...b,x,y,vx:b.vx*.20,vy:b.vy*.20,fadeLife:BULLET_IMPACT_FADE,fadeMax:BULLET_IMPACT_FADE});
  }
  function addShapeFade(shape){
    if(shape.deathFadeAdded)return;shape.deathFadeAdded=true;
    shapeFades.push({...shape,hp:0,deadVisual:true,fadeLife:SHAPE_DEATH_FADE,fadeMax:SHAPE_DEATH_FADE});
  }
  function updateImpactFades(dt){
    for(const b of bulletFades){b.x+=b.vx*dt;b.y+=b.vy*dt;b.fadeLife-=dt}
    bulletFades=bulletFades.filter(b=>b.fadeLife>0);
    for(const shape of shapeFades){shape.rot+=(shape.vr??0)*dt*.35;shape.fadeLife-=dt}
    shapeFades=shapeFades.filter(shape=>shape.fadeLife>0);
  }
  function polygon(x,y,r,sides,rot,color,stroke='#0a0c10'){ctx.beginPath();for(let i=0;i<sides;i++){const a=rot+i*Math.PI*2/sides;ctx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r)}ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.lineWidth=5;ctx.strokeStyle=stroke;ctx.stroke()}
  function polygonOutline(x,y,r,sides,rot,width){ctx.beginPath();for(let i=0;i<sides;i++){const a=rot+i*Math.PI*2/sides;ctx.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r)}ctx.closePath();ctx.lineWidth=width;ctx.strokeStyle='#344957';ctx.stroke()}
  function gain(n,x,y){player.score+=n;if(player.level<MAX_LEVEL)player.xp+=n;floaters.push({x,y,text:'+'+n,life:1});while(player.level<MAX_LEVEL&&player.xp>=xpNeeded(player.level)){player.xp-=xpNeeded(player.level);player.level++;pendingUpgrades+=skillPointsForLevel(player.level)}player.r=tankRadius(player.level);if(player.level===MAX_LEVEL)player.xp=0;ui.upgrades.classList.toggle('visible',pendingUpgrades>0);updateClassPanel();updateHud()}
  function grantMaxLevel(){if(mode!=='solo'||state!=='playing'||!player?.alive)return;const previousLevel=player.level;if(previousLevel>=MAX_LEVEL)return;player.level=MAX_LEVEL;player.xp=0;player.score=Math.max(player.score,scoreForLevel(MAX_LEVEL));player.r=tankRadius(MAX_LEVEL);pendingUpgrades+=skillPointsAtLevel(MAX_LEVEL)-skillPointsAtLevel(previousLevel);refreshStats();ui.upgrades.classList.toggle('visible',pendingUpgrades>0);updateClassPanel();updateHud();updateVitals()}
  function upgrade(kind){if(state!=='playing'||pendingUpgrades<1||!(kind in ranks)||ranks[kind]>=MAX_STAT_LEVEL)return;if(mode==='online'){network.command('upgrade',kind);return}const oldMax=player.maxHp;ranks[kind]++;pendingUpgrades--;refreshStats();if(kind==='health')player.hp+=player.maxHp-oldMax;updateVitals()}
  function damagePlayer(n){if(!player.alive||player.shieldUntil>elapsed)return;player.hp=Math.max(0,player.hp-n);player.lastDamage=elapsed;shake=5;burst(player.x,player.y,'#ff6174',5);if(player.hp<=0){player.alive=false;state='over';$('#finalScore').textContent=player.score;$('#finalLevel').textContent=player.level;ui.over.classList.add('visible');$('.mobile-controls').classList.remove('active')}}
  function updateCloak(o,moving,dt){
    const def=classes[o.tankClass??'basic'];
    if(!def.cloak){o.cloakIdle=0;o.cloakAlpha=1;return}
    if(moving||elapsed-(o.lastDamage??-99)<.45)o.cloakIdle=0;else o.cloakIdle=(o.cloakIdle??0)+dt;
    o.cloakAlpha=1-.88*Math.max(0,Math.min(1,((o.cloakIdle??0)-(def.cloakDelay??2))/1.15));
  }
  function update(dt){
    if(mode==='online'){updateOnline(dt);return}
    if(state!=='playing')return;
    elapsed+=dt;
    if(elapsed-player.lastDamage>=REGEN_DELAY)player.hp=Math.min(player.maxHp,player.hp+player.regen*dt);
    const due=respawns.filter(r=>r.at<=elapsed);respawns=respawns.filter(r=>r.at>elapsed);
    for(const r of due){if(r.kind==='shape'){if(shapes.length<MAX_SHAPES)spawnShape()}else spawnEnemy(r.index)}
    const previousPlayerX=player.x,previousPlayerY=player.y;
    let dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+touchMove.x;
    let dy=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+touchMove.y;
    const dl=Math.max(1,Math.hypot(dx,dy));player.x+=dx/dl*player.speed*dt;player.y+=dy/dl*player.speed*dt;
    applyBoundary(player,dt);
    drift(player,dt);
    player.aiVx=(player.x-previousPlayerX)/Math.max(dt,.001);player.aiVy=(player.y-previousPlayerY)/Math.max(dt,.001);
    updateCloak(player,Math.hypot(dx,dy)>.05,dt);
    const sx=player.x-camera.x,sy=player.y-camera.y,playerClass=classes[player.tankClass];player.angle=autoSpin?player.angle+1.7*dt:(touchAimAngle??Math.atan2(mouse.y-sy,mouse.x-sx));
    if(playerClass.autoAim&&!playerClass.autoTurrets){const target=[...enemies,...shapes].filter(t=>t.hp>0).sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y))[0];if(target)player.angle=Math.atan2(target.y-player.y,target.x-player.x)}
    player.cool-=dt;
    if((playerClass.autoAim||playerClass.autoTurrets||mouse.down||keys.has(' ')||touchFire||autoFire)&&player.cool<=0)shoot(player,player.angle);
    const spawnedBullets=[];
    for(const b of bullets){
      b.prevX=b.x;b.prevY=b.y;b.age=(b.age??0)+dt;
      if((b.mode==='trap'||b.mode==='sentry')&&b.age>.18){const drag=Math.exp(-24*dt);b.vx*=drag;b.vy*=drag}
      if(b.mode==='assembler'&&b.age>.18){const drag=Math.exp(-8*dt);b.vx*=drag;b.vy*=drag;const mates=bullets.filter(other=>other!==b&&other.mode==='assembler'&&other.owner===b.owner&&other.life>0).sort((x,y)=>Math.hypot(x.x-b.x,x.y-b.y)-Math.hypot(y.x-b.x,y.y-b.y));const mate=mates[0];if(mate){const dx=mate.x-b.x,dy=mate.y-b.y,d=Math.max(1,Math.hypot(dx,dy)),gap=d-(b.r+mate.r)*1.05;if(gap>0){b.vx+=dx/d*Math.min(150,gap*2.2)*dt;b.vy+=dy/d*Math.min(150,gap*2.2)*dt}}}
      if(b.mode==='boomer'&&b.age>.46){const owner=b.owner==='player'?player:enemies.find(e=>e.id===b.owner);if(owner){const dx=owner.x-b.x,dy=owner.y-b.y,d=Math.max(1,Math.hypot(dx,dy)),speed=Math.max(300,(b.baseSpeed??320)*.82);b.vx=dx/d*speed;b.vy=dy/d*speed;if(d<owner.r+b.r+5)b.life=0}}
      if(b.mode==='drone'||b.mode==='swarm'||b.mode==='minion'){
        const targets=b.enemy?[player,...enemies.filter(e=>e.id!==b.owner)]:[...shapes,...enemies];let target=null,best=Infinity;
        for(const t of targets){if(t===player&&!player.alive||t.hp<=0)continue;const d=Math.hypot(t.x-b.x,t.y-b.y);if(d<best){best=d;target=t}}
        const owner=b.owner==='player'?player:enemies.find(e=>e.id===b.owner),controlled=b.mode==='drone'&&!b.enemy&&owner&&(mouse.down||keys.has(' ')||touchFire||autoFire);
        const aimDistance=Math.max(90,touchAimStrength*520),controlX=touchAimAngle===null?camera.x+mouse.x:player.x+Math.cos(touchAimAngle)*aimDistance,controlY=touchAimAngle===null?camera.y+mouse.y:player.y+Math.sin(touchAimAngle)*aimDistance;
        const controlDistance=controlled?Math.hypot(controlX-b.x,controlY-b.y):Infinity;
        const desired=controlled?Math.atan2(controlY-b.y,controlX-b.x):(target?Math.atan2(target.y-b.y,target.x-b.x):owner?Math.atan2(owner.y-b.y,owner.x-b.x):Math.atan2(b.vy,b.vx));
        const current=Math.atan2(b.vy,b.vx),turn=Math.atan2(Math.sin(desired-current),Math.cos(desired-current)),turnRate=controlled?5.5:b.mode==='swarm'?4.4:2.8,angle=current+Math.max(-turnRate*dt,Math.min(turnRate*dt,turn)),maxSpeed=Math.max(b.mode==='minion'?220:320,Math.hypot(b.vx,b.vy)),arrival=Math.max(10,b.r*.65),speed=controlled?Math.min(maxSpeed,Math.max(0,(controlDistance-arrival)*5)):maxSpeed;b.vx=Math.cos(angle)*speed;b.vy=Math.sin(angle)*speed;
        if(b.mode==='minion'&&target&&best<620&&(b.turretCool=(b.turretCool??rand(0,.3))-dt)<=0){b.turretCool=.55;const a=Math.atan2(target.y-b.y,target.x-b.x),s=460;spawnedBullets.push({id:'b'+nextId++,owner:b.owner,x:b.x+Math.cos(a)*b.r,y:b.y+Math.sin(a)*b.r,vx:Math.cos(a)*s,vy:Math.sin(a)*s,baseSpeed:s,r:Math.max(3,b.r*.28),life:1.15,damage:b.damage*.42,tankDamage:b.tankDamage*.42,hp:b.maxHp*.35,maxHp:b.maxHp*.35,enemy:b.enemy,mode:'bullet',split:0,age:0,hits:new Set(),bulletHits:new Set()})}
      }else if(b.mode==='missile'||b.mode==='hive'){
        const current=Math.hypot(b.vx,b.vy),next=Math.min((b.baseSpeed??320)*1.65,current*Math.exp(1.2*dt));if(current>0){b.vx*=next/current;b.vy*=next/current}
        if(b.mode==='hive'&&b.age>.12&&(b.hiveCool=(b.hiveCool??0)-dt)<=0){b.hiveCool=.22;const heading=Math.atan2(b.vy,b.vx),speed=Math.max(280,current*.72);for(const turn of [-.48,.48])spawnedBullets.push({id:'b'+nextId++,owner:b.owner,x:b.x,y:b.y,vx:Math.cos(heading+turn)*speed,vy:Math.sin(heading+turn)*speed,baseSpeed:speed,r:Math.max(3,b.r*.38),life:1.05,damage:b.damage*.3,tankDamage:b.tankDamage*.3,hp:b.maxHp*.25,maxHp:b.maxHp*.25,enemy:b.enemy,mode:'swarm',split:0,age:0,hits:new Set(),bulletHits:new Set()})}
      }
      if(b.mode==='sentry'){
        const targets=b.enemy?[player,...enemies.filter(e=>e.id!==b.owner)]:[...shapes,...enemies];let target=null,best=Infinity;for(const t of targets){if(t===player&&!player.alive||t.hp<=0)continue;const d=Math.hypot(t.x-b.x,t.y-b.y);if(d<best){best=d;target=t}}
        if(target&&best<560&&(b.turretCool=(b.turretCool??rand(0,.35))-dt)<=0){b.turretCool=.72;const a=Math.atan2(target.y-b.y,target.x-b.x),s=500;b.turretAngle=a;spawnedBullets.push({id:'b'+nextId++,owner:b.owner,x:b.x+Math.cos(a)*b.r,y:b.y+Math.sin(a)*b.r,vx:Math.cos(a)*s,vy:Math.sin(a)*s,baseSpeed:s,r:Math.max(3,b.r*.24),life:1.1,damage:b.damage*.38,tankDamage:b.tankDamage*.38,hp:b.maxHp*.3,maxHp:b.maxHp*.3,enemy:b.enemy,mode:'bullet',split:0,age:0,hits:new Set(),bulletHits:new Set()})}
      }
      if(b.mode==='wave'){const speed=Math.max(1,Math.hypot(b.vx,b.vy)),offset=Math.sin(b.age*(b.waveFrequency??8)+(b.wavePhase??0))*(b.waveAmplitude??13),delta=offset-(b.waveOffset??0);b.x+=-b.vy/speed*delta;b.y+=b.vx/speed*delta;b.waveOffset=offset}
      b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
    }
    bullets.push(...spawnedBullets);
    for(const s of shapes){
      if(s.crasher&&player.alive){const dx=player.x-s.x,dy=player.y-s.y,d=Math.max(1,Math.hypot(dx,dy));if(d<=CRASHER_VISION_RANGE){s.x+=dx/d*CRASHER_SPEED*dt;s.y+=dy/d*CRASHER_SPEED*dt;s.rot=Math.atan2(dy,dx)+Math.PI/2}else orbitShape(s,dt)}
      else orbitShape(s,dt);
      drift(s,dt);s.x=Math.max(s.r,Math.min(world.w-s.r,s.x));s.y=Math.max(s.r,Math.min(world.h-s.r,s.y));s.hit=Math.max(0,s.hit-dt)
    }
    for(let i=0;i<shapes.length;i++)for(let j=i+1;j<shapes.length;j++)separateBodies(shapes[i],shapes[j]);
    for(const e of enemies){
      if(e.hp<=0)continue;
      const def=classes[e.tankClass],wantsShot=steerBot(e,player,enemies,shapes,dt,elapsed,world,Math.random,bullets);if((wantsShot||def.autoTurrets)&&e.cool<=0){shoot(e,e.angle,true);e.cool+=rand(.01,.05)}
      for(const s of shapes)if(s.hp>0&&separateBodies(e,s)&&elapsed>=(e.contacts[s.id]??0)){
        e.contacts[s.id]=elapsed+.35;hitTarget(e,SHAPE_IMPACT_DAMAGE[s.type],false);if(e.hp>0)hitTarget(s,e.bodyDamage*(classes[e.tankClass].bodyDamage??1),e);
      }
      for(const other of enemies)if(other.id>e.id&&other.hp>0&&separateBodies(e,other)&&elapsed>=(e.contacts[other.id]??0)){
        e.contacts[other.id]=elapsed+.35;hitTarget(e,other.bodyDamage*(classes[other.tankClass].bodyDamage??1),other);if(e.hp>0)hitTarget(other,e.bodyDamage*(classes[e.tankClass].bodyDamage??1),e);
      }
      drift(e,dt);
      updateCloak(e,Math.hypot(e.vx??0,e.vy??0)>8,dt);
      e.x=Math.max(e.r,Math.min(world.w-e.r,e.x));e.y=Math.max(e.r,Math.min(world.h-e.r,e.y));
    }
    for(const target of [...shapes,...enemies])collide(target,dt);
    for(let i=0;i<bullets.length;i++){
      const first=bullets[i];if(first.life<=0)continue;
      for(let j=i+1;j<bullets.length;j++){
        const second=bullets[j];
        const collisionTime=bulletImpactTime(first,second);
        if(second.life<=0||first.owner===second.owner||first.bulletHits.has(second.id)||collisionTime===null)continue;
        first.bulletHits.add(second.id);second.bulletHits.add(first.id);
        applyBulletKnockback(first,second,collisionTime);
        const firstDamage=first.damage,secondDamage=second.damage;
        updateBulletDamageAfterCollision(first);updateBulletDamageAfterCollision(second);
        first.hp-=secondDamage/(Math.max(1,first.penetration??1)*Math.max(.01,first.resist??1));second.hp-=firstDamage/(Math.max(1,second.penetration??1)*Math.max(.01,second.resist??1));
        updateBulletDamageAfterCollision(first);updateBulletDamageAfterCollision(second);
        const firstX=(first.prevX??first.x)+(first.x-(first.prevX??first.x))*collisionTime,firstY=(first.prevY??first.y)+(first.y-(first.prevY??first.y))*collisionTime;
        const secondX=(second.prevX??second.x)+(second.x-(second.prevX??second.x))*collisionTime,secondY=(second.prevY??second.y)+(second.y-(second.prevY??second.y))*collisionTime;
        if(first.hp<=0){addBulletFade(first,firstX,firstY);first.life=0}if(second.hp<=0){addBulletFade(second,secondX,secondY);second.life=0}
        if(first.life<=0)break;
      }
    }
    for(const b of bullets){
      if(b.life<=0)continue;
      const shooter=b.enemy?enemies.find(e=>e.id===b.owner):null;
      const targets=b.enemy?[...shapes,player,...enemies.filter(e=>e.id!==b.owner)]:[...shapes,...enemies];
      const impacts=targets.filter(t=>t.hp>0&&(t===player?player.alive:!b.hits.has(t.id))&&(t.type||t===player||t.shieldUntil<=elapsed)).map(target=>({target,t:impactTime(b,target)})).filter(i=>i.t!==null).sort((a,b)=>a.t-b.t);
      for(const {target,t} of impacts){
        const targetHp=target.hp;
        const ix=b.prevX+(b.x-b.prevX)*t,iy=b.prevY+(b.y-b.prevY)*t;
        const push=(b.pushability??BULLET_RAW_STATS.pushability)/(BULLET_RAW_STATS.pushability||1);
        if(target===player){const alive=player.alive;damagePlayer(b.tankDamage);if(alive&&!player.alive){shooter.kills=(shooter.kills??0)+1;gainBot(shooter,Math.floor(player.score*.30))}player.vx+=b.vx*.12*push;player.vy+=b.vy*.12*push}
        else{b.hits.add(target.id);hitTarget(target,target.type?b.damage:b.tankDamage,b.enemy?(shooter??false):true);target.vx+=b.vx*.06*push;target.vy+=b.vy*.06*push}
        burst(ix,iy,target===player?'#ff6174':shapeColor(target),3);
        updateBulletDamageAfterCollision(b);
        b.hp-=targetHp/Math.max(1,b.penetration??1);
        updateBulletDamageAfterCollision(b);
        const destroyed=target===player?!player.alive:target.hp<=0;
        if(b.hp<=0||!destroyed){addBulletFade(b,ix,iy);b.life=0;break}
      }
    }
    const splitChildren=[];
    for(const b of bullets)if(b.life<=0&&b.split===3&&!b.splitDone&&(b.age??0)>.06){b.splitDone=true;const heading=Math.atan2(b.vy,b.vx),speed=Math.max(260,Math.hypot(b.vx,b.vy)*.82);for(const turn of [-.42,0,.42])splitChildren.push({id:'b'+nextId++,owner:b.owner,x:b.x,y:b.y,vx:Math.cos(heading+turn)*speed,vy:Math.sin(heading+turn)*speed,baseSpeed:speed,r:Math.max(3,b.r*.58),life:.65,damage:b.damage*.45,tankDamage:b.tankDamage*.45,penetration:b.penetration??1,hp:b.maxHp*.45,maxHp:b.maxHp*.45,enemy:b.enemy,mode:'bullet',split:0,age:0,hits:new Set(),bulletHits:new Set()})}
    bullets=bullets.filter(b=>b.life>0);bullets.push(...splitChildren);
    const deadShapes=shapes.filter(s=>s.hp<=0).length,deadEnemies=enemies.filter(e=>e.hp<=0).length;
    shapes=shapes.filter(s=>s.hp>0);enemies=enemies.filter(e=>e.hp>0);
    for(let i=0;i<deadShapes;i++)respawns.push({kind:'shape',at:elapsed+SHAPE_RESPAWN_DELAY});
    for(let i=0;i<deadEnemies;i++)respawns.push({kind:'enemy',at:elapsed+5,index:(Math.random()*names.length)|0});
    updateVitals();
    for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.94;p.vy*=.94;p.life-=dt}particles=particles.filter(p=>p.life>0);for(const f of floaters){f.y-=35*dt;f.life-=dt}floaters=floaters.filter(f=>f.life>0);
    updateImpactFades(dt);
    camera.x+=(player.x-W/2-camera.x)*Math.min(1,dt*7);camera.y+=(player.y-H/2-camera.y)*Math.min(1,dt*7);shake*=.86;updateHud();
  }
  // Swept collisions preserve the order of impacts even for fast sniper bullets.
  function impactTime(b,target){
    const x=b.prevX??b.x,y=b.prevY??b.y,dx=b.x-x,dy=b.y-y,ox=x-target.x,oy=y-target.y,r=b.r+target.r;
    const c=ox*ox+oy*oy-r*r;if(c<=0)return 0;
    const a=dx*dx+dy*dy;if(a<1e-12)return null;
    const dot=ox*dx+oy*dy,disc=dot*dot-a*c;if(disc<0)return null;
    const t=(-dot-Math.sqrt(disc))/a;return t>=0&&t<=1?t:null;
  }
  function bulletImpactTime(first,second){
    const ax=first.prevX??first.x,ay=first.prevY??first.y,bx=second.prevX??second.x,by=second.prevY??second.y;
    const ox=ax-bx,oy=ay-by,dx=(first.x-ax)-(second.x-bx),dy=(first.y-ay)-(second.y-by),r=first.r+second.r,c=ox*ox+oy*oy-r*r;
    if(c<=0)return 0;const speed=dx*dx+dy*dy;if(speed<1e-12)return null;
    const dot=ox*dx+oy*dy,disc=dot*dot-speed*c;if(disc<0)return null;
    const t=(-dot-Math.sqrt(disc))/speed;return t>=0&&t<=1?t:null;
  }
  function applyBulletKnockback(first,second,time){
    const ax=(first.prevX??first.x)+(first.x-(first.prevX??first.x))*time,ay=(first.prevY??first.y)+(first.y-(first.prevY??first.y))*time;
    const bx=(second.prevX??second.x)+(second.x-(second.prevX??second.x))*time,by=(second.prevY??second.y)+(second.y-(second.prevY??second.y))*time;
    let dx=bx-ax,dy=by-ay,d=Math.hypot(dx,dy);if(d<1e-6){dx=first.vx-second.vx;dy=first.vy-second.vy;d=Math.hypot(dx,dy)}if(d<1e-6)return;
    const nx=dx/d,ny=dy/d,closing=(first.vx-second.vx)*nx+(first.vy-second.vy)*ny;if(closing<=0)return;
    const mass1=Math.max(.1,first.density??1)*Math.max(4,first.r*first.r)*Math.max(1,first.penetration??1);
    const mass2=Math.max(.1,second.density??1)*Math.max(4,second.r*second.r)*Math.max(1,second.penetration??1);
    const inv1=1/mass1,inv2=1/mass2,impulse=Math.min(32/Math.max(inv1,inv2),.3*closing/(inv1+inv2));
    first.vx-=impulse*inv1*nx;first.vy-=impulse*inv1*ny;second.vx+=impulse*inv2*nx;second.vy+=impulse*inv2*ny;
  }
  function updateBulletDamageAfterCollision(b){
    b.baseDamage??=b.damage;b.baseTankDamage??=b.tankDamage;
    const healthRatio=clamp(b.hp/Math.max(1,b.maxHp??b.hp),0,1);
    b.damage=b.baseDamage*healthRatio;b.tankDamage=b.baseTankDamage*healthRatio;
  }
  function drawShape(s){
    const x=s.x-camera.x,y=s.y-camera.y;if(x<-s.r||y<-s.r||x>W+s.r||y>H+s.r)return;
    const fade=s.fadeLife===undefined?1:Math.max(0,s.fadeLife/s.fadeMax),baseRadius=s.r;
    if(s.deadVisual)s.r=baseRadius*(.72+.28*fade);
    ctx.save();ctx.globalAlpha*=fade;
    const tier=s.tier??1,color=s.hit>0?'#fff':shapeColor(s),line=Math.max(2.2,s.r*.07);
    if(s.type==='circle'){
      ctx.beginPath();ctx.arc(x,y,s.r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle='#7f929f';ctx.stroke();
      const rings=tier===2?[.56]:tier===3?[.64,.32]:tier===4?[.72,.48,.24]:[];
      for(const scale of rings){ctx.beginPath();ctx.arc(x,y,s.r*scale,0,Math.PI*2);ctx.lineWidth=line;ctx.strokeStyle='#596b77';ctx.stroke()}
    }else{
      // Enclose the full strokes, not just the inner polygon's vertices.
      // Build outward: Beta = 2, Alpha = 3, Omega = 4 polygons.
      const inset=Math.cos(Math.PI/s.sides);
      const innerGap=line+.25,outerGap=line/2+2.75;
      const middle=tier>=3?s.r*inset+innerGap/inset:s.r*inset;
      const outer=tier>1?(middle+outerGap)/inset:s.r;
      const layers=tier===2?[middle]:tier===3?[middle,s.r*inset*inset]:tier===4?[middle,s.r*inset*inset,s.r*inset*inset*inset]:[];
      ctx.save();ctx.lineJoin='round';
      polygon(x,y,outer,s.sides,s.rot,color,'#17222c');
      layers.forEach((radius,i)=>polygonOutline(x,y,radius,s.sides,s.rot+(i%2===0?Math.PI/s.sides:0),line));
      ctx.restore();
    }
    if(!s.deadVisual)hpBar(s,s.r+10);
    ctx.restore();s.r=baseRadius;
  }
  function drawBullet(b){
    const x=b.x-camera.x,y=b.y-camera.y;if(x<-30||y<-30||x>W+30||y>H+30)return;
    const color=b.enemy?'#ff7684':'#63d9fc';
    ctx.save();
    if(b.fadeLife!==undefined)ctx.globalAlpha*=Math.max(0,b.fadeLife/b.fadeMax);
    ctx.fillStyle=color;ctx.strokeStyle=b.enemy?'#963d51':'#246d88';ctx.lineWidth=Math.max(2,b.r*.25);
    if(b.mode==='sentry'||b.mode==='boomer'||b.mode==='assembler'||b.projectileShape==='block'||b.projectileShape==='engineer'){
      ctx.fillRect(x-b.r,y-b.r,b.r*2,b.r*2);ctx.strokeRect(x-b.r,y-b.r,b.r*2,b.r*2);
      if(b.mode==='sentry'){const a=b.turretAngle??Math.atan2(b.vy,b.vx);ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.fillStyle='#a8abb2';ctx.fillRect(0,-b.r*.18,b.r*1.15,b.r*.36);ctx.strokeRect(0,-b.r*.18,b.r*1.15,b.r*.36);ctx.restore();ctx.beginPath();ctx.arc(x,y,b.r*.38,0,Math.PI*2);ctx.fill();ctx.stroke()}
      if(b.mode==='assembler'){ctx.fillStyle='#294e63';ctx.fillRect(x-b.r*.28,y-b.r*.28,b.r*.56,b.r*.56);ctx.strokeRect(x-b.r*.28,y-b.r*.28,b.r*.56,b.r*.56)}
    }
    else if(b.mode==='trap'){ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(b.vy,b.vx)+Math.PI/2);ctx.beginPath();ctx.moveTo(0,-b.r*1.2);ctx.lineTo(b.r,b.r*.8);ctx.lineTo(-b.r,b.r*.8);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore()}
    else if(b.mode==='hive'){ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(b.vy,b.vx));ctx.beginPath();for(let i=0;i<16;i++){const a=i*Math.PI/8,rr=i%2?b.r*.72:b.r*1.15;ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr)}ctx.closePath();ctx.fill();ctx.stroke();ctx.restore()}
    else if(b.mode==='missile'){ctx.translate(x,y);ctx.rotate(Math.atan2(b.vy,b.vx));ctx.beginPath();ctx.moveTo(b.r*1.5,0);ctx.lineTo(-b.r,-b.r);ctx.lineTo(-b.r,b.r);ctx.closePath();ctx.fill();ctx.stroke()}
    else if(b.mode==='drone'&&b.projectileShape==='square'){ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(b.vy,b.vx)+Math.PI/4);ctx.fillRect(-b.r,-b.r,b.r*2,b.r*2);ctx.strokeRect(-b.r,-b.r,b.r*2,b.r*2);ctx.restore()}
    else if(b.mode==='drone'||b.mode==='swarm'){ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(b.vy,b.vx)+Math.PI/2);ctx.beginPath();ctx.moveTo(0,-b.r*1.25);ctx.lineTo(b.r,b.r*.82);ctx.lineTo(-b.r,b.r*.82);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore()}
    else if(b.mode==='minion'){ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(b.vy,b.vx));ctx.fillStyle='#a8abb2';ctx.fillRect(0,-b.r*.22,b.r*1.15,b.r*.44);ctx.strokeRect(0,-b.r*.22,b.r*1.15,b.r*.44);ctx.beginPath();ctx.arc(0,0,b.r*.72,0,Math.PI*2);ctx.fillStyle=b.enemy?'#ff6174':'#45d5ff';ctx.fill();ctx.stroke();ctx.restore()}
    else{ctx.beginPath();ctx.arc(x,y,b.r,0,Math.PI*2);ctx.fill();ctx.stroke()}
    ctx.restore();
  }
  function drawGrid(){
    ctx.fillStyle='#363b43';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#171d26';ctx.fillRect(-camera.x,-camera.y,world.w,world.h);
    const zoneX=world.w/2-CENTER_ZONE_SIZE/2-camera.x,zoneY=world.h/2-CENTER_ZONE_SIZE/2-camera.y;
    ctx.fillStyle='#202b39';ctx.fillRect(zoneX,zoneY,CENTER_ZONE_SIZE,CENTER_ZONE_SIZE);
    const size=40,ox=(((-camera.x)%size)+size)%size,oy=(((-camera.y)%size)+size)%size;
    ctx.lineWidth=1;ctx.strokeStyle='#a4b1c412';ctx.beginPath();
    for(let x=ox;x<W;x+=size){ctx.moveTo(x,0);ctx.lineTo(x,H)}
    for(let y=oy;y<H;y+=size){ctx.moveTo(0,y);ctx.lineTo(W,y)}ctx.stroke();
    ctx.strokeStyle='#b1bfce55';ctx.lineWidth=2;ctx.strokeRect(-camera.x,-camera.y,world.w,world.h);
  }
  function hpBar(o,yoff){if(o.hp>=o.maxHp)return;const w=o.r*2;ctx.fillStyle='#0a0d12';ctx.fillRect(o.x-camera.x-w/2,o.y-camera.y+yoff,w,5);ctx.fillStyle='#66e18b';ctx.fillRect(o.x-camera.x-w/2,o.y-camera.y+yoff,w*(o.hp/o.maxHp),5)}
  function tankBarrels(o){
    const x=o.x-camera.x,y=o.y-camera.y;
    ctx.save();ctx.globalAlpha=o.cloakAlpha??1;ctx.translate(x,y);ctx.rotate(o.angle);
    const def=classes[o.tankClass??'basic'];if(!def.hideBodyGuns)for(const g of def.guns){
      const scale=o.r/25,width=barrelWidth(g,o.r),length=barrelLength(g,o.r);
      ctx.save();ctx.rotate(g.angle);ctx.translate(0,g.offset*scale);drawGunShape(ctx,g,5*scale,length,width,Math.max(2,4*scale));ctx.restore();
    }
    ctx.restore();
  }
  function tankBody(o,color,enemy=false){
    const x=o.x-camera.x,y=o.y-camera.y,def=classes[o.tankClass??'basic'];
    ctx.save();ctx.globalAlpha=o.cloakAlpha??1;
    drawTankDecoration(ctx,{...def,autoAim:false,turretCount:0},x,y,o.r,o.angle);
    drawTankBodyShape(ctx,def,x,y,o.r,o.angle,o.hit>0?'#fff':color,'#090c10');
    if(def.autoAim||def.turretCount)drawTankDecoration(ctx,{...def,shell:false},x,y,o.r,o.angle);
    if(o.shieldUntil>elapsed){ctx.beginPath();ctx.arc(x,y,o.r+8,0,Math.PI*2);ctx.strokeStyle='#bdeaff90';ctx.lineWidth=2;ctx.stroke()}
    hpBar(o,o.r+12);
    if(enemy){ctx.textAlign='center';ctx.fillStyle='#aeb9c7';ctx.font='700 11px system-ui';ctx.fillText(o.name+' · Lv '+o.level+' '+classes[o.tankClass??'basic'].name,x,y-o.r-12)}
    ctx.restore();
  }
  function draw(){
    ctx.clearRect(0,0,W,H);ctx.save();ctx.translate(rand(-shake,shake),rand(-shake,shake));drawGrid();

    // Projectile, tank and shape layers: bullets are below barrels, while the
    // complete tank and impact fades disappear underneath overlapping shapes.
    for(const b of bullets)drawBullet(b);
    for(const b of bulletFades)drawBullet(b);
    for(const e of enemies)tankBarrels(e);if(player&&(mode!=='online'||player.alive))tankBarrels(player);
    for(const e of enemies)tankBody(e,'#ff6174',true);if(player&&(mode!=='online'||player.alive))tankBody(player,'#45d5ff');
    for(const s of shapes)drawShape(s);for(const s of shapeFades)drawShape(s);
    for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.fillRect(p.x-camera.x-p.r/2,p.y-camera.y-p.r/2,p.r,p.r)}ctx.globalAlpha=1;
    for(const f of floaters){ctx.globalAlpha=f.life;ctx.fillStyle='#fff';ctx.font='900 14px system-ui';ctx.textAlign='center';ctx.fillText(f.text,f.x-camera.x,f.y-camera.y)}ctx.globalAlpha=1;ctx.restore();
    if(player)drawMinimap();
  }
  function drawMinimap(){
    if(matchMedia('(pointer:coarse) and (orientation:portrait)').matches)return;
    const mobileLandscape=matchMedia('(pointer:coarse) and (orientation:landscape) and (max-height:800px)').matches;
    const pad=280,mw=world.w+pad*2,mh=world.h+pad*2,w=mobileLandscape?82:W<700?108:170,h=w*mh/mw,x=W-w-(mobileLandscape?10:16),y=mobileLandscape?50:H-h-(W<700?135:24);
    const mx=v=>x+(v+pad)/mw*w,my=v=>y+(v+pad)/mh*h;
    ctx.save();ctx.fillStyle='#363b43';ctx.fillRect(x,y,w,h);ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
    ctx.fillStyle='#171d26';ctx.fillRect(mx(0),my(0),world.w/mw*w,world.h/mh*h);
    ctx.fillStyle='#263444';ctx.fillRect(mx(world.w/2-CENTER_ZONE_SIZE/2),my(world.h/2-CENTER_ZONE_SIZE/2),CENTER_ZONE_SIZE/mw*w,CENTER_ZONE_SIZE/mh*h);
    const difficulty=mode==='online'?'hard':(player.difficulty??selectedDifficulty);
    if(difficulty==='easy')for(const s of shapes){ctx.fillStyle=shapeColor(s);ctx.fillRect(mx(s.x)-.8,my(s.y)-.8,1.6,1.6)}
    if(difficulty!=='hard')for(const e of enemies){ctx.fillStyle='#ff6174';ctx.beginPath();ctx.arc(mx(e.x),my(e.y),1.8,0,Math.PI*2);ctx.fill()}
    ctx.fillStyle='#45d5ff';ctx.beginPath();ctx.arc(mx(player.x),my(player.y),2.2,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
  function updateHud(){
    if(!player)return;
    const participants=[...enemies.map(e=>({name:e.name,score:e.score,kills:e.kills??0})),{name:player.name,score:player.score,kills:player.kills??0,me:true}];
    const bestScore=Math.max(0,...participants.map(p=>p.score)),bestKills=Math.max(0,...participants.map(p=>p.kills));
    const scorePercent=bestScore>0?player.score/bestScore*100:0,killsPercent=bestKills>0?(player.kills??0)/bestKills*100:0;
    ui.score.textContent=player.score.toLocaleString('pl-PL');ui.scoreMeterValue.textContent=player.score.toLocaleString('pl-PL');ui.killsValue.textContent=player.kills??0;
    ui.scoreFill.style.width=Math.min(100,scorePercent)+'%';ui.killsFill.style.width=Math.min(100,killsPercent)+'%';
    ui.level.textContent=player.level;ui.levelBottom.textContent=player.level;ui.tankNameBottom.textContent=classes[player.tankClass]?.name??'Basic';
    const need=xpNeeded(player.level);ui.xp.style.width=(player.level===MAX_LEVEL?100:player.xp/need*100)+'%';ui.xpText.textContent=player.level===MAX_LEVEL?'MAX · POZIOM 45':player.xp+' / '+need;
    const rows=participants.sort((a,b)=>b.score-a.score||b.kills-a.kills).slice(0,5);
    ui.board.innerHTML=rows.map(r=>`<li class="${r.me?'me':''}"><span>${escapeHtml(r.name)}</span><span class="board-stats"><b>${(r.score|0).toLocaleString('pl-PL')}</b><i>${r.kills} K</i></span></li>`).join('')
  }
  function escapeHtml(s){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function loop(t){const dt=Math.min(.033,(t-last)/1000||0);last=t;update(dt);draw();requestAnimationFrame(loop)}
  addEventListener('resize',resize);visualViewport?.addEventListener('resize',resize);addEventListener('mousemove',e=>{mouse.x=e.clientX/viewScale;mouse.y=e.clientY/viewScale});canvas.addEventListener('mousedown',e=>{if(e.button===0&&state==='playing')mouse.down=true});addEventListener('mouseup',()=>mouse.down=false);
  addEventListener('keydown',e=>{if(e.target?.matches?.('input,textarea'))return;const k=e.key.toLowerCase();if(state==='playing'&&['tab',' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();if(k==='escape'&&!e.repeat){pause();return}if(state!=='playing')return;if(k==='n'&&!e.repeat){e.preventDefault();grantMaxLevel();return}if(!e.repeat&&!$('#classPanel').hidden){const choice=classKeys.findIndex(label=>label.toLowerCase()===k);if(choice>=0&&availableClasses()[choice]){e.preventDefault();chooseClass(availableClasses()[choice]);return}}keys.add(k);if(e.repeat)return;if(k==='e')autoFire=!autoFire;if(k==='c')autoSpin=!autoSpin;if(k==='tab')$('.leaderboard').classList.toggle('hidden');if(/^[1-9]$/.test(k))upgrade(upgrades[+k-1][0])});addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  addEventListener('blur',()=>{keys.clear();mouse.down=false;resetTouchControls();if(state==='playing')pause()});
  $('#upgradeRows').innerHTML=upgrades.map(([kind,label,color],i)=>'<button data-upgrade="'+kind+'" style="--stat:'+color+'" disabled><b>'+(i+1)+'</b><span>'+label+'</span><small>0/'+MAX_STAT_LEVEL+'</small></button>').join('');
  function setUpgradeDrawer(open){ui.upgrades.classList.toggle('mobile-open',open);$('#mobileUpgradeToggle').setAttribute('aria-expanded',String(open))}
  $('#mobileUpgradeToggle').onclick=()=>setUpgradeDrawer(!ui.upgrades.classList.contains('mobile-open'));
  const drawerHandle=$('#upgradeDrawerHandle');let drawerY=null;
  drawerHandle.addEventListener('pointerdown',e=>{drawerY=e.clientY;drawerHandle.setPointerCapture(e.pointerId)});
  drawerHandle.addEventListener('pointerup',e=>{if(drawerY!==null&&e.clientY-drawerY<-18)setUpgradeDrawer(false);drawerY=null});
  $('#playBtn').onclick=()=>start(1,false,null,selectedDifficulty);$('#onlineBtn').onclick=startOnline;$('#againBtn').onclick=()=>{if(mode==='online')network?.command('respawn');else if(!player.alive)start(1,true,Math.floor(player.score*.4),player.difficulty)};$('#pauseBtn').onclick=()=>pause();$('#resumeBtn').onclick=()=>pause(false);$('#menuBtn').onclick=toMenu;$('#overMenuBtn').onclick=toMenu;document.querySelectorAll('[data-upgrade]').forEach(b=>b.onclick=()=>upgrade(b.dataset.upgrade));
  const difficultyCopy={easy:'4 boty · statystyki ×1 · EXP ×1',medium:'6 botów · lepsze AI · statystyki ×1 · EXP ×1,25',hard:'8 botów · najlepsze AI · statystyki ×1 · EXP ×1,5'};
  document.querySelectorAll('[data-difficulty]').forEach(b=>b.onclick=()=>{selectedDifficulty=b.dataset.difficulty;document.querySelectorAll('[data-difficulty]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));$('#difficultyDescription').textContent=difficultyCopy[selectedDifficulty]});
  $('#newRoomBtn').onclick=()=>{const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';$('#roomCode').value=Array.from(crypto.getRandomValues(new Uint8Array(6)),n=>alphabet[n%alphabet.length]).join('');$('#joinStatus').textContent='Wyślij ten kod znajomemu i wejdź do Multiplayer.'};
  $('#copyRoomBtn').onclick=async()=>{const url=new URL('/arena.html',location.origin);url.searchParams.set('room',network?.code??'ARENA');try{await navigator.clipboard.writeText(url.href);$('#copyRoomBtn').textContent='SKOPIOWANO';setTimeout(()=>$('#copyRoomBtn').textContent='KOPIUJ LINK',1800)}catch{$('#connectionStatus').textContent='Wyślij znajomemu kod: '+network?.code}};
  const invitedRoom=new URLSearchParams(location.search).get('room');if(invitedRoom&&/^[A-Z0-9]{6}$/i.test(invitedRoom))$('#roomCode').value=invitedRoom.toUpperCase();
  addEventListener('pagehide',()=>network?.leave());
  let touchMove={x:0,y:0},touchFire=false,touchAimAngle=null,touchAimStrength=0;
  const stickResetters=[];
  function resetTouchControls(){
    touchMove={x:0,y:0};touchFire=false;touchAimAngle=null;touchAimStrength=0;
    for(const reset of stickResetters)reset();
  }
  function bindStick(id,kind){
    const el=$('#'+id),knob=el.querySelector('i');let pointer=null;
    function update(e){
      const r=el.getBoundingClientRect(),x=e.clientX-(r.left+r.width/2),y=e.clientY-(r.top+r.height/2),radius=r.width*.43,m=Math.min(radius,Math.hypot(x,y)),a=Math.atan2(y,x),v={x:Math.cos(a)*m/radius,y:Math.sin(a)*m/radius};
      knob.style.transform=`translate(${v.x*radius*.72}px,${v.y*radius*.72}px)`;
      if(kind==='move')touchMove=v;
      else if(m>radius*.13){touchAimAngle=a;touchAimStrength=m/radius;touchFire=true}
    }
    function reset(){pointer=null;if(kind==='move')touchMove={x:0,y:0};else{touchFire=false;touchAimAngle=null;touchAimStrength=0}knob.style.transform=''}
    function stop(e){if(pointer===null||e.pointerId!==pointer)return;reset()}
    function move(e){if(pointer!==e.pointerId)return;e.preventDefault();update(e)}
    el.addEventListener('pointerdown',e=>{e.preventDefault();reset();pointer=e.pointerId;try{el.setPointerCapture(pointer)}catch{}if(kind==='aim')touchFire=true;update(e)});
    addEventListener('pointermove',move,{capture:true,passive:false});
    addEventListener('pointerup',stop,true);addEventListener('pointercancel',stop,true);el.addEventListener('lostpointercapture',stop);
    el.addEventListener('contextmenu',e=>e.preventDefault());stickResetters.push(reset);
  }
  bindStick('moveStick','move');bindStick('aimStick','aim');
  document.addEventListener('visibilitychange',()=>{if(document.hidden)resetTouchControls()});
  addEventListener('pagehide',resetTouchControls);addEventListener('orientationchange',resetTouchControls);
  function registerWebMCP(){const mc=document.modelContext;if(!mc?.registerTool)return;const tool=(name,title,description,execute)=>{try{Promise.resolve(mc.registerTool({name,title,description,inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute})).catch(()=>{})}catch{}};tool('start_solo_game','Rozpocznij grę Solo','Uruchamia nową rozgrywkę Solo w Neon Arena.',()=>{start();return{status:'started',mode:'solo'}});tool('pause_or_resume_game','Pauza lub wznowienie','Przełącza pauzę trwającej rozgrywki.',()=>{if(state==='playing')pause();else if(state==='paused')pause(false);return{status:state}})}
  resize();mouse.x=W*.75;mouse.y=H*.5;registerWebMCP();requestAnimationFrame(loop);
})();
