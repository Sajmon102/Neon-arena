import {classes, availableClassIds, MAP_WIDTH, MAP_HEIGHT, MAX_SHAPES, SHAPE_STATS, SHAPE_IMPACT_DAMAGE, BULLET_RAW_STATS, BASIC_BARREL_STATS, RAW_BULLET_RANGE_UNITS_PER_SECOND, shapeTypeFromRoll, shapeRadius, shapeSpawnPoint, randomSpawnPoint, orbitShape, separateBodies, xpNeeded, skillPointsForLevel, skillPointsAtLevel, tankRadius, scoreForLevel, levelProgressFromScore, tierFromRoll, tankStats, MAX_LEVEL, MAX_STAT_LEVEL, SPAWN_SHIELD_SECONDS, barrelLength, bulletRadius} from '../public/rules.js';

export const WORLD = {w:MAP_WIDTH,h:MAP_HEIGHT};
export const STAT_KEYS = ['regen','health','body','bulletSpeed','bulletHealth','bulletPenetration','damage','reload','speed'];
export const MAX_PLAYERS = 8;
const REGEN_DELAY=5;
const SHAPE_RESPAWN_DELAY=5;
const CRASHER_SPEED=135;
const CRASHER_VISION_RANGE=650;
const rand=(a,b)=>a+Math.random()*(b-a);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const normalRandom=()=>{const a=Math.max(Number.EPSILON,Math.random()),b=Math.random();return Math.sqrt(-2*Math.log(a))*Math.cos(2*Math.PI*b)};
export function createArena(now){
  const a={time:0,wall:now,nextId:1,players:[],shapes:[],bullets:[],respawns:[]};
  for(let i=0;i<MAX_SHAPES;i++)spawnShape(a);
  return a;
}
function safePosition(a,margin){
  let best=randomSpawnPoint(),bestGap=-Infinity;
  for(let i=0;i<35;i++){
    const p=randomSpawnPoint();
    const gap=Math.min(...a.players.filter(p=>p.alive).map(t=>Math.hypot(t.x-p.x,t.y-p.y)),10000);
    const shapeGap=Math.min(...a.shapes.map(t=>Math.hypot(t.x-p.x,t.y-p.y)-t.r),10000);
    const quality=Math.min(gap-margin,shapeGap-65);
    if(quality>bestGap){best=p;bestGap=quality}if(quality>=0)break;
  }return best;
}
export function stats(p){
  Object.assign(p,tankStats(p.ranks,p.level));
}
export function addPlayer(a,id,tokenHash,name,now,savedLevel=1,savedScore=null){
  const progress=savedScore===null?{level:savedLevel,xp:0}:levelProgressFromScore(savedScore);savedLevel=progress.level;
  const p={id,tokenHash,name,...safePosition(a,450),vx:0,vy:0,r:tankRadius(savedLevel),angle:0,hp:100,
    alive:true,score:savedScore??scoreForLevel(savedLevel),xp:progress.xp,level:savedLevel,tankClass:'basic',cool:.55,lastDamage:-REGEN_DELAY,hit:0,
    ranks:Object.fromEntries(STAT_KEYS.map(k=>[k,0])),points:skillPointsAtLevel(savedLevel),kills:0,seq:-1,command:0,
    input:{x:0,y:0,angle:0,fire:false},seen:now,inputAt:now,shieldUntil:a.time+SPAWN_SHIELD_SECONDS};
  stats(p);a.players.push(p);return p;
}
function spawnShape(a){
  let type=shapeTypeFromRoll(Math.random());const tier=tierFromRoll(Math.random()),crasher=tier==='crasher';
  const s=SHAPE_STATS[type];
  const hp=s[1]*(crasher?1:[0,1,2.5,6,12][tier]);
  const r=shapeRadius(type,tier);
  let point=shapeSpawnPoint(type,Math.random,a.shapes);for(let i=0;i<80&&(a.players.some(p=>p.alive&&Math.hypot(p.x-point.x,p.y-point.y)<140)||a.shapes.some(other=>Math.hypot(other.x-point.x,other.y-point.y)<r+other.r+6));i++)point=shapeSpawnPoint(type,Math.random,a.shapes);
  a.shapes.push({id:'s'+a.nextId++,type,tier,crasher,...point,r,hp,maxHp:hp,
    reward:s[2]*(crasher?1:[0,1,4,12,30][tier]),sides:s[3],rot:rand(0,Math.PI),vr:rand(.40,.80)*(Math.random()<.5?-1:1),vx:0,vy:0,hit:0,contacts:{}});
}
function force(v,max){const d=v<0?-v:v>max?v-max:0;return(v<0?1:-1)*(d*10+d*d*.16)}
function drift(o,dt,shape=false){const decay=Math.exp(-8*dt),step=(1-decay)/8;o.x+=o.vx*step;o.y+=o.vy*step;o.vx*=decay;o.vy*=decay;if(shape){o.x=clamp(o.x,o.r,WORLD.w-o.r);o.y=clamp(o.y,o.r,WORLD.h-o.r)}}
function gain(p,n){
  if(!p)return;p.score+=n;if(p.level<MAX_LEVEL)p.xp+=n;
  while(p.level<MAX_LEVEL&&p.xp>=xpNeeded(p.level)){p.xp-=xpNeeded(p.level);p.level++;p.points+=skillPointsForLevel(p.level)}
  p.r=tankRadius(p.level);
  if(p.level===MAX_LEVEL)p.xp=0;
}
function hurt(a,t,damage,owner){
  if(t.hp<=0||(!t.type&&t.shieldUntil>a.time))return;
  t.hp=Math.max(0,t.hp-damage);t.hit=.1;
  if(!t.type)t.lastDamage=a.time;
  if(t.hp===0){
    if(t.type)gain(owner,t.reward);
    else{t.alive=false;t.input.fire=false;if(owner&&owner.id!==t.id){gain(owner,Math.floor(t.score*.30));owner.kills++}}
  }
}
export function shoot(a,p){
  const def=classes[p.tankClass];
  const groups=def.fireGroups,indices=groups?groups[(p.shotIndex??0)%groups.length]:def.guns.map((_,i)=>i);p.shotIndex=(p.shotIndex??0)+1;
  for(const index of indices){const g=def.guns[index];
    const barrelStats={...BASIC_BARREL_STATS,...g};
    if(def.activeCap&&g.mode===def.activeMode&&a.bullets.filter(b=>b.owner===p.id&&b.mode===def.activeMode&&b.life>0).length>=def.activeCap)continue;
    const candidates=def.autoTurrets?[...a.shapes,...a.players.filter(t=>t.alive&&t.id!==p.id)].filter(t=>t.hp>0).sort((x,y)=>Math.hypot(x.x-p.x,x.y-p.y)-Math.hypot(y.x-p.x,y.y-p.y)):[];
    const target=candidates.length?candidates[index%candidates.length]:null,base=target?Math.atan2(target.y-p.y,target.x-p.x):p.angle+g.angle;
    const shudder=barrelStats.shudder??0,spray=barrelStats.spray??0;
    const speedJitter=shudder?clamp(normalRandom()*Math.sqrt(shudder),-2*shudder,2*shudder):0;
    const sprayDegrees=spray?clamp(normalRandom()*spray*shudder,-spray/2,spray/2):0;
    const angle=base+rand(-(def.spread??0),def.spread??0)+sprayDegrees*Math.PI/180;
    const rawStats={health:BULLET_RAW_STATS.health*(p.bulletHealth/5)*barrelStats.health,damage:BULLET_RAW_STATS.damage*(p.damage/10)*barrelStats.damage,penetration:BULLET_RAW_STATS.penetration*p.bulletPenetration*barrelStats.penetration,range:BULLET_RAW_STATS.range,pushability:BULLET_RAW_STATS.pushability,speed:BULLET_RAW_STATS.speed*(p.bulletSpeed/320)*(barrelStats.speed/BASIC_BARREL_STATS.speed),acceleration:BULLET_RAW_STATS.acceleration,shield:BULLET_RAW_STATS.shield,regeneration:BULLET_RAW_STATS.regeneration,resist:barrelStats.resist};
    const mode=g.mode??'bullet',life=mode==='drone'||mode==='minion'?60:mode==='sentry'||mode==='assembler'?20:mode==='boomer'?3.2:mode==='swarm'?2.1:mode==='hive'?1.65:g.life??def.life??BULLET_RAW_STATS.range/RAW_BULLET_RANGE_UNITS_PER_SECOND;
    const speed=rawStats.speed*(320/BULLET_RAW_STATS.speed)*barrelStats.maxSpeed*(def.speed??1)*(1+speedJitter),scale=p.r/25,muzzle=5*scale+barrelLength(g,p.r),offset=g.offset*scale;
    const hp=rawStats.health*(5/BULLET_RAW_STATS.health);
    const damage=rawStats.damage*(10/BULLET_RAW_STATS.damage),tankDamage=rawStats.damage*(5/BULLET_RAW_STATS.damage);
    a.bullets.push({id:'b'+a.nextId++,owner:p.id,x:p.x+Math.cos(base)*muzzle-Math.sin(base)*offset,y:p.y+Math.sin(base)*muzzle+Math.cos(base)*offset,
      vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,baseSpeed:speed,r:bulletRadius(g,p.r)*barrelStats.size,life,damage:damage*(def.damage??1),tankDamage:tankDamage*(def.damage??1),penetration:rawStats.penetration,rawStats,density:barrelStats.density,pushability:rawStats.pushability*(barrelStats.density??1),resist:rawStats.resist,mode,projectileShape:g.projectile??g.shape,wavePhase:g.wavePhase??0,waveAmplitude:g.waveAmplitude??13,waveFrequency:g.waveFrequency??8,split:def.split??0,age:0,hp,maxHp:hp,hits:[],bulletHits:[]});
    const recoil=65*barrelStats.recoil*(def.recoil??1)/Math.sqrt(Math.max(1,indices.length));p.vx-=Math.cos(angle)*recoil;p.vy-=Math.sin(angle)*recoil;
  }
  const reloadGun=def.guns[indices[0]??0];
  p.cool=p.reload*((reloadGun?.reload??BASIC_BARREL_STATS.reload)/BASIC_BARREL_STATS.reload)*(def.reload??1)*(def.cycleInterval??1);
}
export function impactTime(b,t){
  const x=b.prevX??b.x,y=b.prevY??b.y,dx=b.x-x,dy=b.y-y,ox=x-t.x,oy=y-t.y,r=b.r+t.r,c=ox*ox+oy*oy-r*r;
  if(c<=0)return 0;const a=dx*dx+dy*dy;if(a<1e-12)return null;
  const dot=ox*dx+oy*dy,disc=dot*dot-a*c;if(disc<0)return null;
  const time=(-dot-Math.sqrt(disc))/a;return time>=0&&time<=1?time:null;
}
function bulletImpactTime(first,second){
  const ax=first.prevX??first.x,ay=first.prevY??first.y,bx=second.prevX??second.x,by=second.prevY??second.y;
  const ox=ax-bx,oy=ay-by,dx=(first.x-ax)-(second.x-bx),dy=(first.y-ay)-(second.y-by),r=first.r+second.r,c=ox*ox+oy*oy-r*r;
  if(c<=0)return 0;const speed=dx*dx+dy*dy;if(speed<1e-12)return null;
  const dot=ox*dx+oy*dy,disc=dot*dot-speed*c;if(disc<0)return null;
  const time=(-dot-Math.sqrt(disc))/speed;return time>=0&&time<=1?time:null;
}
export function applyBulletKnockback(first,second,time){
  const ax=(first.prevX??first.x)+(first.x-(first.prevX??first.x))*time,ay=(first.prevY??first.y)+(first.y-(first.prevY??first.y))*time;
  const bx=(second.prevX??second.x)+(second.x-(second.prevX??second.x))*time,by=(second.prevY??second.y)+(second.y-(second.prevY??second.y))*time;
  let dx=bx-ax,dy=by-ay,d=Math.hypot(dx,dy);if(d<1e-6){dx=first.vx-second.vx;dy=first.vy-second.vy;d=Math.hypot(dx,dy)}if(d<1e-6)return;
  const nx=dx/d,ny=dy/d,closing=(first.vx-second.vx)*nx+(first.vy-second.vy)*ny;if(closing<=0)return;
  const mass1=Math.max(.1,first.density??1)*Math.max(4,first.r*first.r)*Math.max(1,first.penetration??1);
  const mass2=Math.max(.1,second.density??1)*Math.max(4,second.r*second.r)*Math.max(1,second.penetration??1);
  const inv1=1/mass1,inv2=1/mass2,impulse=Math.min(32/Math.max(inv1,inv2),.3*closing/(inv1+inv2));
  first.vx-=impulse*inv1*nx;first.vy-=impulse*inv1*ny;second.vx+=impulse*inv2*nx;second.vy+=impulse*inv2*ny;
}
export function updateBulletDamageAfterCollision(b){
  b.baseDamage??=b.damage;b.baseTankDamage??=b.tankDamage;
  const healthRatio=clamp(b.hp/Math.max(1,b.maxHp??b.hp),0,1);
  b.damage=b.baseDamage*healthRatio;b.tankDamage=b.baseTankDamage*healthRatio;
}
function contact(a,p,t,dt){
  let dx=p.x-t.x,dy=p.y-t.y,d=Math.hypot(dx,dy),overlap=p.r+t.r-d;
  if(overlap<=0)return;if(d<.001){dx=1;dy=0;d=1}
  const nx=dx/d,ny=dy/d,impulse=Math.min(110,overlap*14)*dt;
  p.vx+=nx*impulse*4.2;p.vy+=ny*impulse*4.2;t.vx-=nx*impulse*3.2;t.vy-=ny*impulse*3.2;
  const contacts=t.contacts??(t.contacts={});
  if(a.time>=(contacts[p.id]??0)){
    contacts[p.id]=a.time+.35;
    const protectedPair=!t.type&&(p.shieldUntil>a.time||t.shieldUntil>a.time);
    if(!protectedPair){hurt(a,p,t.type?SHAPE_IMPACT_DAMAGE[t.type]:t.bodyDamage,t.type?null:t);hurt(a,t,p.bodyDamage*(classes[p.tankClass].bodyDamage??1),p)}
  }
}
function tick(a,dt,now){
  a.time+=dt;
  const due=a.respawns.filter(at=>at<=a.time);a.respawns=a.respawns.filter(at=>at>a.time);for(const at of due)if(a.shapes.length<MAX_SHAPES)spawnShape(a);
  for(const p of a.players){
    if(!p.alive)continue;
    if(a.time-p.lastDamage>=REGEN_DELAY)p.hp=Math.min(p.maxHp,p.hp+p.regen*dt);
    p.hit=Math.max(0,p.hit-dt);p.cool-=dt;
    const input=now-p.inputAt<650?p.input:{x:0,y:0,angle:p.angle,fire:false},len=Math.max(1,Math.hypot(input.x,input.y));
    p.x+=input.x/len*p.speed*dt;p.y+=input.y/len*p.speed*dt;p.angle=input.angle;
    const classDef=classes[p.tankClass];
    if(classDef.cloak){const moving=Math.hypot(input.x,input.y)>.05;if(moving||a.time-(p.lastDamage??-99)<.45)p.cloakIdle=0;else p.cloakIdle=(p.cloakIdle??0)+dt;p.cloakAlpha=1-.88*clamp(((p.cloakIdle??0)-(classDef.cloakDelay??2))/1.15,0,1)}else{p.cloakIdle=0;p.cloakAlpha=1}
    if(classDef.autoAim&&!classDef.autoTurrets){const target=[...a.shapes,...a.players.filter(t=>t.alive&&t.id!==p.id)].filter(t=>t.hp>0).sort((x,y)=>Math.hypot(x.x-p.x,x.y-p.y)-Math.hypot(y.x-p.x,y.y-p.y))[0];if(target)p.angle=Math.atan2(target.y-p.y,target.x-p.x)}
    p.vx+=force(p.x,WORLD.w)*dt;p.vy+=force(p.y,WORLD.h)*dt;drift(p,dt);
    if((input.fire||classDef.autoAim||classDef.autoTurrets)&&p.cool<=0&&a.bullets.length<900)shoot(a,p);
  }
  for(const s of a.shapes){
    if(s.crasher){
      const nearest=a.players.filter(p=>p.alive).map(p=>({p,d:Math.hypot(p.x-s.x,p.y-s.y)})).sort((x,y)=>x.d-y.d)[0];
      if(nearest&&nearest.d<=CRASHER_VISION_RANGE){const dx=nearest.p.x-s.x,dy=nearest.p.y-s.y,d=Math.max(1,nearest.d);s.x+=dx/d*CRASHER_SPEED*dt;s.y+=dy/d*CRASHER_SPEED*dt;s.rot=Math.atan2(dy,dx)+Math.PI/2}
      else orbitShape(s,dt);
    }else orbitShape(s,dt);
    s.hit=Math.max(0,s.hit-dt);drift(s,dt,true)
  }
  for(let i=0;i<a.shapes.length;i++)for(let j=i+1;j<a.shapes.length;j++)separateBodies(a.shapes[i],a.shapes[j]);
  const living=a.players.filter(p=>p.alive);
  for(let i=0;i<living.length;i++){
    const p=living[i];for(const s of a.shapes)if(s.hp>0&&p.alive)contact(a,p,s,dt);
    for(let j=i+1;j<living.length;j++)if(p.alive&&living[j].alive)contact(a,p,living[j],dt);
  }
  const spawnedBullets=[];
  for(const b of a.bullets){
    b.prevX=b.x;b.prevY=b.y;b.age=(b.age??0)+dt;
    if((b.mode==='trap'||b.mode==='sentry')&&b.age>.18){const drag=Math.exp(-24*dt);b.vx*=drag;b.vy*=drag}
    if(b.mode==='assembler'&&b.age>.18){const drag=Math.exp(-8*dt);b.vx*=drag;b.vy*=drag;const mates=a.bullets.filter(other=>other!==b&&other.mode==='assembler'&&other.owner===b.owner&&other.life>0).sort((x,y)=>Math.hypot(x.x-b.x,x.y-b.y)-Math.hypot(y.x-b.x,y.y-b.y));const mate=mates[0];if(mate){const dx=mate.x-b.x,dy=mate.y-b.y,d=Math.max(1,Math.hypot(dx,dy)),gap=d-(b.r+mate.r)*1.05;if(gap>0){b.vx+=dx/d*Math.min(150,gap*2.2)*dt;b.vy+=dy/d*Math.min(150,gap*2.2)*dt}}}
    if(b.mode==='boomer'&&b.age>.46){const owner=a.players.find(p=>p.id===b.owner);if(owner){const dx=owner.x-b.x,dy=owner.y-b.y,d=Math.max(1,Math.hypot(dx,dy)),speed=Math.max(300,(b.baseSpeed??320)*.82);b.vx=dx/d*speed;b.vy=dy/d*speed;if(d<owner.r+b.r+5)b.life=0}}
    if(b.mode==='drone'||b.mode==='swarm'||b.mode==='minion'){
      const targets=[...a.shapes,...a.players.filter(p=>p.alive&&p.id!==b.owner)];let target=null,best=Infinity;
      for(const t of targets){if(t.hp<=0)continue;const d=Math.hypot(t.x-b.x,t.y-b.y);if(d<best){best=d;target=t}}
      const owner=a.players.find(p=>p.id===b.owner),controlled=b.mode==='drone'&&owner?.input.fire;
      const controlX=owner?.input.aimX??(owner?owner.x+Math.cos(owner.angle)*600:b.x),controlY=owner?.input.aimY??(owner?owner.y+Math.sin(owner.angle)*600:b.y),controlDistance=controlled?Math.hypot(controlX-b.x,controlY-b.y):Infinity;
      const desired=controlled?Math.atan2(controlY-b.y,controlX-b.x):(target?Math.atan2(target.y-b.y,target.x-b.x):owner?Math.atan2(owner.y-b.y,owner.x-b.x):Math.atan2(b.vy,b.vx));
      const current=Math.atan2(b.vy,b.vx),turn=Math.atan2(Math.sin(desired-current),Math.cos(desired-current)),turnRate=controlled?5.5:b.mode==='swarm'?4.4:2.8,angle=current+Math.max(-turnRate*dt,Math.min(turnRate*dt,turn)),maxSpeed=Math.max(b.mode==='minion'?220:320,Math.hypot(b.vx,b.vy)),arrival=Math.max(10,b.r*.65),speed=controlled?Math.min(maxSpeed,Math.max(0,(controlDistance-arrival)*5)):maxSpeed;b.vx=Math.cos(angle)*speed;b.vy=Math.sin(angle)*speed;
      if(b.mode==='minion'&&target&&best<620&&(b.turretCool=(b.turretCool??rand(0,.3))-dt)<=0){b.turretCool=.55;const shotAngle=Math.atan2(target.y-b.y,target.x-b.x),shotSpeed=460;spawnedBullets.push({id:'b'+a.nextId++,owner:b.owner,x:b.x+Math.cos(shotAngle)*b.r,y:b.y+Math.sin(shotAngle)*b.r,vx:Math.cos(shotAngle)*shotSpeed,vy:Math.sin(shotAngle)*shotSpeed,baseSpeed:shotSpeed,r:Math.max(3,b.r*.28),life:1.15,damage:b.damage*.42,tankDamage:b.tankDamage*.42,mode:'bullet',split:0,age:0,hp:b.maxHp*.35,maxHp:b.maxHp*.35,hits:[],bulletHits:[]})}
    }else if(b.mode==='missile'||b.mode==='hive'){
      const current=Math.hypot(b.vx,b.vy),next=Math.min((b.baseSpeed??320)*1.65,current*Math.exp(1.2*dt));if(current>0){b.vx*=next/current;b.vy*=next/current}
      if(b.mode==='hive'&&b.age>.12&&(b.hiveCool=(b.hiveCool??0)-dt)<=0){b.hiveCool=.22;const heading=Math.atan2(b.vy,b.vx),speed=Math.max(280,current*.72);for(const turn of [-.48,.48])spawnedBullets.push({id:'b'+a.nextId++,owner:b.owner,x:b.x,y:b.y,vx:Math.cos(heading+turn)*speed,vy:Math.sin(heading+turn)*speed,baseSpeed:speed,r:Math.max(3,b.r*.38),life:1.05,damage:b.damage*.3,tankDamage:b.tankDamage*.3,mode:'swarm',split:0,age:0,hp:b.maxHp*.25,maxHp:b.maxHp*.25,hits:[],bulletHits:[]})}
    }
    if(b.mode==='sentry'){
      const targets=[...a.shapes,...a.players.filter(p=>p.alive&&p.id!==b.owner)];let target=null,best=Infinity;for(const t of targets){if(t.hp<=0)continue;const d=Math.hypot(t.x-b.x,t.y-b.y);if(d<best){best=d;target=t}}
      if(target&&best<560&&(b.turretCool=(b.turretCool??rand(0,.35))-dt)<=0){b.turretCool=.72;const shotAngle=Math.atan2(target.y-b.y,target.x-b.x),shotSpeed=500;b.turretAngle=shotAngle;spawnedBullets.push({id:'b'+a.nextId++,owner:b.owner,x:b.x+Math.cos(shotAngle)*b.r,y:b.y+Math.sin(shotAngle)*b.r,vx:Math.cos(shotAngle)*shotSpeed,vy:Math.sin(shotAngle)*shotSpeed,baseSpeed:shotSpeed,r:Math.max(3,b.r*.24),life:1.1,damage:b.damage*.38,tankDamage:b.tankDamage*.38,mode:'bullet',split:0,age:0,hp:b.maxHp*.3,maxHp:b.maxHp*.3,hits:[],bulletHits:[]})}
    }
    if(b.mode==='wave'){const speed=Math.max(1,Math.hypot(b.vx,b.vy)),offset=Math.sin(b.age*(b.waveFrequency??8)+(b.wavePhase??0))*(b.waveAmplitude??13),delta=offset-(b.waveOffset??0);b.x+=-b.vy/speed*delta;b.y+=b.vx/speed*delta;b.waveOffset=offset}
    b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;if(b.life<=0)continue;
  }
  a.bullets.push(...spawnedBullets);
  for(let i=0;i<a.bullets.length;i++){
    const first=a.bullets[i];if(first.life<=0)continue;
    for(let j=i+1;j<a.bullets.length;j++){
      const second=a.bullets[j];
      const collisionTime=bulletImpactTime(first,second);
      if(second.life<=0||first.owner===second.owner||first.bulletHits.includes(second.id)||collisionTime===null)continue;
      first.bulletHits.push(second.id);second.bulletHits.push(first.id);
      applyBulletKnockback(first,second,collisionTime);
      const firstDamage=first.damage,secondDamage=second.damage;
      updateBulletDamageAfterCollision(first);updateBulletDamageAfterCollision(second);
      first.hp-=secondDamage/(Math.max(1,first.penetration??1)*Math.max(.01,first.resist??1));second.hp-=firstDamage/(Math.max(1,second.penetration??1)*Math.max(.01,second.resist??1));
      updateBulletDamageAfterCollision(first);updateBulletDamageAfterCollision(second);
      if(first.hp<=0)first.life=0;if(second.hp<=0)second.life=0;
      if(first.life<=0)break;
    }
  }
  for(const b of a.bullets){
    if(b.life<=0)continue;
    const owner=a.players.find(p=>p.id===b.owner);
    const impacts=[...a.shapes,...a.players].filter(t=>t.hp>0&&t.id!==b.owner&&!b.hits.includes(t.id)&&!(!t.type&&t.shieldUntil>a.time))
      .map(t=>({target:t,at:impactTime(b,t)})).filter(i=>i.at!==null).sort((x,y)=>x.at-y.at);
    for(const {target} of impacts){
      const targetHp=target.hp,push=b.pushability/(BULLET_RAW_STATS.pushability||1);
      b.hits.push(target.id);hurt(a,target,target.type?b.damage:b.tankDamage,owner);target.vx+=b.vx*(target.type ? .06 : .12)*push;target.vy+=b.vy*(target.type ? .06 : .12)*push;
      updateBulletDamageAfterCollision(b);
      b.hp-=targetHp/Math.max(1,b.penetration??1);
      updateBulletDamageAfterCollision(b);
      const destroyed=target.type?target.hp<=0:!target.alive;
      if(b.hp<=0||!destroyed){b.life=0;break}
    }
  }
  const splitChildren=[];
  for(const b of a.bullets)if(b.life<=0&&b.split===3&&!b.splitDone&&(b.age??0)>.06){b.splitDone=true;const heading=Math.atan2(b.vy,b.vx),speed=Math.max(260,Math.hypot(b.vx,b.vy)*.82);for(const turn of [-.42,0,.42])splitChildren.push({id:'b'+a.nextId++,owner:b.owner,x:b.x,y:b.y,vx:Math.cos(heading+turn)*speed,vy:Math.sin(heading+turn)*speed,baseSpeed:speed,r:Math.max(3,b.r*.58),life:.65,damage:b.damage*.45,tankDamage:b.tankDamage*.45,mode:'bullet',split:0,age:0,hp:b.maxHp*.45,maxHp:b.maxHp*.45,hits:[],bulletHits:[]})}
  a.bullets=a.bullets.filter(b=>b.life>0);a.bullets.push(...splitChildren);
  for(const s of a.shapes)if(s.hp<=0)a.respawns.push(a.time+SHAPE_RESPAWN_DELAY);
  a.shapes=a.shapes.filter(s=>s.hp>0);
}
export function advance(a,now){
  // Idle rooms freeze instead of simulating minutes in one request. Short, fixed
  // physics steps still use wall time, not the number of connected clients.
  a.players=a.players.filter(p=>now-p.seen<20000);
  const present=new Set(a.players.map(p=>p.id));
  for(const target of [...a.shapes,...a.players])if(target.contacts)for(const id of Object.keys(target.contacts))if(!present.has(id))delete target.contacts[id];
  let left=Math.min(1,Math.max(0,(now-a.wall)/1000));
  while(left>1e-7){const dt=Math.min(1/30,left);tick(a,dt,now);left-=dt}
  a.wall=Math.max(a.wall,now);
}
export function setInput(p,data,now){
  if(!Number.isSafeInteger(data.seq)||data.seq<=p.seq)return;
  p.seq=data.seq;p.seen=now;p.inputAt=now;
  const n=v=>typeof v==='number'&&Number.isFinite(v)?v:0;
  const aimX=typeof data.input?.aimX==='number'&&Number.isFinite(data.input.aimX)?clamp(data.input.aimX,0,WORLD.w):undefined,aimY=typeof data.input?.aimY==='number'&&Number.isFinite(data.input.aimY)?clamp(data.input.aimY,0,WORLD.h):undefined;
  p.input={x:clamp(n(data.input?.x),-1,1),y:clamp(n(data.input?.y),-1,1),angle:clamp(n(data.input?.angle),-10000,10000),aimX,aimY,fire:data.input?.fire===true};
}
export function command(a,p,c,now){
  if(!c||!Number.isSafeInteger(c.id)||c.id<=p.command)return p;
  p.command=c.id;
  if(c.kind==='respawn'&&!p.alive){
    a.players=a.players.filter(t=>t.id!==p.id);
    const fresh=addPlayer(a,p.id,p.tokenHash,p.name,now,1,Math.floor(p.score*.4));fresh.command=c.id;fresh.seq=p.seq;return fresh;
  }
  if(!p.alive)return p;
  if(c.kind==='upgrade'&&STAT_KEYS.includes(c.value)&&p.points>0&&p.ranks[c.value]<MAX_STAT_LEVEL){
    const old=p.maxHp;p.ranks[c.value]++;p.points--;stats(p);if(c.value==='health')p.hp+=p.maxHp-old;
  }
  if(c.kind==='class'&&availableClassIds(p.tankClass,p.level).includes(c.value))p.tankClass=c.value;
  return p;
}
export function snapshot(a,id,code,revision){
  // Explicit projections: no session hashes, inputs or internal collision state.
  const players=a.players.map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,vx:p.vx,vy:p.vy,r:p.r,angle:p.angle,hp:p.hp,maxHp:p.maxHp,alive:p.alive,score:p.score,xp:p.xp,level:p.level,tankClass:p.tankClass,hit:p.hit,kills:p.kills,shieldUntil:p.shieldUntil,cloakAlpha:p.cloakAlpha??1}));
  const p=a.players.find(p=>p.id===id);
  return {code,revision,time:a.time,world:WORLD,maxPlayers:MAX_PLAYERS,players,
    self:p?{...players.find(t=>t.id===id),ranks:p.ranks,points:p.points,regen:p.regen,lastDamage:p.lastDamage,speed:p.speed,command:p.command,seq:p.seq}:null,
    shapes:a.shapes.map(({contacts,...s})=>s),bullets:a.bullets.map(({hits,bulletHits,damage,hp,maxHp,prevX,prevY,...b})=>b)};
}
