(function(root) {
  const data = {
    width: 1600, height: 1040, maxPlayers: 4, targetScore: 10, fireCooldown: .42, shellSpeed: 410,
    maxShells:96,maxShellsPerPlayer:24,powerDuration:10,pickupInterval:12,pickupLifetime:20,
    powers:['laser','double','speed','machine'],
    powerLabels:{laser:'LASER',double:'DOUBLE GUN',speed:'SPEED',machine:'MACHINE GUN'},
    palette: [
      {name:'Ember',body:'#dc7949',bullet:'#ff782e'},
      {name:'Glacier',body:'#619db8',bullet:'#39bfff'},
      {name:'Moss',body:'#70a15b',bullet:'#8de445'},
      {name:'Orchid',body:'#a77dbb',bullet:'#df8bff'},
      {name:'Gold',body:'#c1a64d',bullet:'#ffcf36'},
      {name:'Rose',body:'#c67494',bullet:'#ff72af'},
      {name:'Jade',body:'#49a799',bullet:'#42efd1'},
      {name:'Ivory',body:'#a3a393',bullet:'#faf2cf'}
    ],
    walls: [],
    spawns: [[90,90],[1510,950],[1510,90],[90,950]]
  };
  data.viewScale=Math.min(1000/data.width,520/data.height);
  data.project=(x,y,z=0)=>({x:560+(x-data.width/2)*data.viewScale,y:319+(y-data.height/2-z*.35)*data.viewScale});
  data.unproject=(x,y,z=0)=>({x:data.width/2+(x-560)/data.viewScale,y:data.height/2+(y-319)/data.viewScale+z*.35});
  if(typeof module !== 'undefined') module.exports=data;
  else root.FIELD=data;
})(typeof globalThis !== 'undefined' ? globalThis : this);
