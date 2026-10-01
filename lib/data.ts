import fs from 'node:fs';
import path from 'node:path';
export const seasons:number[] = fs.readdirSync(path.join(process.cwd(),'data'))
 .filter(name=>/^\d{4}$/.test(name)&&fs.existsSync(path.join(process.cwd(),'data',name,'calendar.json')))
 .map(Number).sort((a,b)=>a-b);
export type CalendarRace = {slug:string;label:string;flag:string;round:number;name:string;circuit:string;date?:string;raceStartUtc?:string;status?:'completed'|'upcoming'|'unavailable'};
export function getCalendar(season:number):CalendarRace[] {
 if (!seasons.includes(season as typeof seasons[number])) return [];
 try {return JSON.parse(fs.readFileSync(path.join(process.cwd(),'data',String(season),'calendar.json'),'utf8'));} catch {return [];}
}
export type Driver = {code:string;number:string;name:string;team:string;color:string;position:number|null;grid:number|null;points:number|null;status:string;gap:string;elapsedSeconds:number|null};
export type Lap = {driver:string;number:number;timeSeconds:number|null;sector1:number|null;sector2:number|null;sector3:number|null;position:number|null;compound:string|null;tyreLife:number|null;stint:number|null;pitIn:boolean;pitOut:boolean;deleted:boolean;generated:boolean;accurate:boolean;trackStatus:string;eligible:boolean;sessionTimeSeconds:number|null};
export type Stint = {driver:string;number:number|null;compound:string|null;startLap:number;endLap:number;fresh:boolean|null};
export type TrackLayout = {season:number;round:number;slug:string;circuit:string;source:string;fastf1Version:string;reference:{driver:string;lap:number;session:string;lapTimeSeconds:number;sectorTimesSeconds:number[]};startFinish:[number,number];sectors:{number:number;points:[number,number][];anchor:[number,number];end:[number,number]}[]};
export type Race = {season:number;round:number;slug:string;name:string;circuit:string;date:string;totalLaps:number;source:string;sourceUrl?:string;coverage?:'results'|'timing';fastf1Version:string;exportedAt:string;track?:TrackLayout|null;drivers:Driver[];laps:Lap[];stints:Stint[];events:{lap:number|null;timeSeconds:number|null;category:string;message:string}[]};
export function loadRace(season:number,slug:string):Race|null {
 if(!getCalendar(season).some(r=>r.slug===slug))return null;
 try{
  const race:Race=JSON.parse(fs.readFileSync(path.join(process.cwd(),'data',String(season),`${slug}.json`),'utf8'));
  try{
   const track:TrackLayout=JSON.parse(fs.readFileSync(path.join(process.cwd(),'data','tracks',String(season),`${slug}.json`),'utf8'));
   const reference=race.laps.find(lap=>lap.driver===track.reference.driver&&lap.number===track.reference.lap&&!lap.generated);
   const matches=reference&&[reference.sector1,reference.sector2,reference.sector3].every((value,index)=>value!=null&&Math.abs(value-track.reference.sectorTimesSeconds[index])<.02);
   race.track=track.season===season&&track.slug===slug&&track.round===race.round&&matches?track:null;
  }catch{race.track=null;}
  return race;
 }catch{return null;}
}
