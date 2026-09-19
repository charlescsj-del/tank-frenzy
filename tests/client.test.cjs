const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
test('local movement audio, opponent-only firing, and stop/mute behavior',()=>{
  const elements=new Map(),listeners={},audioEvents=[];
  const context=new Proxy({createLinearGradient:()=>({addColorStop(){}})},{get:(target,key)=>target[key]||(()=>{}),set:()=>true});
  const element=()=>({style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},replaceChildren(){},append(){},focus(){},getBoundingClientRect:()=>({width:1120,height:610}),getContext:()=>context});
  const param=()=>({value:0,cancelScheduledValues(){},setValueAtTime(value){this.value=value;},setTargetAtTime(value){this.value=value;},exponentialRampToValueAtTime(value){this.value=value;}});
  const node=()=>({connect(){},disconnect(){},start(){audioEvents.push('start');},stop(){}});
  class AudioContext {
    state='running';currentTime=0;sampleRate=8000;destination={};
    createOscillator(){return {...node(),frequency:param()};}
    createGain(){return {...node(),gain:param()};}
    createBiquadFilter(){return {...node(),frequency:param()};}
    createBufferSource(){return node();}
    createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)};}
  }
  const sandbox={assert,audioEvents,FIELD:require('../shared.js'),URL,performance:{now:()=>100},location:{href:'http://localhost:8765',origin:'http://localhost:8765',hostname:'localhost'},document:{hidden:false,getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element,addEventListener(){}},window:{AudioContext,addEventListener:(name,handler)=>{listeners[name]=handler;}},matchMedia:()=>({matches:true}),ResizeObserver:class{observe(){}},devicePixelRatio:1,setInterval(){},setTimeout(){},clearTimeout(){},requestAnimationFrame(){},fetch:()=>new Promise(()=>{}),WebSocket:{OPEN:1}};
  sandbox.document.body=element();
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync('client.js','utf8'),sandbox);
  vm.runInContext(`
    myId='me';joined=true;audioReady=true;lastSnapshot=100;
    const before=audioEvents.length;
    playShotSound({player:'me',slot:0});assert.equal(audioEvents.length,before);
    playShotSound({player:'opponent',slot:1});assert.equal(audioEvents.length,before+2);
    tanks=[{id:'me',slot:0,x:100,y:100,targetX:100,targetY:100,hp:5,a:0,aim:0,recoil:0,flash:0,track:0,name:'Me'},
      {id:'other',slot:1,x:900,y:100,targetX:920,targetY:100,hp:5,a:0,aim:0,recoil:0,flash:0,track:0,name:'Other'}];
    frame(16);assert.equal(engine,null,'opponent movement does not start local engine');
    keys.add('KeyD');tanks[0].targetX=110;frame(32);assert(engine.gain.gain.value>0,'own actual movement starts engine');
    release();assert.equal(engine.gain.gain.value,0,'blur/release stops engine immediately');
    sound=false;updateMovementSound(170);assert.equal(engine.gain.gain.value,0,'mute suppresses movement sound');
    sound=true;updateMovementSound(170);assert(engine.gain.gain.value>0);
    joined=false;updateMovementSound(170);assert.equal(engine.gain.gain.value,0,'disconnect stops engine');
    const notesBefore=audioEvents.length;playCue('start');assert.equal(audioEvents.length,notesBefore+4);
    sound=false;playCue('win');assert.equal(audioEvents.length,notesBefore+4,'mute suppresses result cues');
    stopCueSounds();assert.equal(cueVoices.size,0,'mute cancels scheduled notes');
    sound=true;document.hidden=true;playCue('menu');assert.equal(audioEvents.length,notesBefore+4,'hidden tabs do not play cues');
    document.hidden=false;playCue('lose');assert.equal(audioEvents.length,notesBefore+7);
    for(let i=0;i<30;i++)playCue('menu');assert(cueVoices.size<=16,'rapid menu input keeps a bounded number of voices');
    stopCueSounds();
  `,sandbox);
});
