'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const fs=require('node:fs');
const vm=require('node:vm');

// Exercise the production HTTP and WebSocket handlers without opening OS sockets.
function server(){
  class Socket extends EventEmitter{
    readyState=1;bufferedAmount=0;messages=[];
    send(raw){this.messages.push(JSON.parse(raw));}
    close(){this.readyState=3;this.emit('close');}
    terminate(){this.close();}
  }
  class WSS extends EventEmitter{clients=new Set();close(cb){cb();}}
  const sandbox={module:{exports:{}},__dirname:require('node:path').resolve(__dirname,'..'),URL,performance,
    setInterval(){},clearInterval(){},setTimeout(){},clearTimeout(){},
    require(name){
      if(name==='node:http')return {createServer(handler){const http=new EventEmitter();http.on('request',handler);http.close=cb=>cb();return http;}};
      if(name==='ws')return {WebSocketServer:WSS,WebSocket:{OPEN:1}};
      if(name.startsWith('./'))return require('../'+name.slice(2));
      return require(name);
    }};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../server.cjs'),'utf8'),sandbox);
  const game=sandbox.module.exports.createGameServer();
  function join(room,mode,name='Player',token){const socket=new Socket();game.wss.emit('connection',socket);socket.emit('message',JSON.stringify({type:'join',room,mode,name,token}));return socket;}
  function list(){let body,headers={};game.server.emit('request',{url:'/rooms',method:'GET'},{setHeader(k,v){headers[k]=v;},end(raw){body=JSON.parse(raw);}});return {body,headers};}
  return {game,join,list};
}

test('room directory starts empty and lists only public player details',()=>{
  const s=server();assert.deepEqual(s.list().body,{rooms:[]});
  s.join('ZETA','create','Zed');s.join('ALPHA','create','Alice');s.join('ALPHA','join','Bob');
  const {body,headers}=s.list();
  assert.deepEqual(body.rooms.map(r=>r.code),['ALPHA','ZETA']);
  assert.equal(body.rooms[0].available,2);assert.equal(body.rooms[0].capacity,4);
  assert.deepEqual(body.rooms[0].players.map(p=>p.name),['Alice','Bob']);
  assert.deepEqual(Object.keys(body.rooms[0].players[0]).sort(),['connected','name','slot']);
  assert.equal(headers['Cache-Control'],'no-store');
});

test('creating an existing room or joining a vanished room returns a useful error',()=>{
  const s=server();s.join('ALPHA','create');
  assert.match(s.join('ALPHA','create').messages[0].message,/already exists/);
  assert.match(s.join('MISSING','join').messages[0].message,/no longer available/);
  assert.equal(s.game.rooms.get('ALPHA').players.size,1);assert.equal(s.game.rooms.has('MISSING'),false);
});

test('full rooms include reserved reconnecting players and reject extra joins',()=>{
  const s=server(),owner=s.join('FULL','create','Alice');
  for(let i=0;i<3;i++)s.join('FULL','join','Guest'+i);
  owner.close();const room=s.list().body.rooms[0];
  assert.equal(room.available,0);assert.equal(room.players[0].connected,false);
  assert.match(s.join('FULL','join').messages[0].message,/full/);
});

test('legacy room links still create rooms and reconnect tokens retain the player',()=>{
  const s=server(),first=s.join('LINK',undefined,'Alice'),welcome=first.messages[0];first.close();
  const again=s.join('LINK','create','Alice',welcome.token);
  assert.equal(again.messages[0].id,welcome.id);
  assert.equal(s.list().body.rooms[0].players.length,1);
});

test('leaving or expired reservations remove rooms from discovery',()=>{
  const s=server(),a=s.join('LEAVE','create');a.emit('message',JSON.stringify({type:'leave'}));
  assert.equal(s.list().body.rooms.length,0);
  const b=s.join('EXPIRE','create');b.close();s.game.rooms.get('EXPIRE').step(16);
  assert.equal(s.list().body.rooms.length,0);
});
