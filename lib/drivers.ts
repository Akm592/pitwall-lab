import {getCalendar,loadRace,seasons} from './data';
import type {Driver} from './data';
import {summarize} from './stats';
import {cache} from 'react';

export function driverSeason(value?:string){
 const year=Number(value);
 return seasons.includes(year as typeof seasons[number])?year:2026;
}

export const getDriverProfiles=cache(function getDriverProfiles(season:number){
 const profiles=new Map<string,{driver:Driver;results:{slug:string;name:string;round:number;date:string;hasTiming:boolean;driver:Driver;pace:ReturnType<typeof summarize>}[]}>();
 for(const event of getCalendar(season)){
   const race=loadRace(season,event.slug);
   if(!race)continue;
   for(const driver of race.drivers){
     const profile=profiles.get(driver.code)||{driver,results:[]};
     profile.driver=driver;
     profile.results.push({slug:race.slug,name:race.name,round:race.round,date:race.date,hasTiming:race.coverage!=='results'&&race.laps.length>0,driver,pace:summarize(race.laps.filter(lap=>lap.driver===driver.code))});
     profiles.set(driver.code,profile);
   }
 }
 return [...profiles.values()].map(profile=>{
   const valid=profile.results.filter(result=>result.driver.position!=null&&result.driver.position>0&&!/disqualified|did not start|did not qualify|did not prequalify|withdrawn|excluded/i.test(result.driver.status));
   const points=profile.results.reduce((sum,result)=>sum+(result.driver.points??0),0);
   return {...profile,points,wins:valid.filter(result=>result.driver.position===1).length,podiums:valid.filter(result=>result.driver.position!<=3).length,best:valid.length?Math.min(...valid.map(result=>result.driver.position!)):null,average:valid.length?valid.reduce((sum,result)=>sum+result.driver.position!,0)/valid.length:null,eligibleLaps:profile.results.reduce((sum,result)=>sum+result.pace.count,0)};
 }).sort((a,b)=>b.points-a.points||a.driver.name.localeCompare(b.driver.name));
});
