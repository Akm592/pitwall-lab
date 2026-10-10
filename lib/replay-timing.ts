// Session seconds share the telemetry clock; null means the source did not supply a checkpoint.
export type TimingLap={number:number;start:number|null;sector1:number|null;sector2:number|null;sector3:number|null;end:number|null;pitIn:number|null;pitOut:number|null};
export type ReplayTiming={schemaVersion:1;season:number;slug:string;utcOrigin:string|null;start:number|null;end:number|null;source:string;cars:Record<string,{laps:TimingLap[];ranks:{t:number;position:number}[];rankSource:'FastF1 timing stream'|'unavailable'}>};

export function decodeReplayTiming(value:unknown,season:number,slug:string):ReplayTiming{
 const file=value as ReplayTiming;
 const time=(t:unknown)=>t===null||typeof t==='number'&&Number.isFinite(t);
 if(!file||file.schemaVersion!==1||file.season!==season||file.slug!==slug||!time(file.start)||!time(file.end)
  ||file.utcOrigin!==null&&(typeof file.utcOrigin!=='string'||!Number.isFinite(Date.parse(file.utcOrigin)))
  ||file.start!==null&&file.end!==null&&file.end<=file.start
  ||typeof file.source!=='string'||!file.cars||typeof file.cars!=='object'||Array.isArray(file.cars))throw new Error('Invalid replay timing data');
 for(const car of Object.values(file.cars)){
  if(!car||!Array.isArray(car.laps)||!Array.isArray(car.ranks)||!['FastF1 timing stream','unavailable'].includes(car.rankSource)
   ||car.rankSource==='unavailable'&&car.ranks.length>0)throw new Error('Invalid replay timing car');
  let number=0,rankTime=-Infinity;
  for(const lap of car.laps){
   if(!Number.isInteger(lap.number)||lap.number<=number||![lap.start,lap.sector1,lap.sector2,lap.sector3,lap.end,lap.pitIn,lap.pitOut].every(time)
    ||lap.start!==null&&lap.end!==null&&lap.end<=lap.start)throw new Error('Invalid replay checkpoint');
   number=lap.number;
   const anchors=[lap.start,lap.sector1,lap.sector2,lap.end].filter((t):t is number=>t!==null);
   if(anchors.some((t,index)=>index>0&&t<=anchors[index-1])
    ||lap.sector3!==null&&[lap.start,lap.sector1,lap.sector2].some(t=>t!==null&&lap.sector3!<t))throw new Error('Unordered replay checkpoint');
   // Sector3SessionTime is a report timestamp and can be later than lap Time; preserve both source values.
  }
  for(const rank of car.ranks){
   if(!Number.isFinite(rank.t)||rank.t<=rankTime||!Number.isInteger(rank.position)||rank.position<1||rank.position>99)throw new Error('Invalid recorded rank');
   rankTime=rank.t;
  }
 }
 return file;
}

// Hold the last observed classification; unknown before the first observation, never inferred from geometry.
export function observedRankAt(timing:ReplayTiming,code:string,t:number):number|null{
 const ranks=timing.cars[code]?.ranks;
 if(!ranks||!Number.isFinite(t))return null;
 let low=0,high=ranks.length;
 while(low<high){const middle=(low+high)>>1;if(ranks[middle].t<=t)low=middle+1;else high=middle;}
 return low?ranks[low-1].position:null;
}
