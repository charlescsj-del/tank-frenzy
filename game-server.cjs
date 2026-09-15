'use strict';
const {randomUUID}=require('node:crypto');
const F=require('./shared.js');
const {generateMap}=require('./map-generator.cjs');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function hitRect(x,y,r,w){return (x-clamp(x,w.x,w.x+w.w))**2+(y-clamp(y,w.y,w.y+w.h))**2<r*r;}
// First contact along a relative motion segment, as a fraction of one tick.
function contactTime(x,y,dx,dy,r){
  const c=x*x+y*y-r*r;if(c<=0)return 0;
  const a=dx*dx+dy*dy,b=2*(x*dx+y*dy),d=b*b-4*a*c;
  if(a===0||b>=0||d<0)return null;
  const t=(-b-Math.sqrt(d))/(2*a);return t>=0&&t<=1?t:null;
}
const neutral=()=>({x:0,y:0,aimX:F.width/2,aimY:F.height/2,fire:false});
class Room {
  constructor(code){this.code=code;this.map=generateMap();this.players=new Map();this.shells=[];this.events=[];this.time=0;this.eventId=0;this.shellId=0;this.winner=null;this.restartAt=0;}
  emit(type,data){this.events.push({id:++this.eventId,type,...data});}
  add(name){
    if(this.players.size>=F.maxPlayers)return null;
    const slot=Array.from({length:F.maxPlayers},(_,i)=>i).find(i=>![...this.players.values()].some(p=>p.slot===i));
    const p={id:randomUUID(),slot,name:name||F.palette[slot].name,x:0,y:0,a:0,aim:0,hp:5,kills:0,deaths:0,cool:0,respawnAt:0,shieldUntil:0,connected:true,disconnectedAt:0,input:neutral(),lastInput:this.time,seq:-1,life:0};
    this.players.set(p.id,p);this.spawn(p);return p;
  }
  spawn(p){
    const others=[...this.players.values()].filter(t=>t!==p&&t.connected&&t.hp>0);
    const choices=this.map.spawns.map((xy,i)=>({xy,score:others.length?Math.min(...others.map(t=>Math.hypot(t.x-xy[0],t.y-xy[1]))):i===p.slot?1:0})).sort((a,b)=>b.score-a.score);
    const free=choices.find(c=>!others.some(t=>Math.hypot(t.x-c.xy[0],t.y-c.xy[1])<55));
    if(!free){p.hp=0;p.respawnAt=this.time+.5;return;}
    [p.x,p.y]=free.xy;p.hp=5;p.life++;p.respawnAt=0;p.cool=.3;p.shieldUntil=this.time+2;p.input=neutral();p.pendingShot=false;p.a=p.x<F.width/2?0:Math.PI;p.aim=p.a;
  }
  setInput(p,m){
    if(!Number.isSafeInteger(m.seq)||m.seq<=p.seq||!Number.isFinite(m.x)||!Number.isFinite(m.y)||!Number.isFinite(m.aimX)||!Number.isFinite(m.aimY)||typeof m.fire!=='boolean')return;
    p.seq=m.seq;p.lastInput=this.time;
    if(m.fire&&!p.input.fire&&p.hp>0)p.pendingShot=true;
    p.input={x:clamp(m.x,-1,1),y:clamp(m.y,-1,1),aimX:clamp(m.aimX,-200,F.width+200),aimY:clamp(m.aimY,-200,F.height+200),fire:m.fire};
  }
  disconnect(p){p.connected=false;p.disconnectedAt=this.time;p.input=neutral();p.pendingShot=false;}
  blocked(x,y,p){return x<26||x>F.width-26||y<26||y>F.height-26||this.map.walls.some(w=>hitRect(x,y,26,w))||[...this.players.values()].some(t=>t!==p&&t.connected&&t.hp>0&&Math.hypot(x-t.x,y-t.y)<50);}
  fire(p){
    if(p.cool>0)return;p.cool=F.fireCooldown;p.shieldUntil=0;
    const dx=Math.cos(p.aim),dy=Math.sin(p.aim);let x=p.x,y=p.y;
    // If the barrel intersects cover, start at its last clear point. The normal
    // collision step then produces a ricochet instead of deleting the shot.
    for(let d=1;d<=38;d++){
      const nx=p.x+dx*d,ny=p.y+dy*d;
      if(nx<5||nx>F.width-5||ny<5||ny>F.height-5||this.map.walls.some(w=>hitRect(nx,ny,5,w)))break;
      x=nx;y=ny;
    }
    this.emit('shot',{x,y,slot:p.slot,player:p.id});
    const life=Math.hypot(F.width,F.height)/F.shellSpeed+2;
    this.shells.push({id:++this.shellId,x,y,vx:dx*F.shellSpeed,vy:dy*F.shellSpeed,owner:p.id,slot:p.slot,life,bounces:0});
  }
  step(dt){
    this.time+=dt;
    for(const p of this.players.values())if(!p.connected&&this.time-p.disconnectedAt>15)this.players.delete(p.id);
    if(this.winner){if(this.time>=this.restartAt){this.winner=null;this.shells=[];this.map=generateMap();for(const p of this.players.values()){p.kills=0;p.deaths=0;this.spawn(p);}this.emit('restart',{});}return;}
    for(const p of this.players.values()){
      if(!p.connected)continue;
      if(p.hp<=0){if(this.time>=p.respawnAt)this.spawn(p);continue;}
      p.cool=Math.max(0,p.cool-dt);
      if(this.time-p.lastInput>.5){p.input=neutral();p.pendingShot=false;}
      const input=p.input;p.aim=Math.atan2(input.aimY-p.y,input.aimX-p.x);
      let dx=input.x,dy=input.y;
      const length=Math.hypot(dx,dy);
      if(length){dx=dx/length*170*dt;dy=dy/length*170*dt;p.a=Math.atan2(dy,dx);if(!this.blocked(p.x+dx,p.y,p))p.x+=dx;if(!this.blocked(p.x,p.y+dy,p))p.y+=dy;}
      if(input.fire||p.pendingShot){this.fire(p);p.pendingShot=false;}
    }
    const paths=new Map();
    for(const s of this.shells){
      const start={x:s.x,y:s.y};
      s.life-=dt;const nx=s.x+s.vx*dt,ny=s.y+s.vy*dt;let bx=nx<5||nx>F.width-5,by=ny<5||ny>F.height-5;
      if(s.life<=0)continue;
      for(const w of this.map.walls)if(hitRect(nx,ny,5,w)){let hx=hitRect(nx,s.y,5,w),hy=hitRect(s.x,ny,5,w);if(!hx&&!hy){hx=true;hy=true;}bx||=hx;by||=hy;}
      if(bx||by){if(bx)s.vx*=-1;if(by)s.vy*=-1;s.bounces++;this.emit('bounce',{x:s.x,y:s.y,slot:s.slot});}else{s.x=nx;s.y=ny;}
      if(s.bounces>6)s.life=0;
      if(s.life>0)paths.set(s,{...start,dx:s.x-start.x,dy:s.y-start.y});
    }
    const active=[...paths.keys()],contacts=[];
    for(let i=0;i<active.length;i++){
      const s=active[i],a=paths.get(s);
      for(let j=i+1;j<active.length;j++){
        const other=active[j];if(s.owner===other.owner)continue;
        const b=paths.get(other),time=contactTime(a.x-b.x,a.y-b.y,a.dx-b.dx,a.dy-b.dy,10);
        if(time!==null)contacts.push({time,s,other});
      }
      for(const p of this.players.values()){
        if(!p.connected||p.hp<=0||p.id===s.owner||p.shieldUntil>this.time)continue;
        const time=contactTime(a.x-p.x,a.y-p.y,a.dx,a.dy,26);
        if(time!==null)contacts.push({time,s,p});
      }
    }
    // Resolve the earliest impact first so an intercepted shell cannot also hit a tank.
    contacts.sort((a,b)=>a.time-b.time||Number(!!b.other)-Number(!!a.other));
    for(const {time,s,other,p} of contacts){
      if(s.life<=0)continue;
      if(other){
        if(other.life<=0)continue;
        const a=paths.get(s),b=paths.get(other);
        s.life=0;other.life=0;
        this.emit('shell-clash',{x:(a.x+a.dx*time+b.x+b.dx*time)/2,y:(a.y+a.dy*time+b.y+b.dy*time)/2,slot:s.slot,otherSlot:other.slot});
      }else{
        if(p.hp<=0)continue;
        s.life=0;p.hp--;const dead=p.hp===0;this.emit(dead?'destroyed':'hit',{x:p.x,y:p.y,slot:p.slot,player:p.id});
        if(dead){p.deaths++;p.respawnAt=this.time+3;p.input=neutral();const attacker=this.players.get(s.owner);if(attacker){attacker.kills++;if(attacker.kills>=F.targetScore){this.winner={id:attacker.id,name:attacker.name};this.restartAt=this.time+10;}}}
      }
      if(this.winner)break;
    }
    this.shells=this.shells.filter(s=>s.life>0);
  }
  snapshot(){return {type:'state',room:this.code,map:this.map,time:this.time,winner:this.winner,restartIn:Math.max(0,this.restartAt-this.time),players:[...this.players.values()].map(({id,slot,name,x,y,a,aim,hp,kills,deaths,connected,respawnAt,shieldUntil,life})=>({id,slot,name,x,y,a,aim,hp,kills,deaths,connected,respawnIn:Math.max(0,respawnAt-this.time),shield:shieldUntil>this.time,life})),shells:this.shells,events:this.events};}
}
module.exports={Room,hitRect};
