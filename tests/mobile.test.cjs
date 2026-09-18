const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

function client(mobile=true,url='http://localhost:8765'){
  const elements=new Map(),windowEvents={},documentEvents={},sent=[];
  function element(){
    const events={},classes=new Set(),captures=new Set();
    return {events,children:[],hidden:false,textContent:'',style:{setProperty(){}},replaceChildren(...items){this.children=items;},append(...items){this.children.push(...items);},
      classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),toggle(n,on){on?classes.add(n):classes.delete(n);},contains:n=>classes.has(n)},
      addEventListener(n,f){events[n]=f;},setAttribute(){},focus(){},
      getContext:()=>({}),getBoundingClientRect:()=>({left:0,top:0,width:100,height:100}),
      setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)};
  }
  const media={matches:mobile,addEventListener(n,f){this.change=f;}};
  const sandbox={URL,FIELD:require('../shared.js'),performance:{now:()=>100},location:{href:url,origin:'http://localhost:8765'},
    document:{body:element(),createElement:element,getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},addEventListener(n,f){documentEvents[n]=f;}},
    window:{addEventListener(n,f){windowEvents[n]=f;}},matchMedia:q=>q.includes('pointer')?media:{matches:false},
    ResizeObserver:class{observe(){}},devicePixelRatio:1,setInterval(){},requestAnimationFrame(){},fetch:()=>new Promise(()=>{}),WebSocket:{OPEN:1},sent};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync('client.js','utf8'),sandbox);
  const run=code=>vm.runInContext(code,sandbox);
  run("joined=true;myId='me';tanks=[{id:'me',x:100,y:100,aim:0}];socket={readyState:1,bufferedAmount:0,send:data=>sent.push(JSON.parse(data))};updateTouchControls();");
  const event=(id,x=50,y=50)=>({pointerId:id,pointerType:'touch',clientX:x,clientY:y,preventDefault(){}});
  return {elements,windowEvents,documentEvents,media,sent,run,event,sandbox};
}

test('two thumbs move and aim independently, retain relative aim, and stop individually',()=>{
  const c=client(),move=c.elements.get('moveStick'),aim=c.elements.get('aimStick');
  move.events.pointerdown(c.event(1,82,50));
  aim.events.pointerdown(c.event(2,50,18));
  let input=c.sent.at(-1);
  assert.equal(input.x,1);assert.equal(input.y,0);assert.equal(input.fire,true);
  assert.equal(input.aimX,100);assert.equal(input.aimY,-50);
  // A third finger must not take over an occupied control.
  move.events.pointerdown(c.event(3,18,50));
  c.run('sendInput()');assert.equal(c.sent.at(-1).x,1);
  aim.events.pointerup(c.event(2));
  assert.equal(c.sent.at(-1).x,1);assert.equal(c.sent.at(-1).fire,false);
  c.run('tanks[0].x=200;tanks[0].y=200;sendInput()');
  assert.equal(c.sent.at(-1).aimX,200);assert.equal(c.sent.at(-1).aimY,50);
  move.events.pointercancel(c.event(1));
  assert.equal(c.sent.at(-1).x,0);
});

test('dead zone, captured pointer loss, blur, rotation and input mode changes clear controls',()=>{
  const c=client(),move=c.elements.get('moveStick'),aim=c.elements.get('aimStick');
  aim.events.pointerdown(c.event(2,52,50));assert.equal(c.sent.at(-1).fire,false);
  aim.events.pointermove(c.event(2,82,50));c.run('sendInput()');assert.equal(c.sent.at(-1).fire,true);
  aim.events.lostpointercapture(c.event(2));assert.equal(c.sent.at(-1).fire,false);
  for(const type of ['blur','resize']){
    move.events.pointerdown(c.event(1,82,50));aim.events.pointerdown(c.event(2,82,50));
    c.windowEvents[type]();assert.equal(c.sent.at(-1).x,0);assert.equal(c.sent.at(-1).fire,false);
  }
  move.events.pointerdown(c.event(1,82,50));c.media.matches=false;c.media.change();
  assert.equal(c.sent.at(-1).x,0);assert.equal(c.elements.get('thumbControls').hidden,true);
});

