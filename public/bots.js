import {classes,MAX_LEVEL,MAX_STAT_LEVEL,SPAWN_SHIELD_SECONDS,xpNeeded,skillPointsForLevel,tankStats,DIFFICULTIES,availableClassIds} from './rules.js?v=94';

const AI={
  easy:{thinkMin:.48,thinkRange:.26,aimError:.34,lead:0,dodgeChance:0,dodgeHorizon:0,dodgeWeight:0,retreatHp:.32,strafe:.28,threatRange:500,memory:0,chaseLimit:1050},
  medium:{thinkMin:.30,thinkRange:.19,aimError:.17,lead:.6,dodgeChance:.55,dodgeHorizon:.65,dodgeWeight:1.2,retreatHp:.38,strafe:.43,threatRange:650,memory:.45,chaseLimit:1450},
  hard:{thinkMin:.16,thinkRange:.14,aimError:.09,lead:1,dodgeChance:1,dodgeHorizon:.95,dodgeWeight:1.75,retreatHp:.42,strafe:.58,threatRange:800,memory:.8,chaseLimit:1900}
};
const STYLES=['gunner','ranger','mobile','body'];
const BODY_CLASSES=new Set(['smasher','spike','landmine','megaSmasher','autoSmasher']);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const targetVelocity=target=>({x:target.aiVx??((target.moveX??0)*(target.speed??0)+(target.vx??0)),y:target.aiVy??((target.moveY??0)*(target.speed??0)+(target.vy??0))});
export function botStats(b){Object.assign(b,tankStats(b.ranks,b.level,b.statMultiplier??1))}
export function createBot(id,name,x,y,random=Math.random,difficulty='easy',time=0){
  const settings=DIFFICULTIES[difficulty]??DIFFICULTIES.easy;
  const style=STYLES[Math.floor(random()*STYLES.length)];
  const b={id,name,x,y,vx:0,vy:0,angle:0,hp:100,level:1,xp:0,score:0,kills:0,points:0,tankClass:'basic',
    difficulty,statMultiplier:settings.statMultiplier,xpMultiplier:settings.xpMultiplier,style,
    ranks:Object.fromEntries(['regen','health','body','bulletSpeed','bulletHealth','bulletPenetration','damage','reload','speed'].map(k=>[k,0])),
    spent:0,think:0,cool:.6,hit:0,lastDamage:time-5,shieldUntil:time+SPAWN_SHIELD_SECONDS,
    wander:random()*Math.PI*2,strafe:random()<.5?-1:1,aimError:0,contacts:{},moveX:0,moveY:0};
  botStats(b);return b;
}
function styleScore(def,style,b){
  const body=BODY_CLASSES.has(def.name==='Mega Smasher'?'megaSmasher':Object.keys(classes).find(key=>classes[key]===def)??'')||!!def.bodyDamage||(!def.guns.length&&def.tier>0);
  const drone=def.guns.some(g=>['drone','swarm','minion'].includes(g.mode));
  const dps=(def.damage??1)*(def.speed??1)*(def.life??2)/(def.reload??1);
  if(style==='body')return (body?9:0)+((def.bodyDamage??1)-1)*1.7+dps*.12;
  if(style==='ranger')return (def.speed??1)*1.7+(def.life??2)*.55+(def.damage??1)*.5+(drone?-.5:0);
  if(style==='mobile')return (def.recoil??1)*1.2+(def.speed??1)*.5+(def.reload?1/def.reload:1)*.45+dps*.22;
  return dps*.85+(drone?1.2:0)+(def.guns.length>2?.45:0);
}
function chooseClass(next,b,random){
  if(b.difficulty==='easy')return next[Math.floor(random()*next.length)];
  const scored=next.map(id=>{
    const def=classes[id],raw=styleScore(def,b.style,b);
    const noise=(random()-.5)*(b.difficulty==='medium'?2.8:.75);
    return {id,score:raw+noise};
  });
  return scored.reduce((best,item)=>item.score>best.score?item:best,scored[0]).id;
}
function statWeights(b){
  const body=b.style==='body'||BODY_CLASSES.has(b.tankClass);
  const hurt=b.hp/b.maxHp<.42,early=b.level<15;
  if(body)return {body:10,health:hurt?11:8,regen:hurt?10:6,speed:7,damage:3,reload:2,bulletHealth:1,bulletPenetration:1,bulletSpeed:0};
  const weights=b.style==='ranger'?{damage:8,reload:7,bulletSpeed:8,bulletHealth:7,bulletPenetration:6,speed:5,health:4,regen:3,body:1}
    :b.style==='mobile'?{speed:9,reload:8,damage:6,bulletHealth:5,bulletPenetration:5,health:5,regen:4,bulletSpeed:4,body:2}
    :{damage:8,reload:7,bulletHealth:7,bulletPenetration:6,bulletSpeed:6,speed:5,health:5,regen:4,body:2};
  if(hurt){weights.health+=b.difficulty==='hard'?8:6;weights.regen+=6}
  if(early){weights.damage+=2;weights.reload+=1;weights.health+=1}
  if(b.style==='ranger'&&b.level>=15)weights.bulletSpeed+=2;
  return weights;
}
function chooseUpgrade(b,random){
  const weights=statWeights(b),available=Object.keys(b.ranks).filter(k=>b.ranks[k]<MAX_STAT_LEVEL&&!(b.style==='body'&&k==='bulletSpeed'));
  if(!available.length)return null;
  if(b.difficulty==='easy'&&random()<.30)return available[Math.floor(random()*available.length)];
  const scored=available.map(key=>({key,score:(weights[key]??0)-b.ranks[key]*.38+(random()-.5)*(b.difficulty==='hard'?.22:b.difficulty==='medium'?1.15:2.2)}));
  return scored.reduce((best,item)=>item.score>best.score?item:best,scored[0]).key;
}
export function gainBot(b,amount,random=Math.random){
  if(!b||b.hp<=0)return;
  b.score+=amount;if(b.level<MAX_LEVEL)b.xp+=amount*(b.xpMultiplier??1);
  while(b.level<MAX_LEVEL&&b.xp>=xpNeeded(b.level)){b.xp-=xpNeeded(b.level);b.level++;b.points+=skillPointsForLevel(b.level)}
  if(b.level===MAX_LEVEL)b.xp=0;
  while(b.points>0){
    const key=chooseUpgrade(b,random);if(!key)break;
    const oldMax=b.maxHp;b.ranks[key]++;b.points--;b.spent++;botStats(b);b.hp+=b.maxHp-oldMax;
  }
  // Follow the full unlocked tree, choosing tanks that match the bot's plan.
  // Easy bots use a rough random pick; medium and hard compare each choice.
  while(availableClassIds(b.tankClass,b.level).length){
    const next=availableClassIds(b.tankClass,b.level);
    // A body-damage bot keeps the Basic branch open so it can choose Smasher
    // when that class becomes available at level 30.
    if(b.style==='body'&&b.tankClass==='basic'&&b.level<30)break;
    b.tankClass=chooseClass(next,b,random);
  }
  botStats(b);
}
function power(unit){return (unit.level??1)*2.4+(unit.hp/(unit.maxHp??100))*5+(unit.damage??10)*.07+(unit.bodyDamage??12)*.04}
function centerPoint(world){return {x:world.w/2,y:world.h/2}}
export function steerBot(b,player,bots,shapes,dt,time,world,random=Math.random,bullets=[]){
  b.cool-=dt;b.hit=Math.max(0,b.hit-dt);b.think-=dt;
  if(time-b.lastDamage>=5)b.hp=Math.min(b.maxHp,b.hp+b.regen*dt);
  if(b.think<=0){
    const ai=AI[b.difficulty]??AI.easy;
    b.think=ai.thinkMin+random()*ai.thinkRange;b.aimError=(random()-.5)*ai.aimError;
    const foes=[player,...bots].filter(t=>t!==b&&t.hp>0&&t.alive!==false);
    const ranked=foes.map(t=>({t,d:Math.hypot(t.x-b.x,t.y-b.y)})).sort((a,c)=>a.d-c.d);
    const nearest=ranked[0],opponentPower=nearest?power(nearest.t):0,ownPower=power(b);
    const playerLow=player?.alive!==false&&player?.hp>0&&player.hp/(player.maxHp??100)<.26;
    const shielded=nearest?.t===player&&time<(player.shieldUntil??-1);
    const farStronger=nearest?.t===player&&opponentPower>ownPower+9;
    const healthRatio=b.hp/b.maxHp;
    // A stronger player is still a valid target when the bot has room and HP
    // to harass safely. At close range or low HP the bot disengages instead.
    const cautiousAttack=farStronger&&!playerLow&&healthRatio>ai.retreatHp+.16&&nearest.d>=230&&nearest.d<ai.threatRange;
    const fleeStrong=farStronger&&!playerLow&&!cautiousAttack;
    const eligibleFight=nearest&&!shielded&&nearest.d<ai.threatRange&&(
      fleeStrong?false:cautiousAttack?true:
      (b.level>=12||nearest.d<260||playerLow||opponentPower<ownPower-7)
    );
    const canFightWeaker=eligibleFight&&nearest.t!==player&&nearest.d<ai.threatRange*.8;
    const hpAdvantage=nearest?.t===player&&(b.difficulty==='medium'||b.difficulty==='hard')&&player?.alive!==false&&player?.hp>0&&player.hp<b.hp;
    const lowHealth=healthRatio<ai.retreatHp&&!hpAdvantage;
    const botDef=classes[b.tankClass],nearThreat=nearest&&nearest.d<ai.threatRange*.65;
    b.fleeingStrong=!!fleeStrong;
    b.retreat=lowHealth||!!fleeStrong;
    b.hiding=!!botDef.cloak&&lowHealth&&!nearThreat;
    let target=null;
    if(fleeStrong||lowHealth&&nearest&&!shielded&&nearest.d<ai.threatRange){target=nearest.t}
    else if(eligibleFight&&(!lowHealth||playerLow||canFightWeaker))target=nearest.t;
    if(!target&&ai.memory&&b.memoryTarget?.until>time)target={...b.memoryTarget,hp:1,memory:true};
    if(b.hiding)target=null;
    if(!target&&!b.retreat){
      let best=Infinity;
      for(const s of shapes){
        if(s.hp<=0)continue;
        const d=Math.hypot(s.x-b.x,s.y-b.y),travel=d/Math.max(100,b.speed),damageRate=b.damage*(classes[b.tankClass].damage??1)/Math.max(.2,b.reload*(classes[b.tankClass].reload??1));
        const killTime=s.hp/Math.max(1,damageRate),danger=ai.dodgeChance?foes.reduce((sum,f)=>sum+Math.max(0,480-Math.hypot(s.x-f.x,s.y-f.y))*.003,0):0;
        if(d>ai.chaseLimit+Math.min(600,b.level*5))continue;
        const efficiency=travel+killTime+danger-Math.log2(Math.max(1,s.reward))*0.62;
        if(efficiency<best){best=efficiency;target=s}
      }
    }
    if(target&&!target.type&&!target.memory)b.memoryTarget={x:target.x,y:target.y,until:time+ai.memory};
    b.target=target;
    let mx=0,my=0;
    if(target){
      let dx=target.x-b.x,dy=target.y-b.y,d=Math.max(1,Math.hypot(dx,dy));
      if(fleeStrong){dx=-dx;dy=-dy}
      else if(!target.type&&!target.memory&&ai.lead){const velocity=targetVelocity(target),def=classes[b.tankClass],shotSpeed=b.bulletSpeed*(def.speed??1),lead=Math.min(b.difficulty==='hard'?.9:.45,d/Math.max(1,shotSpeed))*ai.lead;dx=target.x+velocity.x*lead-b.x;dy=target.y+velocity.y*lead-b.y;d=Math.max(1,Math.hypot(target.x-b.x,target.y-b.y))}
      b.aim=fleeStrong?Math.atan2(target.y-b.y,target.x-b.x):Math.atan2(dy,dx)+b.aimError;
      const preferred=target.type?180+target.r:(cautiousAttack?520:['sniper','assassin','ranger'].includes(b.tankClass)?520:350),approach=fleeStrong||b.retreat?-1:cautiousAttack?(d>preferred+80?.35:d<preferred-70?-.8:0):d>preferred+60?1:d<preferred-65?-.7:0,directX=(target.x-b.x)/d,directY=(target.y-b.y)/d;
      mx=directX*approach;my=directY*approach;
      if(!target.type&&!b.retreat){mx+=-directY*ai.strafe*b.strafe;my+=directX*ai.strafe*b.strafe}
    }else if(b.hiding){mx=0;my=0}
    else{b.wander+=(random()-.5)*.7;mx=Math.cos(b.wander)*.45;my=Math.sin(b.wander)*.45;b.aim=b.wander}
    // Higher-level bots gradually travel toward the richer central region.
    const powerLead=ranked.length?Math.max(0,ownPower-Math.min(...ranked.map(enemy=>power(enemy.t))))/30:0;
    const strength=Math.max(0,(b.level-12)/33,powerLead),center=centerPoint(world),centerDx=center.x-b.x,centerDy=center.y-b.y,centerDistance=Math.max(1,Math.hypot(centerDx,centerDy));
    const centerPull=((b.level>=20||powerLead>.35)&&!b.retreat)?strength*(b.difficulty==='hard'?.68:b.difficulty==='medium'?.48:.30):0;
    if(centerPull){mx+=centerDx/centerDistance*centerPull;my+=centerDy/centerDistance*centerPull}
    b.dodging=false;
    if(ai.dodgeChance)for(const shot of bullets){
      if(shot.life<=0||shot.owner===b.id||random()>ai.dodgeChance)continue;
      const speed2=shot.vx*shot.vx+shot.vy*shot.vy;if(speed2<1)continue;
      const rx=b.x-shot.x,ry=b.y-shot.y,t=clamp((rx*shot.vx+ry*shot.vy)/speed2,0,ai.dodgeHorizon);if(t<=0)continue;
      let ax=b.x-(shot.x+shot.vx*t),ay=b.y-(shot.y+shot.vy*t),distance=Math.hypot(ax,ay),safe=b.r+(shot.r??5)+(b.difficulty==='hard'?72:48);
      if(distance>=safe)continue;if(distance<1){ax=-shot.vy*b.strafe;ay=shot.vx*b.strafe;distance=Math.hypot(ax,ay)}
      const force=(safe-distance)/safe*ai.dodgeWeight*(1-t/ai.dodgeHorizon+.35);mx+=ax/distance*force;my+=ay/distance*force;b.dodging=true;
    }
    if(b.difficulty==='hard'&&b.retreat&&target&&!target.type&&!target.memory){
      let cover=null,coverScore=Infinity;
      for(const s of shapes){if(s.hp<=0)continue;const bd=Math.hypot(s.x-b.x),td=Math.hypot(s.x-target.x);if(bd<430&&td<Math.hypot(target.x-b.x)&&bd<coverScore){cover=s;coverScore=bd}}
      if(cover){const dx=cover.x-target.x,dy=cover.y-target.y,d=Math.max(1,Math.hypot(dx,dy)),goalX=cover.x+dx/d*(cover.r+b.r+30),goalY=cover.y+dy/d*(cover.r+b.r+30),gd=Math.max(1,Math.hypot(goalX-b.x,goalY-b.y));mx+=(goalX-b.x)/gd*.8;my+=(goalY-b.y)/gd*.8}
    }
    for(const s of shapes){const dx=b.x-s.x,dy=b.y-s.y,d=Math.max(1,Math.hypot(dx,dy)),safe=b.r+s.r+90;if(s.hp>0&&d<safe){mx+=dx/d*(safe-d)/55;my+=dy/d*(safe-d)/55}}
    const margin=220;if(b.x<margin)mx+=(margin-b.x)/100;if(b.x>world.w-margin)mx-=(b.x-world.w+margin)/100;if(b.y<margin)my+=(margin-b.y)/100;if(b.y>world.h-margin)my-=(b.y-world.h+margin)/100;
    const length=Math.max(1,Math.hypot(mx,my));b.moveX=mx/length;b.moveY=my/length;
  }
  const delta=Math.atan2(Math.sin((b.aim??b.wander)-b.angle),Math.cos((b.aim??b.wander)-b.angle));
  b.angle+=Math.max(-2.8*dt,Math.min(2.8*dt,delta));b.x+=b.moveX*b.speed*dt;b.y+=b.moveY*b.speed*dt;
  const def=classes[b.tankClass],range=b.bulletSpeed*(def.speed??1)*(def.life??2)*.85;
  return !b.hiding&&b.target?.hp>0&&!(b.target===player&&time<(player.shieldUntil??-1))&&Math.hypot(b.target.x-b.x,b.target.y-b.y)<range&&Math.abs(delta)<.24&&b.cool<=0;
}
