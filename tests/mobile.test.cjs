const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

function client(mobile=true){
  const elements=new Map(),windowEvents={},documentEvents={},sent=[];
  function element(){
    const events={},classes=new Set(),captures=new Set();
    return {events,hidden:false,textContent:'',style:{setProperty(){}},
      classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),toggle(n,on){on?classes.add(n):classes.delete(n);},contains:n=>classes.has(n)},
      addEventListener(n,f){events[n]=f;},setAttribute(){},focus(){},
      getContext:()=>({}),getBoundingClientRect:()=>({left:0,top:0,width:100,height:100}),
      setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)};
  }
  const media={matches:mobile,addEventListener(n,f){this.change=f;}};
  const sandbox={URL,FIELD:require('../shared.js'),performance:{now:()=>100},location:{href:'http://localhost:8765',origin:'http://localhost:8765'},
    document:{body:element(),getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},addEventListener(n,f){documentEvents[n]=f;}},
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
