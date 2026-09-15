'use strict';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');
const W=FIELD.width,H=FIELD.height,boardScale=FIELD.viewScale,colors=FIELD.palette.map(p=>p.body);
const shellColors=FIELD.palette.map(p=>({body:p.bullet,glow:p.bullet,trail:p.bullet+'a0',rim:'#374332'}));
let walls=FIELD.walls,spawns=FIELD.spawns,mapId=null;
const keys=new Set(),moveKeys=new Set(['KeyW','KeyA','KeyS','KeyD']);
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const touchMedia=matchMedia('(pointer: coarse) and (hover: none)');
const sticks={move:{id:null,x:0,y:0},aim:{id:null,x:0,y:0}};
let touchAim=null,expanded=false,mapOverview=false;
let cssW=1120,cssH=610,scale=1,offsetX=0,offsetY=0;
let tanks=[],shells=[],particles=[],tracks=[],shake=0,last=0,sound=true,audioReady=false,audioContext;
let socket=null,myId=null,token=null,joined=false,connecting=false,intentional=false,retry=0,retryTimer;
let latest=null,lastEvent=0,seq=0,rosterSignature='',pointer={x:500,y:330,active:false},firing=false,lastSnapshot=0;
let roomCode=(new URL(location.href).searchParams.get('room')||'QUARRY').toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,16)||'QUARRY',networkBase=location.origin;
$('roomInput').value=roomCode;$('roomCode').textContent=roomCode;
function status(text){$('status').textContent=text;}
function networkMessage(title,text,form=false){
  $('overlay').classList.remove('hidden');$('dialogTitle').textContent=title;$('dialogText').textContent=text;
  $('joinFields').hidden=!form;$('action').hidden=!form;$('action').disabled=false;
}
function send(data){if(socket?.readyState===WebSocket.OPEN&&socket.bufferedAmount<32768)socket.send(JSON.stringify(data));}
function sendInput(){
  if(!joined)return;
  const me=tanks.find(t=>t.id===myId);
  const aim=touchAim?{x:(me?.x??500)+touchAim.x*150,y:(me?.y??330)+touchAim.y*150}:pointer.active?pointer:{x:(me?.x??500)+Math.cos(me?.aim||0)*150,y:(me?.y??330)+Math.sin(me?.aim||0)*150};
  send({type:'input',seq:++seq,x:Math.max(-1,Math.min(1,sticks.move.x+Number(keys.has('KeyD'))-Number(keys.has('KeyA')))),y:Math.max(-1,Math.min(1,sticks.move.y+Number(keys.has('KeyS'))-Number(keys.has('KeyW')))),aimX:aim.x,aimY:aim.y,fire:firing||Math.hypot(sticks.aim.x,sticks.aim.y)>0});
}
function release(){keys.clear();firing=false;for(const name of ['move','aim'])resetStick(name);stopMovementSound();sendInput();}
function connect(){
  if(connecting||joined)return;
  intentional=false;connecting=true;clearTimeout(retryTimer);
  if(retry===0){roomCode=$('roomInput').value.toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,16)||'QUARRY';token=null;}
  $('roomCode').textContent=roomCode;updateInvite();
  networkMessage(retry?'Reconnecting...':'Joining the field...',retry?'Your tank is reserved briefly while the connection returns.':'Connecting you to room '+roomCode+'.');
  status('CONNECTING');$('latency').textContent='CONNECTING';
  const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws');socket=ws;
  const timeout=setTimeout(()=>{if(ws.readyState!==WebSocket.OPEN)ws.close();},7000);
  ws.addEventListener('open',()=>{clearTimeout(timeout);ws.send(JSON.stringify({type:'join',room:roomCode,name:$('callsign').value,token}));});
  ws.addEventListener('message',event=>{
    if(socket!==ws)return;
    let data;try{data=JSON.parse(event.data);}catch{return;}
    if(data.type==='welcome'){
      myId=data.id;token=data.token;seq=Math.max(seq,data.seq+1);joined=true;connecting=false;retry=0;lastEvent=0;rosterSignature='';pointer.active=false;
      touchAim=null;$('overlay').classList.add('hidden');$('leave').hidden=false;updateTouchControls();canvas.focus({preventScroll:true});
      history.replaceState(null,'','?room='+encodeURIComponent(roomCode));sendInput();
    }else if(data.type==='state'){applySnapshot(data);}
    else if(data.type==='pong'){$('latency').textContent=Math.round(performance.now()-data.sent)+' MS';}
    else if(data.type==='error'){intentional=true;joined=false;connecting=false;networkMessage('Cannot join this room.',data.message,true);status('CHOOSE A ROOM');}
  });
  ws.addEventListener('error',()=>{});
  ws.addEventListener('close',()=>{
    clearTimeout(timeout);if(socket!==ws)return;
    joined=false;connecting=false;release();updateTouchControls();$('latency').textContent='OFFLINE';
    if(intentional)return;
    status('CONNECTION LOST');
    if(++retry<=8){networkMessage('Reconnecting...','The connection dropped. Retrying automatically.');retryTimer=setTimeout(connect,Math.min(800*retry,4000));}
    else{retry=0;networkMessage('Server unavailable.','Start the game server on the host, then join again.',true);}
  });
}
function leave(){
  intentional=true;clearTimeout(retryTimer);release();send({type:'leave'});socket?.close();socket=null;joined=false;connecting=false;myId=null;token=null;retry=0;
  latest=null;tanks=[];shells=[];tracks=[];$('leave').hidden=true;$('respawn').textContent='';$('latency').textContent='OFFLINE';$('roster').replaceChildren();
  touchAim=null;updateTouchControls();
  $('roomCount').textContent='0 / 4 PLAYERS';networkMessage('Join the field.','Pick a room code and bring your rivals.',true);status('READY TO CONNECT');
}
function applySnapshot(data){
  latest=data;lastSnapshot=performance.now();
  if(data.map&&data.map.id!==mapId){mapId=data.map.id;walls=data.map.walls;spawns=data.map.spawns;tracks=[];particles=[];shells=[];$('mapLabel').textContent='RANDOM MAP / '+mapId.toString(16).toUpperCase();}
  const previous=new Map(tanks.map(t=>[t.id,t]));
  tanks=data.players.filter(p=>p.connected).map(p=>{
    const before=previous.get(p.id);
    return {...p,x:before&&before.life===p.life?before.x:p.x,y:before&&before.life===p.life?before.y:p.y,
      targetX:p.x,targetY:p.y,recoil:before?.recoil||0,flash:before?.flash||0,track:before?.track||0};
  });
  const oldShells=new Map(shells.map(s=>[s.id,s]));
  shells=data.shells.map(s=>({...s,trail:oldShells.get(s.id)?.trail||[]}));
  for(const e of data.events){if(e.id<=lastEvent)continue;lastEvent=e.id;
    if(e.type==='shot'){const t=tanks.find(t=>t.id===e.player);if(t)t.recoil=5;burst(e.x,e.y,22,shellColors[e.slot].glow,5);playShotSound(e);}
    if(e.type==='bounce'){burst(e.x,e.y,22,shellColors[e.slot].glow,4);beep(850,.09,'sine',.025);}
    if(e.type==='hit'||e.type==='destroyed'){const dead=e.type==='destroyed',t=tanks.find(t=>t.id===e.player);if(t)t.flash=.16;burst(e.x,e.y,22,dead?'#ffbc6c':colors[e.slot],dead?40:14);beep(dead?75:100,.22,'sawtooth',.045);rumble(dead?.65:.18,dead?.14:.07,dead?650:1800);if(e.player===myId)shake=reducedMotion?0:4;}
    if(e.type==='restart'){tracks=[];particles=[];}
  }
  updateHud(data);
}
function updateHud(data){
  const count=data.players.filter(p=>p.connected).length;
  $('roomCount').textContent=count+' / 4 PLAYERS';
  const signature=JSON.stringify(data.players.map(p=>[p.id,p.name,p.slot,p.hp,p.kills,p.deaths,p.connected]));
  if(signature!==rosterSignature){
    rosterSignature=signature;$('roster').replaceChildren();
    for(const p of [...data.players].sort((a,b)=>b.kills-a.kills||a.slot-b.slot)){
      const card=document.createElement('div');card.className='roster-card'+(p.id===myId?' me':'')+(!p.connected?' offline':'');card.style.setProperty('--tank',colors[p.slot]);
      const title=document.createElement('div');title.className='roster-name';title.textContent=p.name+(p.id===myId?' / YOU':'');
      const health=document.createElement('div');health.className='health';health.setAttribute('aria-label',p.hp+' health');
      for(let i=0;i<5;i++){const pip=document.createElement('span');pip.className='pip'+(i>=p.hp?' empty':'');health.append(pip);}
      const stats=document.createElement('div');stats.className='roster-stats';stats.textContent=p.connected?p.kills+' KILLS / '+p.deaths+' DEATHS':'RECONNECTING';
      card.append(title,health,stats);$('roster').append(card);
    }
  }
  const me=data.players.find(p=>p.id===myId);
  if(data.winner){$('respawn').textContent=data.winner.name+' wins! New match in '+Math.ceil(data.restartIn)+'s';status('MATCH COMPLETE');}
  else if(me?.hp<=0){$('respawn').textContent='Tank destroyed. Respawning in '+Math.ceil(me.respawnIn)+'s';status('REGROUPING');}
  else{$('respawn').textContent='';status(count<2?'PRACTICE / WAITING FOR PLAYER 2':'LIVE BATTLE / FIRST TO 10 KILLS');}
}
function updateInvite(){
  const invite=networkBase+'/?room='+encodeURIComponent(roomCode);
  const link=document.createElement('a');link.href=invite;link.textContent=invite;
  $('networkLinks').replaceChildren('Friends on the same Wi-Fi: ',link,document.createElement('br'),'Use room '+roomCode+'. Keep the host server running.');
  return invite;
}
fetch('/network-info').then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
  if(['localhost','127.0.0.1','[::1]'].includes(location.hostname))networkBase=data.urls.find(u=>u.startsWith('http://192.168.'))||data.urls[0]||location.origin;
  updateInvite();
}).catch(()=>{$('networkLinks').textContent='Start the network server with npm start, then open its address in each browser.';});
$('copy').addEventListener('click',async()=>{const invite=updateInvite();try{await navigator.clipboard.writeText(invite);$('copy').textContent='LINK COPIED';setTimeout(()=>$('copy').textContent='COPY INVITE',1800);}catch{$('networkNote').textContent='Invite link: '+invite;status('INVITE LINK SHOWN BELOW THE ARENA');}});
$('joinForm').addEventListener('submit',e=>{e.preventDefault();audioReady=true;beep(420,.16,'triangle',.045);connect();});
$('leave').addEventListener('click',leave);
$('sound').addEventListener('click',()=>{sound=!sound;audioReady=true;$('sound').textContent=sound?'SOUND ON':'SOUND OFF';$('sound').setAttribute('aria-pressed',String(sound));if(sound)beep(400,.12);else stopMovementSound();canvas.focus({preventScroll:true});});
function aimAt(e){
  if(e.pointerType==='touch')return;
  touchAim=null;
  const rect=canvas.getBoundingClientRect();
  pointer={...FIELD.unproject((e.clientX-rect.left-offsetX)/scale,(e.clientY-rect.top-offsetY)/scale,22),active:true};
}
canvas.addEventListener('pointermove',aimAt);
canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||e.button!==0||!joined)return;e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);aimAt(e);audioReady=true;firing=true;sendInput();});
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{firing=false;sendInput();});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',e=>{if(e.code==='Escape'){release();if(expanded)setExpanded(false);}if(!joined||e.target instanceof HTMLInputElement)return;if(moveKeys.has(e.code)){e.preventDefault();keys.add(e.code);if(!e.repeat)sendInput();}});
window.addEventListener('keyup',e=>{if(moveKeys.has(e.code)){keys.delete(e.code);sendInput();}});
window.addEventListener('blur',release);
document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
window.addEventListener('pagehide',()=>{release();send({type:'leave'});});

