import Link from 'next/link';
import {notFound} from 'next/navigation';
import {loadRace,getCalendar,seasons} from '@/lib/data';
import Dashboard from '@/components/Dashboard';
import TrackDetails from '@/components/TrackDetails';
import HistoricalRace from '@/components/HistoricalRace';
import type {Metadata} from 'next';
import {driverSeason} from '@/lib/drivers';
import {pageMetadata,raceSummary} from '@/lib/seo';
import {siteUrl} from '@/lib/site';
import Breadcrumbs from '@/components/Breadcrumbs';
type Props={params:Promise<{season:string;slug:string}>};
export function generateStaticParams(){return seasons.filter(season=>season>=2018).flatMap(season=>getCalendar(season).map(r=>({season:String(season),slug:r.slug})));}
export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {season,slug}=await params,entry=getCalendar(Number(season)).find(r=>r.slug===slug);
 if(!entry||String(Number(season))!==season)return pageMetadata('F1 Race Not Found','No recorded race exists at this address.', '/races',false);
 const data=loadRace(Number(season),slug);
 const timing=data&&data.coverage!=='results'&&data.laps.length>0;
 const description=data?(timing?'Compare F1 lap times, race pace and tyre stints for ':'Explore historical F1 race results, starting grids and recorded points for ')+entry.name+' '+season+'.':entry.status==='upcoming'?'F1 schedule for '+entry.name+' '+season+'. Results will follow completed session export.':'Recorded race data is not currently available.';
 const title=data?`${entry.name.replace('Grand Prix','GP')} ${season}: ${timing?'F1 Race Analysis & Lap Times':'F1 Results & Statistics'}`:`${entry.name} ${season}: ${entry.status==='upcoming'?'F1 Schedule':'Data Unavailable'}`;
 const metadata=pageMetadata(title,description,'/races/'+season+'/'+slug,!!data||entry.status==='upcoming');
 const image=new URL(`/races/${season}/${slug}/opengraph-image`,siteUrl).href;
 return {...metadata,openGraph:{...metadata.openGraph,images:[{url:image,width:1200,height:630}]},twitter:{...metadata.twitter,images:[image]}};
}
export default async function RacePage({params}:Props){
 const {season,slug}=await params,calendar=getCalendar(Number(season)),entry=calendar.find(r=>r.slug===slug);
 if(!entry||String(Number(season))!==season)notFound();
 const data=loadRace(Number(season),slug);
 const breadcrumbs=<Breadcrumbs items={[{label:'Home',href:'/'},{label:`${season} F1 races`,href:Number(season)===driverSeason()?'/races':`/races?season=${season}`},{label:entry.name,href:`/races/${season}/${slug}`}]}/>;
 if(data){
   const intro=<>{breadcrumbs}<p className="raceSummary">{raceSummary(data)}</p></>;
   return data.coverage==='results'?<HistoricalRace race={data} years={seasons} intro={intro} trackDetails={<TrackDetails race={data}/>}/>:<Dashboard key={season+'-'+slug} race={data} calendar={calendar} years={seasons} intro={intro} trackDetails={<TrackDetails race={data}/>}/>;
 }
 const upcoming=entry.status==='upcoming';
 return <main className="archive">{breadcrumbs}<p className="eyebrow">{season} · ROUND {entry.round} · {upcoming?'UPCOMING':'DATA UNAVAILABLE'}</p><h1>{entry.name}</h1><p>{entry.circuit}{entry.date&&' · '+new Date(entry.date+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})}</p><p className="muted">{upcoming?'This race is scheduled. Results, lap pace and tyre strategies will appear after completed session data is exported.':'The race snapshot is not currently available. No results or timings are estimated.'}</p><Link href={'/races?season='+season}>Back to the {season} season ↗</Link></main>;
}
