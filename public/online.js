// A room is owned by the server. The client sends controls, never damage,
// coordinates, XP or scores. One request at a time avoids reorder races.
export class OnlineArena {
  constructor({input,onState,onStatus}){this.input=input;this.onState=onState;this.onStatus=onStatus;this.running=false;this.queue=[];this.seq=0;this.commandId=0;this.revision=-1;this.generation=0;this.rtt=0}
  async request(action,extra={}){
    const controller=new AbortController();this.controller=controller;
    const timeout=setTimeout(()=>controller.abort(),5000),started=performance.now();
    try{
      const response=await fetch('/api/arena',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.token},body:JSON.stringify({action,code:this.code,...extra}),signal:controller.signal,cache:'no-store'});
      const body=await response.json();
      if(!response.ok){const error=new Error(body.error||'Nie udało się połączyć z areną.');error.status=response.status;throw error}
      this.rtt=Math.round(performance.now()-started);return body;
    }finally{clearTimeout(timeout)}
  }
  async join(code,name){
    this.code=code||'ARENA';this.token=crypto.randomUUID()+crypto.randomUUID();
    const generation=++this.generation;
    const packet=await this.request('join',{name});
    if(generation!==this.generation)return null;
    this.id=packet.self.id;this.running=true;this.accept(packet);this.onStatus('connected');
    this.timer=setTimeout(()=>this.poll(generation),100);return packet;
  }
  accept(packet){
    if(packet.revision<this.revision)return;
    this.revision=packet.revision;
    this.queue=this.queue.filter(c=>c.id>(packet.self?.command??0));
    this.onState(packet,this.rtt);
  }
  async poll(generation){
    if(!this.running||generation!==this.generation)return;
    const started=performance.now();let delay=100;
    try{
      const packet=await this.request('step',{seq:++this.seq,input:this.input(),command:this.queue[0]});
      if(!this.running||generation!==this.generation)return;
      this.failures=0;this.accept(packet);this.onStatus('connected');
      delay=Math.max(20,100-(performance.now()-started));
    }catch(error){
      if(!this.running||generation!==this.generation)return;
      if([400,401,403,410].includes(error.status)){this.running=false;this.onStatus('closed',error.message);return}
      this.failures=(this.failures||0)+1;this.onStatus('reconnecting','Utracono połączenie — próbuję ponownie…');delay=Math.min(2000,250*this.failures);
    }
    this.timer=setTimeout(()=>this.poll(generation),delay);
  }
  command(kind,value){if(this.running&&this.queue.length<16)this.queue.push({id:++this.commandId,kind,value})}
  leave(){
    const wasRunning=this.running;this.running=false;++this.generation;clearTimeout(this.timer);this.controller?.abort();
    if(wasRunning)fetch('/api/arena',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.token},body:JSON.stringify({action:'leave',code:this.code}),keepalive:true}).catch(()=>{});
  }
}