function resetStick(name){
  const stick=sticks[name],pad=$(name+'Stick'),id=stick.id;
  stick.id=null;stick.x=0;stick.y=0;
  pad.style.setProperty('--stick-x','0px');pad.style.setProperty('--stick-y','0px');
  if(id!==null&&pad.hasPointerCapture(id))pad.releasePointerCapture(id);
}
function updateStick(name,e){
  const stick=sticks[name],pad=$(name+'Stick'),rect=pad.getBoundingClientRect();
  const radius=rect.width*.32,dx=e.clientX-rect.left-rect.width/2,dy=e.clientY-rect.top-rect.height/2;
  const distance=Math.hypot(dx,dy),amount=Math.min(1,distance/radius);
  // A small dead zone prevents firing or drifting from resting thumbs.
  const power=amount<.2?0:(amount-.2)/.8;
  stick.x=distance?dx/distance*power:0;stick.y=distance?dy/distance*power:0;
  pad.style.setProperty('--stick-x',(distance?dx/distance*amount*radius:0)+'px');
  pad.style.setProperty('--stick-y',(distance?dy/distance*amount*radius:0)+'px');
  if(name==='aim'&&power){touchAim={x:dx/distance,y:dy/distance};pointer.active=false;}
}
for(const name of ['move','aim']){
  const pad=$(name+'Stick');
  pad.addEventListener('pointerdown',e=>{
    if(!touchMedia.matches||!joined||e.pointerType!=='touch'||sticks[name].id!==null)return;
    e.preventDefault();sticks[name].id=e.pointerId;pad.setPointerCapture(e.pointerId);audioReady=true;updateStick(name,e);sendInput();
  });
  pad.addEventListener('pointermove',e=>{if(sticks[name].id===e.pointerId){e.preventDefault();updateStick(name,e);}});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(type,e=>{
    if(sticks[name].id!==e.pointerId)return;
    resetStick(name);sendInput();
  });
  pad.addEventListener('contextmenu',e=>e.preventDefault());
}
function updateTouchControls(){
  const mobile=touchMedia.matches;
  $('arena').classList.toggle('mobile-active',mobile&&joined);
  document.body.classList.toggle('mobile-playing',mobile&&joined);
  $('viewMode').hidden=!mobile||!joined;
  $('thumbControls').hidden=!mobile||!joined;
  $('mobileHelp').hidden=!mobile;
  $('desktopHelp').hidden=mobile;
  $('introControls').textContent=mobile?'Left thumb to move. Right thumb to aim and fire.':'Move with WASD. Aim with your mouse. Click to fire.';
  $('networkNote').textContent=mobile?'LEFT THUMB / MOVE · RIGHT THUMB / AIM + FIRE':'WASD / MOVE · MOUSE / AIM · LEFT CLICK / FIRE';
  canvas.setAttribute('aria-label',mobile?'Tank arena. Use the left thumb control to move and the right thumb control to aim and fire.':'Tank arena. Use W A S D to move, point the mouse to aim, and hold left click to fire.');
}
touchMedia.addEventListener?.('change',()=>{release();updateTouchControls();});
updateTouchControls();
$('viewMode').addEventListener('click',()=>{
  release();mapOverview=!mapOverview;
  $('viewMode').textContent=mapOverview?'CLOSE VIEW':'FULL MAP';
  $('viewMode').setAttribute('aria-pressed',String(mapOverview));
  updateCamera();
});