test('desktop hides thumb controls; touch controls wait for joining',()=>{
  const desktop=client(false);
  assert.equal(desktop.elements.get('thumbControls').hidden,true);
  assert.equal(desktop.elements.get('desktopHelp').hidden,false);
  const mobile=client();assert.equal(mobile.elements.get('thumbControls').hidden,false);
  mobile.run('joined=false;updateTouchControls()');assert.equal(mobile.elements.get('thumbControls').hidden,true);
});

test('plain URLs open the room browser while room links keep the prefilled join form',()=>{
  const plain=client();assert.equal(plain.elements.get('roomBrowser').hidden,false);assert.equal(plain.elements.get('joinFields').hidden,true);
  const linked=client(false,'http://localhost:8765/?room=quarry');
  assert.equal(linked.elements.get('roomBrowser').hidden,true);assert.equal(linked.elements.get('roomInput').value,'QUARRY');
  assert.equal(linked.elements.get('joinFields').hidden,false);
});

test('room selection previews names before joining and create opens a separate editable form',async()=>{
  const c=client();c.run('joined=false');
  c.sandbox.fetch=async()=>({ok:true,json:async()=>({rooms:[{code:'ALPHA',capacity:4,available:2,players:[{name:'Alice',connected:true},{name:'Bob',connected:false}]}]})});
  await c.run('refreshRooms()');c.elements.get('roomList').children[0].events.click();
  assert.equal(c.elements.get('roomDetails').hidden,false);
  assert.deepEqual(c.elements.get('roomPlayers').children.map(p=>p.textContent),['Alice','Bob (reconnecting)']);
  c.elements.get('joinSelected').events.click();
  assert.equal(c.run('joinMode'),'join');assert.equal(c.elements.get('roomInput').value,'ALPHA');assert.equal(c.elements.get('roomInput').readOnly,true);
  c.elements.get('createRoom').events.click();
  assert.equal(c.run('joinMode'),'create');assert.equal(c.elements.get('roomInput').readOnly,false);assert.match(c.elements.get('roomInput').value,/^ROOM-/);
});

test('full and vanished rooms cannot be joined; request failures provide a retry message',async()=>{
  const c=client();c.run('joined=false;selectedRoom="FULL"');
  c.sandbox.fetch=async()=>({ok:true,json:async()=>({rooms:[{code:'FULL',capacity:4,available:0,players:[]}]})});
  await c.run('refreshRooms()');assert.equal(c.elements.get('joinSelected').disabled,true);
  c.sandbox.fetch=async()=>({ok:true,json:async()=>({rooms:[]})});
  await c.run('refreshRooms()');assert.equal(c.elements.get('roomDetails').hidden,true);assert.equal(c.elements.get('joinSelected').disabled,true);
  c.sandbox.fetch=async()=>{throw Error('offline');};await c.run('refreshRooms()');
  assert.match(c.elements.get('roomListStatus').textContent,/Tap Refresh/);
});

test('mobile play uses a compact viewport and restores the page on leaving or switching input',()=>{
  const c=client(),arena=c.elements.get('arena');
  assert.equal(arena.classList.contains('mobile-active'),true);
  assert.equal(c.sandbox.document.body.classList.contains('mobile-playing'),true);
  assert.equal(c.elements.get('viewMode').hidden,false);
  c.run('joined=false;updateTouchControls()');
  assert.equal(arena.classList.contains('mobile-active'),false);
  assert.equal(c.sandbox.document.body.classList.contains('mobile-playing'),false);
  assert.equal(c.elements.get('viewMode').hidden,true);
  c.run('joined=true');c.media.matches=false;c.media.change();
  assert.equal(arena.classList.contains('mobile-active'),false);
});

test('mobile menu releases controls and closes on action, outside tap, Escape and leaving',()=>{
  const c=client(),arena=c.elements.get('arena'),menu=c.elements.get('arenaMenu');
  c.elements.get('moveStick').events.pointerdown(c.event(1,82,50));
  menu.events.click();
  assert.equal(arena.classList.contains('menu-open'),true);
  assert.equal(c.sent.at(-1).x,0);
  c.elements.get('arenaActions').events.click({target:{closest:()=>({})}});
  assert.equal(arena.classList.contains('menu-open'),false);
  menu.events.click();c.sandbox.document.getElementById('arenaHeader').contains=()=>false;
  c.documentEvents.pointerdown({target:{}});
  assert.equal(arena.classList.contains('menu-open'),false);
  menu.events.click();c.documentEvents.keydown({code:'Escape'});
  assert.equal(arena.classList.contains('menu-open'),false);
  menu.events.click();c.run('joined=false;updateTouchControls()');
  assert.equal(arena.classList.contains('menu-open'),false);
});

