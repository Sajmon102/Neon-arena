import {createArena,advance,addPlayer,setInput,command,snapshot,MAX_PLAYERS} from './simulation.js';

export class ArenaError extends Error { constructor(status,message){super(message);this.status=status} }
const arenaLocks=new Map();
export async function tokenDigest(token){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),n=>n.toString(16).padStart(2,'0')).join('')}
export async function handleArena(db,data,token,now){
  const code=String(data.code||'ARENA').trim().toUpperCase();
  const previous=arenaLocks.get(code)??Promise.resolve();
  let release;const queued=new Promise(resolve=>{release=resolve});arenaLocks.set(code,queued);
  await previous;
  try{return await handleArenaLocked(db,data,token,now??Date.now())}
  finally{release();if(arenaLocks.get(code)===queued)arenaLocks.delete(code)}
}
async function handleArenaLocked(db,data,token,now){
  if(!['join','step','leave'].includes(data.action))throw new ArenaError(400,'Nieznana akcja.');
  const code=String(data.code||'ARENA').trim().toUpperCase();
  if(!/^(ARENA|[A-Z0-9]{6})$/.test(code))throw new ArenaError(400,'Kod pokoju musi mieć 6 liter lub cyfr.');
  if(!/^[a-zA-Z0-9-]{32,100}$/.test(token))throw new ArenaError(401,'Nieprawidłowa sesja. Wróć do menu i dołącz ponownie.');
  const hash=await tokenDigest(token),id='p'+hash.slice(0,20);
  if(data.action==='join'){
    await db.prepare('DELETE FROM arenas WHERE updated_at < ?').bind(now-86400000).run();
    const existing=await db.prepare('SELECT code FROM arenas WHERE code = ?').bind(code).first();
    if(!existing){
      // Bounded room allocation in the same statement, including concurrent joins.
      const initial=JSON.stringify(createArena(now));
      await db.prepare('INSERT INTO arenas (code,state,revision,updated_at) SELECT ?,?,0,? WHERE (SELECT COUNT(*) FROM arenas) < 128 ON CONFLICT(code) DO NOTHING').bind(code,initial,now).run();
    }
  }
  for(let attempt=0;attempt<8;attempt++){
    const row=await db.prepare('SELECT state,revision FROM arenas WHERE code = ?').bind(code).first();
    if(!row)throw new ArenaError(data.action==='join'?503:410,data.action==='join'?'Wszystkie pokoje są teraz zajęte. Spróbuj za chwilę.':'Pokój wygasł. Dołącz ponownie.');
    const arena=JSON.parse(row.state);
    const existingPlayer=arena.players.find(p=>p.id===id&&p.tokenHash===hash);
    if(data.action==='step'&&existingPlayer&&now-existingPlayer.seen<60)return snapshot(arena,id,code,row.revision);
    advance(arena,now);
    let p=arena.players.find(p=>p.id===id&&p.tokenHash===hash);
    if(data.action==='join'){
      if(!p){
        if(arena.players.length>=MAX_PLAYERS)throw new ArenaError(409,'Ten pokój jest pełny (8 graczy). Wpisz inny kod.');
        const name=String(data.name||'Gracz').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,16)||'Gracz';
        p=addPlayer(arena,id,hash,name,now);
      }else p.seen=now;
    }else if(data.action==='leave'){
      arena.players=arena.players.filter(t=>t.id!==id);arena.bullets=arena.bullets.filter(b=>b.owner!==id);
    }else{
      if(!p)throw new ArenaError(410,'Połączenie wygasło. Wróć do menu i dołącz ponownie.');
      // Inputs/commands are monotonic and idempotent across HTTP retries.
      setInput(p,data,now);p=command(arena,p,data.command,now);
    }
    const updated=await db.prepare('UPDATE arenas SET state = ?, revision = revision + 1, updated_at = ? WHERE code = ? AND revision = ?')
      .bind(JSON.stringify(arena),now,code,row.revision).run();
    if(updated.meta.changes===1)return snapshot(arena,id,code,row.revision+1);
    // A different player won the optimistic lock. Read its committed world and
    // replay only this input, never overwrite somebody else's shot or upgrade.
  }
  throw new ArenaError(503,'Arena jest chwilowo zajęta. Ponawiam połączenie…');
}