function fullscreenElement(){return document.fullscreenElement||document.webkitFullscreenElement;}
function updateFullscreen(){
  const active=expanded||fullscreenElement()===$('arena');
  $('fullscreen').textContent=active?'EXIT FULL SCREEN':'FULL SCREEN';
  $('fullscreen').setAttribute('aria-pressed',String(active));
}
function setExpanded(value){
  expanded=value;
  $('arena').classList.toggle('expanded',value);
  document.body.classList.toggle('arena-expanded',value);
  $('viewNote').textContent=value?'Expanded view. Your browser does not allow true fullscreen here. Rotate your phone for a wider field.':'';
  updateFullscreen();
}
$('fullscreen').addEventListener('click',async()=>{
  release();
  if(expanded){setExpanded(false);return;}
  if(fullscreenElement()){
    try{await (document.exitFullscreen||document.webkitExitFullscreen).call(document);}catch{$('viewNote').textContent='Use your browser fullscreen control to exit.';}
    return;
  }
  const arena=$('arena'),request=arena.requestFullscreen||arena.webkitRequestFullscreen;
  if(request){
    try{await request.call(arena);$('viewNote').textContent='';updateFullscreen();return;}catch{/* Use an expanded browser view when fullscreen is unavailable. */}
  }
  setExpanded(true);
});
for(const type of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(type,()=>{release();updateFullscreen();});
window.addEventListener('resize',release);
setInterval(sendInput,1000/30);
setInterval(()=>{if(joined){send({type:'ping',sent:performance.now()});if(performance.now()-lastSnapshot>4000)socket?.close();}},2000);


let engine=null;
function playShotSound(event){
  if(event.player===myId)return;
  beep(160+event.slot*30,.15,'triangle',.065);rumble(.12,.065,1500);
}
function stopMovementSound(){
  if(!engine)return;
  const now=audioContext.currentTime;
  engine.gain.gain.cancelScheduledValues(now);
  engine.gain.gain.setValueAtTime(0,now);
}
function updateMovementSound(speed){
  if(!joined||!sound||!audioReady||document.hidden||latest?.winner||performance.now()-lastSnapshot>500||speed<5){stopMovementSound();return;}
  const ac=getAudio();if(!ac)return;
  if(!engine){
    const motor=ac.createOscillator(),tracks=ac.createOscillator(),filter=ac.createBiquadFilter(),gain=ac.createGain();
    motor.type='sawtooth';tracks.type='triangle';filter.type='lowpass';filter.frequency.value=220;
    gain.gain.value=0;motor.connect(filter);tracks.connect(filter);filter.connect(gain);gain.connect(ac.destination);
    motor.start();tracks.start();engine={motor,tracks,gain};
  }
  const throttle=Math.min(1,speed/170),now=ac.currentTime;
  engine.motor.frequency.setTargetAtTime(48+throttle*30,now,.08);
  engine.tracks.frequency.setTargetAtTime(23+throttle*15,now,.08);
  engine.gain.gain.setTargetAtTime(.012+throttle*.014,now,.05);
}

function audioUnavailable(){sound=false;$('sound').textContent='SOUND OFF';$('sound').setAttribute('aria-pressed','false');}
function getAudio(){if(!audioReady||!sound)return null;try{audioContext??=new (window.AudioContext||window.webkitAudioContext)();if(audioContext.state==='suspended')audioContext.resume().catch(audioUnavailable);return audioContext;}catch{audioUnavailable();return null;}}
function beep(freq,duration,type='sine',volume=.035){const ac=getAudio();if(!ac)return;const osc=ac.createOscillator(),gain=ac.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,ac.currentTime);osc.frequency.exponentialRampToValueAtTime(Math.max(30,freq*.3),ac.currentTime+duration);gain.gain.setValueAtTime(volume,ac.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ac.currentTime+duration);osc.connect(gain);gain.connect(ac.destination);osc.onended=()=>{osc.disconnect();gain.disconnect();};osc.start();osc.stop(ac.currentTime+duration);}
function rumble(duration,volume,frequency){const ac=getAudio();if(!ac)return;const buffer=ac.createBuffer(1,Math.ceil(ac.sampleRate*duration),ac.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;const source=ac.createBufferSource(),filter=ac.createBiquadFilter(),gain=ac.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.value=frequency;gain.gain.setValueAtTime(volume,ac.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ac.currentTime+duration);source.connect(filter);filter.connect(gain);gain.connect(ac.destination);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};source.start();source.stop(ac.currentTime+duration);}
function resize(){const rect=canvas.getBoundingClientRect();cssW=rect.width;cssH=rect.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(cssW*dpr);canvas.height=Math.round(cssH*dpr);updateCamera();}
function updateCamera(){
  const me=joined&&touchMedia.matches&&tanks.find(t=>t.id===myId);
  if(!me){
    scale=Math.min(cssW/1120,cssH/610);offsetX=(cssW-1120*scale)/2;offsetY=(cssH-610*scale)/2;
    return;
  }
  // Fit the board itself for overview, not the old presentation frame's empty margins.
  const margin=24,topLeft=project(0,0),bottomRight=project(W,H);
  const fit=Math.max(.01,Math.min((cssW-margin*2)/(W*boardScale),(cssH-margin*2)/(H*boardScale)));
  // At least 0.7 CSS pixels per world unit: a 48-unit tank is 34px wide.
  scale=mapOverview?fit:Math.max(fit,1.4,Math.min(cssW,cssH)/280);
  const focus=project(me.x,me.y);
  function axis(size,start,end,target,before=margin,after=margin){
    if((end-start)*scale<=size-before-after)return (size-(start+end)*scale)/2;
    return Math.max(size-after-end*scale,Math.min(before-start*scale,(size+before-after)/2-target*scale));
  }
  offsetX=axis(cssW,topLeft.x,bottomRight.x,focus.x);
  // Leave room for the top tools and bottom thumb pads near map boundaries.
  offsetY=axis(cssH,topLeft.y,bottomRight.y,focus.y,mapOverview?margin:64,mapOverview?margin:144);
}
function project(x,y,z=0){return FIELD.project(x,y,z);}
function poly(points,fill,stroke){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.8;ctx.stroke();}}
function line3(points,color,width=1){ctx.beginPath();points.forEach((p,i)=>{const s=project(...p);i?ctx.lineTo(s.x,s.y):ctx.moveTo(s.x,s.y)});ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function tint(hex,factor){const n=parseInt(hex.slice(1),16);return `rgb(${Math.min(255,Math.round((n>>16)*factor))},${Math.min(255,Math.round((n>>8&255)*factor))},${Math.min(255,Math.round((n&255)*factor))})`;}
function box(x,y,w,h,z,height,color,angle=0){const c=Math.cos(angle),s=Math.sin(angle);const verts=[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]].map(([a,b])=>[x+a*c-b*s,y+a*s+b*c]);const base=verts.map(p=>project(...p,z)),top=verts.map(p=>project(...p,z+height));const faces=[];for(let i=0;i<4;i++){const j=(i+1)%4;const cross=(top[j].x-top[i].x)*(base[j].y-top[j].y);if(cross>0)faces.push({pts:[top[i],top[j],base[j],base[i]],depth:(base[i].y+base[j].y)/2,shade:i%2?.68:.83});}faces.sort((a,b)=>a.depth-b.depth).forEach(f=>poly(f.pts,tint(color,f.shade)));poly(top,color,'#26332118');}
function shadow(x,y,rx,ry,opacity=.15){const p=project(x,y);ctx.save();ctx.translate(p.x+8,p.y+8);ctx.transform(boardScale,0,0,boardScale,0,0);ctx.fillStyle=`rgba(33,48,24,${opacity})`;ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.fill();ctx.restore();}
function burst(x,y,z,color,n){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,v=30+Math.random()*120;particles.push({x,y,z,vx:Math.cos(a)*v,vy:Math.sin(a)*v,vz:30+Math.random()*110,life:.3+Math.random()*.5,total:.8,color,r:1+Math.random()*3});}}
function updateEffects(dt){shake=Math.max(0,shake-15*dt);for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vz-=240*dt;if(p.z<0){p.z=0;p.vz*=-.3;}}particles=particles.filter(p=>p.life>0);}
function drawGround(){const bg=ctx.createLinearGradient(0,0,1120,610);bg.addColorStop(0,'#d6ddca');bg.addColorStop(1,'#b9c4a9');ctx.fillStyle=bg;ctx.fillRect(0,0,1120,610);shadow(W/2,H/2+25,W*.58,H*.59,.08);box(W/2,H/2,W+40,H+40,-27,20,'#7d896e');box(W/2,H/2,W+20,H+20,-7,7,'#aeba96');poly([[0,0],[W,0],[W,H],[0,H]].map(p=>project(...p)),'#bac6a5');for(let x=0;x<=W;x+=50)line3([[x,0],[x,H]],'#6b7e5413');for(let y=0;y<=H;y+=50)line3([[0,y],[W,y]],'#6b7e5413');
for(let i=0;i<90;i++){const x=(i*173+21)%W,y=(i*113+31)%H;const p=project(x,y);ctx.fillStyle=i%2?'#52653c15':'#f4f7db35';ctx.fillRect(p.x,p.y,2,1);}
for(const t of tracks){ctx.globalAlpha=t.life/9*.14;for(const side of [-1,1]){const x=t.x-Math.sin(t.a)*side*17,y=t.y+Math.cos(t.a)*side*17;box(x,y,9,6,0,.1,'#536246',t.a);}}ctx.globalAlpha=1;
for(const [x,y] of spawns){const pts=[];for(let a=0;a<=Math.PI*2+.01;a+=Math.PI/24)pts.push([x+Math.cos(a)*42,y+Math.sin(a)*42,.3]);line3(pts,'#65774c33',1);}
line3([[0,0,1],[W,0,1],[W,H,1],[0,H,1],[0,0,1]],'#edf1d9',2);for(let x=25;x<W;x+=50){line3([[x,0,1],[x,8,1]],'#53623d66',2);line3([[x,H,1],[x,H-8,1]],'#53623d66',2);}for(const [x,y] of [[0,0],[W,0],[0,H],[W,H]]){box(x,y,15,15,0,10,'#e1ddbb');}
const p=project(W/2,H,-24);ctx.save();ctx.translate(p.x,p.y+2);ctx.rotate(0);ctx.font='8px Consolas';ctx.fillStyle='#e3e9d6';ctx.fillText('Q U A R R Y  /  S E C T O R   0 1',-75,0);ctx.restore();}
function drawWall(w){poly([[w.x,w.y],[w.x+w.w,w.y],[w.x+w.w+25,w.y+w.h+24],[w.x+25,w.y+w.h+24]].map(p=>project(...p)),'#35472a22');box(w.x+w.w/2,w.y+w.h/2,w.w+4,w.h+4,0,5,'#788768');box(w.x+w.w/2,w.y+w.h/2,w.w,w.h,5,w.z-5,'#d2d5bd');box(w.x+w.w/2,w.y+w.h/2,w.w-7,w.h-7,w.z,2,'#dfe0ca');const horizontal=w.w>w.h;for(let i=1;i<3;i++){const x=w.x+w.w*i/3,y=w.y+w.h*i/3;line3(horizontal?[[x,w.y+4,w.z+2.1],[x,w.y+w.h-4,w.z+2.1]]:[[w.x+4,y,w.z+2.1],[w.x+w.w-4,y,w.z+2.1]],'#a7ad944d');}box(w.x+10,w.y+10,10,7,w.z+2,1,'#9d9f80');}
function drawShell(s){const color=shellColors[s.slot];if(s.trail.length){ctx.beginPath();s.trail.forEach((t,i)=>{const p=project(t.x,t.y,22);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});ctx.strokeStyle=color.trail;ctx.lineWidth=4;ctx.stroke();}const p=project(s.x,s.y,22);ctx.shadowColor=color.glow;ctx.shadowBlur=12;ctx.fillStyle=color.body;ctx.strokeStyle=color.rim;ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,4.5,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.shadowBlur=0;}
function draw(){const dpr=Math.min(devicePixelRatio||1,2);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#c6ceba';ctx.fillRect(0,0,cssW,cssH);ctx.translate(offsetX,offsetY);ctx.scale(scale,scale);ctx.save();if(shake)ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);drawGround();const objects=[...walls.map(w=>({depth:project(w.x+w.w/2,w.y+w.h/2).y,draw:()=>drawWall(w)})),...tanks.map(t=>({depth:project(t.x,t.y).y,draw:()=>drawTank(t)})),...shells.map(s=>({depth:project(s.x,s.y).y,draw:()=>drawShell(s)}))];objects.sort((a,b)=>a.depth-b.depth).forEach(o=>o.draw());for(const p of particles){const v=project(p.x,p.y,p.z);ctx.globalAlpha=Math.min(1,p.life/.2);ctx.fillStyle=p.color;ctx.fillRect(v.x,v.y,p.r,p.r);}ctx.globalAlpha=1;ctx.restore();}

function drawTank(t){
  if(t.hp<=0){shadow(t.x,t.y,35,30,.32);box(t.x,t.y,42,34,0,8,'#4d5243',t.a);return;}
  shadow(t.x,t.y,31,24,.25);
  if(t.id===myId||t.shield){
    const ring=[];for(let a=0;a<=Math.PI*2+.01;a+=Math.PI/24)ring.push([t.x+Math.cos(a)*35,t.y+Math.sin(a)*35,1]);
    line3(ring,t.shield?'#fcffe5bb':colors[t.slot],t.id===myId?2:1);
  }
  const local=(x,y,angle=t.a)=>[t.x+x*Math.cos(angle)-y*Math.sin(angle),t.y+x*Math.sin(angle)+y*Math.cos(angle)];
  for(const side of [-1,1]){
    let p=local(0,side*19);box(...p,48,12,2,11,'#454b3b',t.a);
    for(let i=-18;i<=18;i+=7){p=local(i,side*19);box(...p,3,12,13,1.5,'#717564',t.a);}
  }
  const color=t.flash>0?'#f6dfaf':colors[t.slot];
  box(t.x,t.y,45,31,10,12,color,t.a);
  let p=local(-13,0);box(...p,11,24,22,2,tint(color,.82),t.a);
  for(let i=-7;i<=7;i+=4){p=local(-13,i);box(...p,7,1.5,24,.4,'#39473b',t.a);}
  const aim=t.id===myId&&touchAim?Math.atan2(touchAim.y,touchAim.x):t.id===myId&&pointer.active?Math.atan2(pointer.y-t.y,pointer.x-t.x):t.aim;
  p=local(3-t.recoil*.4,0,aim);box(...p,23,24,23,11,tint(color,1.13),aim);
  p=local(24-t.recoil,0,aim);box(...p,30,6,27,6,tint(color,.72),aim);
  p=local(38-t.recoil,0,aim);box(...p,5,9,26,8,'#465342',aim);
  p=local(2,0,aim);box(...p,10,11,34,3,tint(color,.78),aim);
  p=local(-9,-10);line3([[...p,24],[...p,47]],'#3a4636',1);
  const top=project(t.x,t.y,57);ctx.fillStyle='#34432a';ctx.textAlign='center';ctx.font='bold 9px Consolas';ctx.fillText(t.name+(t.id===myId?' / YOU':''),top.x,top.y);
}
function frame(time){
  const dt=Math.min((time-last)/1000||0,.05);last=time;
  const smoothing=1-Math.exp(-dt*25);let ownSpeed=0;
  for(const t of tanks){
    const x=t.x,y=t.y;t.x+=(t.targetX-t.x)*smoothing;t.y+=(t.targetY-t.y)*smoothing;
    if(t.id===myId&&t.hp>0&&(keys.size>0||Math.hypot(sticks.move.x,sticks.move.y)>0))ownSpeed=Math.hypot(t.x-x,t.y-y)/Math.max(dt,.001);
    t.recoil=Math.max(0,t.recoil-28*dt);t.flash=Math.max(0,t.flash-dt);
    if(Math.hypot(t.x-x,t.y-y)>.1&&t.hp>0){t.track+=dt;if(t.track>.08){tracks.push({x:t.x,y:t.y,a:t.a,life:9});t.track=0;}}
  }
  updateMovementSound(ownSpeed);
  for(const s of shells){s.trail.push({x:s.x,y:s.y});if(s.trail.length>7)s.trail.shift();}
  tracks=tracks.filter(t=>(t.life-=dt)>0).slice(-500);updateEffects(dt);updateCamera();draw();requestAnimationFrame(frame);
}
new ResizeObserver(resize).observe(canvas);
resize();requestAnimationFrame(frame);
