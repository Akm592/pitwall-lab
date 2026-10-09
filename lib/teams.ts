import {getCalendar,loadRace,seasons} from './data';
import type {Driver} from './data';
import {cache} from 'react';

const unclassified=/disqualified|did not start|did not qualify|did not prequalify|withdrawn|excluded/i;
export const teamSlug=(name:string)=>name.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'team';
export const classifiedPosition=(driver:Driver)=>driver.position!=null&&driver.position>0&&!unclassified.test(driver.status)?driver.position:null;

export type TeamResult={slug:string;name:string;round:number;date:string;entries:Driver[];points:number;best:number|null};
// Teams are grouped by the team name recorded for each race entry, so a driver who changes team mid-season appears under both.
export const getTeamProfiles=cache(function getTeamProfiles(season:number){
 type Team={name:string;slug:string;color:string;results:TeamResult[];drivers:Map<string,{driver:Driver;points:number;races:number;best:number|null}>};
 const teams=new Map<string,Team>();
 if(!seasons.includes(season))return [];
 for(const event of getCalendar(season)){
   const race=loadRace(season,event.slug);
   if(!race)continue;
   for(const driver of race.drivers){
     if(!driver.team)continue;
     const slug=teamSlug(driver.team),team:Team=teams.get(slug)||{name:driver.team,slug,color:driver.color,results:[],drivers:new Map()};
     team.name=driver.team;team.color=driver.color||team.color;
     let result=team.results.find(item=>item.slug===race.slug);
     if(!result){result={slug:race.slug,name:race.name,round:race.round,date:race.date,entries:[],points:0,best:null};team.results.push(result);}
     const position=classifiedPosition(driver);
     result.entries.push(driver);result.points+=driver.points??0;
     if(position!=null)result.best=result.best==null?position:Math.min(result.best,position);
     const seat=team.drivers.get(driver.code)||{driver,points:0,races:0,best:null};
     seat.driver=driver;seat.points+=driver.points??0;seat.races++;
     if(position!=null)seat.best=seat.best==null?position:Math.min(seat.best,position);
     team.drivers.set(driver.code,seat);teams.set(slug,team);
   }
 }
 return [...teams.values()].map(team=>{
   const positions=team.results.flatMap(result=>result.entries.map(classifiedPosition).filter((value):value is number=>value!=null));
   return {...team,drivers:[...team.drivers.values()].sort((a,b)=>b.points-a.points||b.races-a.races),points:team.results.reduce((sum,result)=>sum+result.points,0),
    wins:positions.filter(position=>position===1).length,podiums:positions.filter(position=>position<=3).length,best:positions.length?Math.min(...positions):null,
    doubles:team.results.filter(result=>result.entries.filter(entry=>(entry.points??0)>0).length>=2).length};
 }).sort((a,b)=>b.points-a.points||b.wins-a.wins||a.name.localeCompare(b.name));
});
