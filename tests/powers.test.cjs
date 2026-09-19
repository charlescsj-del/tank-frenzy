'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Room,hitRect}=require('../game-server.cjs');
const F=require('../shared.js');
function arena(options){const r=new Room('POWER',options);r.map.walls=[];return r;}
function power(r,p,type){p.power=type;p.powerUntil=r.time+10;p.cool=0;}

test('room defaults and balanced teams preserve reserved slots',()=>{
  const r=arena({mode:'teams'}),ps=Array.from({length:4},()=>r.add('P'));
  assert.deepEqual(r.settings,{mode:'teams',bouncing:true,powers:true});
  assert.deepEqual(ps.map(p=>p.team),[0,1,0,1]);r.disconnect(ps[0]);assert.equal(r.add('Full'),null);
  r.players.delete(ps[1].id);assert.equal(r.add('Replacement').team,1);
  assert.deepEqual(arena({mode:'invalid'}).settings,{mode:'ffa',bouncing:true,powers:true});
});

test('friendly shells pass teammates and team kills produce a shared victory',()=>{
  const r=arena({mode:'teams'}),a=r.add('A'),enemy=r.add('B'),friend=r.add('C');
  a.x=100;a.y=300;friend.x=200;friend.y=300;enemy.x=900;enemy.y=300;friend.shieldUntil=enemy.shieldUntil=0;
  r.shells=[{id:1,x:180,y:300,vx:410,vy:0,owner:a.id,team:0,slot:0,life:3,bounces:0}];
  r.step(.05);assert.equal(friend.hp,5);assert.equal(r.shells.length,1);
  r.teamScores[0]=9;r.damage(enemy,friend.id,5);
  assert.equal(r.teamScores[0],10);assert.equal(r.winner.name,'Orange team');
  r.step(11);assert.deepEqual(r.teamScores,[0,0]);assert.equal(r.winner,null);assert.equal(friend.power,null);
});

test('bouncing disabled absorbs shells at boundaries and walls',()=>{
  for(const wall of [false,true]){
    const r=arena({bouncing:false});if(wall)r.map.walls=[{x:500,y:200,w:50,h:200}];
    r.shells=[{id:1,x:wall?494:1594,y:300,vx:410,vy:0,owner:'a',slot:0,life:3,bounces:0}];
    r.step(1/120);assert.equal(r.shells.length,0);assert.equal(r.events.some(e=>e.type==='bounce'),false);
  }
});

test('pickups stay bounded, spawn clear of cover, expire and honor disabled powers',()=>{
  const r=new Room('DROPS');for(let i=0;i<50;i++)r.spawnPickup();
  assert.equal(r.pickups.length,2);
  for(const p of r.pickups){assert(F.powers.includes(p.type));assert(!r.map.walls.some(w=>hitRect(p.x,p.y,26,w)));}
  r.nextPickup=Infinity;r.step(21);assert.equal(r.pickups.length,0);
  const off=arena({powers:false});off.spawnPickup();off.step(30);assert.equal(off.pickups.length,0);
});

test('pickup grants one timed power; replacement, expiry and death clear it correctly',()=>{
  const r=arena(),p=r.add('P');r.nextPickup=Infinity;
  for(const type of ['speed','laser']){
    r.pickups=[{id:1,type,x:p.x,y:p.y,expiresAt:20}];r.step(1/120);
    assert.equal(p.power,type);assert.equal(r.pickups.length,0);assert.equal(r.snapshot().players[0].powerRemaining,10);
  }
  r.step(10.01);assert.equal(p.power,null);
  power(r,p,'double');r.damage(p,'enemy',5);assert.equal(p.power,null);assert.equal(p.powerUntil,0);
});

test('speed moves 60 percent faster only while active',()=>{
  const r=arena(),p=r.add('P');p.x=500;p.y=500;
  const move=()=>{p.input={x:1,y:0,aimX:1000,aimY:500,fire:false};p.lastInput=r.time;r.step(.1);};
  move();const base=p.x-500;power(r,p,'speed');const start=p.x;move();assert(Math.abs((p.x-start)/base-1.6)<1e-8);
  p.powerUntil=r.time;const end=p.x;move();assert(Math.abs(p.x-end-base)<1e-8);
});

test('double gun emits two shells; machine gun shoots faster within hard limits',()=>{
  const r=arena(),p=r.add('P');power(r,p,'double');r.fire(p);
  assert.equal(r.shells.length,2);assert.notEqual(r.shells[0].vy,r.shells[1].vy);
  r.shells=[];power(r,p,'machine');r.fire(p);assert.equal(p.cool,.12);
  for(let i=0;i<200;i++){p.cool=0;r.fire(p);}assert.equal(r.shells.length,F.maxShellsPerPlayer);
  const others=Array.from({length:3},()=>r.add('Other'));
  for(const other of others){power(r,other,'machine');for(let i=0;i<200;i++){other.cool=0;r.fire(other);}}
  assert.equal(r.shells.length,F.maxShells);
});

test('laser damages enemies once, stops at cover, and ignores teammates',()=>{
  const r=arena({mode:'teams'}),a=r.add('A'),b=r.add('B'),c=r.add('C');
  a.x=100;a.y=300;a.aim=0;b.x=500;b.y=300;c.x=250;c.y=300;b.shieldUntil=c.shieldUntil=0;
  power(r,a,'laser');r.fire(a);assert.equal(b.hp,3);assert.equal(c.hp,5);assert.equal(r.shells.length,0);
  assert(r.events.some(e=>e.type==='laser'&&e.endX<500));
  r.map.walls=[{x:350,y:200,w:30,h:200}];a.cool=0;r.fire(a);assert.equal(b.hp,3);assert.equal(r.events.at(-1).endX,350);
  r.map.walls=[];b.shieldUntil=10;a.cool=0;r.fire(a);assert.equal(b.hp,3);
});
