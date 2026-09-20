(function(root){
  'use strict';
  // Original toy-box tunes, rendered once on the player's device, then looped.
  // One mono buffer source plays at a time; no server traffic or note timers.
  function compose(context,mode){
    const rate=22050,beat=60/(mode==='battle'?124:108),duration=beat*32;
    const buffer=context.createBuffer(1,Math.ceil(duration*rate),rate),out=buffer.getChannelData(0);
    const note=(midi,start,length,level,kind='bell')=>{
      const frequency=440*2**((midi-69)/12),first=Math.round(start*rate),count=Math.round(length*rate);
      for(let i=0;i<count;i++){
        const t=i/rate,phase=2*Math.PI*frequency*t;
        const envelope=Math.min(1,t/.008)*Math.min(1,(length-t)/.04)*Math.exp(-t*(kind==='bass'?3:7));
        const wave=kind==='bass'?Math.sin(phase):Math.sin(phase)+.22*Math.sin(phase*2)+.08*Math.sin(phase*3);
        out[(first+i)%out.length]+=wave*envelope*level;
      }
    };
    const roots=[48,53,55,48,57,53,55,48];
    const phrases=mode==='battle'?[[12,7,12,14,16,14,12,7],[16,12,7,12,14,12,7,9]]:[[12,16,19,16,14,12,7,9],[12,14,16,19,16,14,12,7]];
    for(let bar=0;bar<8;bar++){
      const root=roots[bar];
      for(let step=0;step<8;step++){
        const at=(bar*4+step*.5)*beat;
        if(step%2===0)note(root+(step===4?7:0),at,beat*.65,.22,'bass');
        if(!(mode==='lobby'&&step===7))note(root+phrases[bar%2][step],at,beat*.65,.13);
        // Soft woodblock pulse. Less dense on the splash/waiting screen.
        if(step%2===0||mode==='battle')note(step%4===2?83:76,at,.055,.035,'bass');
      }
    }
    let peak=0;for(const value of out)peak=Math.max(peak,Math.abs(value));
    const level=.55/Math.max(.55,peak);for(let i=0;i<out.length;i++)out[i]*=level;
    return buffer;
  }
  class TankMusic{
    constructor(context){this.context=context;this.buffers=new Map();this.source=null;this.mode=null;this.gain=context.createGain();this.gain.gain.value=.10;this.gain.connect(context.destination);}
    play(mode){
      if(mode===this.mode&&this.source)return;
      this.stop();
      if(!this.buffers.has(mode))this.buffers.set(mode,compose(this.context,mode));
      const source=this.context.createBufferSource();source.buffer=this.buffers.get(mode);source.loop=true;source.connect(this.gain);
      this.gain.gain.setValueAtTime(0,this.context.currentTime);this.gain.gain.linearRampToValueAtTime(.10,this.context.currentTime+.25);
      this.source=source;this.mode=mode;source.start();
    }
    stop(){if(this.source){this.source.stop();this.source.disconnect();this.source=null;}this.mode=null;this.gain.gain.cancelScheduledValues(this.context.currentTime);this.gain.gain.setValueAtTime(0,this.context.currentTime);}
  }
  TankMusic.compose=compose;
  if(typeof module!=='undefined')module.exports=TankMusic;else root.TankMusic=TankMusic;
})(typeof globalThis!=='undefined'?globalThis:this);