test('mobile camera enlarges tanks, follows them, and keeps every corner visible',()=>{
  const c=client();
  for(const [width,height] of [[874,290],[390,620],[667,240],[320,430]]){
    c.run(`cssW=${width};cssH=${height};tanks[0].x=800;tanks[0].y=520;updateCamera()`);
    assert(c.run('48*boardScale*scale')>=33.59,'tank width stays readable in CSS pixels');
    assert.equal(c.run('project(tanks[0].x,tanks[0].y).x*scale+offsetX'),width/2);
    assert.equal(c.run('project(tanks[0].x,tanks[0].y).y*scale+offsetY'),height/2-40);
    const before=c.run('offsetX');
    c.run('tanks[0].x+=50;updateCamera()');assert(c.run('offsetX')<before);
    for(const [x,y] of [[0,0],[1600,0],[0,1040],[1600,1040]]){
      c.run(`tanks[0].x=${x};tanks[0].y=${y};updateCamera()`);
      const screenX=c.run('project(tanks[0].x,tanks[0].y).x*scale+offsetX');
      const screenY=c.run('project(tanks[0].x,tanks[0].y).y*scale+offsetY');
      assert(screenX>=23.99&&screenX<=width-23.99);
      assert(screenY>=23.99&&screenY<=height-23.99);
      assert(screenY>=63.99&&screenY<=height-143.99,'tank stays clear of tools and thumb pads');
    }
  }
});

test('overview fits the whole board and toggles back without changing touch aim',()=>{
  const c=client();c.run('cssW=874;cssH=290;touchAim={x:0,y:-1};updateCamera()');
  const closeScale=c.run('scale');
  c.elements.get('viewMode').events.click();
  assert.equal(c.elements.get('viewMode').textContent,'CLOSE VIEW');
  assert(c.run('scale')<closeScale);
  assert(c.run('project(0,0).x*scale+offsetX')>=23.99);
  assert(c.run('project(0,0).y*scale+offsetY')>=23.99);
  assert(c.run('project(W,H).x*scale+offsetX')<=850.01);
  assert(c.run('project(W,H).y*scale+offsetY')<=266.01);
  c.run('sendInput()');assert.equal(c.sent.at(-1).aimY,-50);
  c.elements.get('viewMode').events.click();assert.equal(c.run('scale'),closeScale);
  assert.equal(c.elements.get('viewMode').textContent,'FULL MAP');
});

test('desktop camera and mouse unprojection remain unchanged',()=>{
  const c=client(false);c.run('cssW=1120;cssH=610;updateCamera()');
  assert.equal(c.run('scale'),1);assert.equal(c.run('offsetX'),0);assert.equal(c.run('offsetY'),0);
  c.run('aimAt({pointerType:"mouse",clientX:560,clientY:319})');
  assert.equal(c.run('pointer.x'),800);assert.equal(c.run('pointer.y'),527.7);
});

test('fullscreen enters/exits and unavailable or rejected requests use a reversible expanded view',async()=>{
  for(const mode of ['supported','unavailable','rejected']){
    const c=client(),doc=c.sandbox.document,arena=doc.getElementById('arena');
    if(mode==='supported'){
      arena.requestFullscreen=async()=>{doc.fullscreenElement=arena;};
      doc.exitFullscreen=async()=>{doc.fullscreenElement=null;c.documentEvents.fullscreenchange();};
    }else if(mode==='rejected')arena.requestFullscreen=async()=>{throw new Error('Denied');};
    const toggle=c.elements.get('fullscreen').events.click;
    await toggle();assert.equal(c.elements.get('fullscreen').textContent,'EXIT FULL SCREEN');
    assert.equal(arena.classList.contains('expanded'),mode!=='supported');
    await toggle();assert.equal(c.elements.get('fullscreen').textContent,'FULL SCREEN');
    assert.equal(arena.classList.contains('expanded'),false);
    assert.equal(doc.body.classList.contains('arena-expanded'),false);
  }
});
