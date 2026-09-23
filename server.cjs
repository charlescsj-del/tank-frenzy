'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {randomBytes}=require('node:crypto');
const {WebSocketServer,WebSocket}=require('ws');
const {Room}=require('./game-server.cjs');
const {maxPlayers}=require('./shared.js');
function createGameServer(){
  const rooms=new Map(),sessions=new Map();
  const files={'/':['index.html','text/html'],'/index.html':['index.html','text/html'],'/client.js':['client.js','text/javascript'],'/shared.js':['shared.js','text/javascript'],'/sound-bank.js':['sound-bank.js','text/javascript'],'/music.js':['music.js','text/javascript'],'/audio/cartoon-v1.mp3':['audio/cartoon-v1.mp3','audio/mpeg'],'/mode-banner.webp':['mode-banner.webp','image/webp']};
  for(const name of ['iron-advance','overdrive','steel-pressure'])files[`/audio/music-${name}-v1.mp3`]=[`audio/music-${name}-v1.mp3`,'audio/mpeg'];
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    if(url.pathname==='/rooms'){
      const available=[...rooms.values()].filter(room=>room.players.size>0).map(room=>({
        code:room.code,capacity:maxPlayers,available:maxPlayers-room.players.size,settings:room.settings,phase:room.phase,
        players:[...room.players.values()].map(({name,slot,connected,team})=>({name,slot,connected,team}))
      })).sort((a,b)=>a.code.localeCompare(b.code));
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({rooms:available}));return;
    }
    if(url.pathname==='/network-info'){
      const port=server.address().port;
      const urls=Object.values(os.networkInterfaces()).flat().filter(n=>n.family==='IPv4'&&!n.internal).map(n=>`http://${n.address}:${port}`);
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({urls}));return;
    }
    const file=files[url.pathname];if(!file){res.writeHead(404);res.end('Not found');return;}
    if(url.pathname==='/mode-banner.webp')res.setHeader('Cache-Control','public, max-age=86400');
    if(file[1]==='audio/mpeg')res.setHeader('Cache-Control','public, max-age=31536000, immutable');
    res.setHeader('Content-Type',file[1]+(file[1].startsWith('text/')?'; charset=utf-8':''));fs.createReadStream(path.join(__dirname,file[0])).pipe(res);
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:2048});
  server.on('upgrade',(req,socket,head)=>{
    if(req.url!=='/ws'){socket.destroy();return;}
    if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host){socket.destroy();return;}}catch{socket.destroy();return;}}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
  });
  function send(ws,data){if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<256*1024)ws.send(JSON.stringify(data));}
  wss.on('connection',ws=>{
    let session=null,count=0,windowStart=Date.now();
    ws.alive=true;ws.on('pong',()=>{ws.alive=true;});
    const joinTimeout=setTimeout(()=>{if(!session)ws.close(1008,'Join required');},10000);
    ws.on('error',()=>{});
    ws.on('message',raw=>{
      if(Date.now()-windowStart>1000){count=0;windowStart=Date.now();}if(++count>150){ws.close(1008,'Too many messages');return;}
      let msg;try{msg=JSON.parse(raw.toString());}catch{return;}
      if(!msg||typeof msg!=='object')return;
      if(msg.type==='join'&&!session){
        const code=String(msg.room||'QUARRY').toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,16)||'QUARRY';
        const existing=typeof msg.token==='string'?sessions.get(msg.token):null;
        if(existing&&existing.room.code===code&&existing.room.players.has(existing.player.id)){
          session=existing;const previous=session.ws;session.ws=ws;
          if(previous!==ws)previous.terminate();
          session.player.connected=true;session.player.pendingShot=false;session.player.input={x:0,y:0,aimX:session.player.x+100,aimY:session.player.y,fire:false};session.player.lastInput=session.room.time;
        }
        else{
          if(msg.mode==='create'&&rooms.has(code)&&rooms.get(code).players.size>0){send(ws,{type:'error',message:'That room already exists. Choose another code or browse rooms to join it.'});ws.close();return;}
          if(msg.mode==='join'&&(!rooms.has(code)||rooms.get(code).players.size===0)){send(ws,{type:'error',message:'That room is no longer available. Browse rooms or create a new one.'});ws.close();return;}
          if(rooms.has(code)&&rooms.get(code).players.size===0)rooms.delete(code);
          if(!rooms.has(code)){if(rooms.size>=32){send(ws,{type:'error',message:'Server is full. Try an existing room.'});ws.close();return;}rooms.set(code,new Room(code,msg.settings));}
          const room=rooms.get(code);const name=typeof msg.name==='string'?msg.name.replace(/[\x00-\x1f<>]/g,'').trim().slice(0,16):'';
          const player=room.add(name);if(!player){send(ws,{type:'error',message:'Room full (4 players). Choose another room code.'});ws.close();return;}
          session={room,player,token:randomBytes(24).toString('hex'),ws};sessions.set(session.token,session);
        }
        session.ws=ws;clearTimeout(joinTimeout);send(ws,{type:'welcome',id:session.player.id,token:session.token,slot:session.player.slot,room:code,seq:session.player.seq});send(ws,session.room.snapshot());return;
      }
      if(!session)return;
      if(session.ws!==ws)return;
      if(msg.type==='start')session.room.start(session.player);
      if(msg.type==='input')session.room.setInput(session.player,msg);
      if(msg.type==='ping')send(ws,{type:'pong',sent:msg.sent});
      if(msg.type==='leave'){session.room.remove(session.player);if(session.room.players.size===0)rooms.delete(session.room.code);sessions.delete(session.token);ws.close(1000,'Left room');}
    });
    ws.on('close',()=>{clearTimeout(joinTimeout);if(session&&session.ws===ws)session.room.disconnect(session.player);});
  });
  let last=performance.now(),accumulator=0,tick=0;
  const timer=setInterval(()=>{
    const now=performance.now();accumulator+=Math.min((now-last)/1000,.1);last=now;
    while(accumulator>=1/120){for(const room of rooms.values())room.step(1/120);accumulator-=1/120;}
    if(++tick%2===0){
      for(const room of rooms.values()){
        if(room.players.size===0){rooms.delete(room.code);continue;}
        const snapshot=room.snapshot();for(const session of sessions.values())if(session.room===room&&session.player.connected)send(session.ws,snapshot);room.events=[];
      }
      for(const [token,s]of sessions)if(!s.room.players.has(s.player.id))sessions.delete(token);
    }
  },1000/60);
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},5000);
  async function close(){clearInterval(timer);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>server.close(resolve));}
  return {server,wss,rooms,close};
}
if(require.main===module){
  const game=createGameServer(),port=Number(process.env.PORT)||8765;
  game.server.on('error',error=>{console.error(`Cannot start game: ${error.message}`);process.exit(1);});
  game.server.listen(port,'0.0.0.0',()=>{console.log(`Tank Frenzy: http://localhost:${port}`);for(const list of Object.values(os.networkInterfaces()))for(const n of list||[])if(n.family==='IPv4'&&!n.internal)console.log(`Network: http://${n.address}:${port}`);});
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>game.close().then(()=>process.exit(0)));
}
module.exports={createGameServer};
