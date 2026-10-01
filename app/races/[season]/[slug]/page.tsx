import Link from 'next/link';
import {notFound} from 'next/navigation';
import {loadRace,getCalendar,seasons} from '@/lib/data';
import Dashboard from '@/components/Dashboard';
import TrackDetails from '@/components/TrackDetails';
import HistoricalRace from '@/components/HistoricalRace';
import type {Metadata} from 'next';
type Props={params:Promise<{season:string;slug:string}>};
export function generateStaticParams(){return seasons.filter(season=>season>=2018).flatMap(season=>getCalendar(season).map(r=>({season:String(season),slug:r.slug})));}
export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {season,slug}=await params,entry=getCalendar(Number(season)).find(r=>r.slug===slug);
 if(!entry)return {title:'Race not found'};
 const data=loadRace(Number(season),slug),description=data?(data.coverage==='results'?'Historical race classification, grid, status and race points for ':'Explore results, lap pace and tyre stints for ')+entry.name+' '+season+'.':entry.status==='upcoming'?'Schedule for '+entry.name+' '+season+'. Results will follow completed session export.':'Recorded race data is not currently available.';
 return {title:entry.name+' '+season,description,alternates:{canonical:'/races/'+season+'/'+slug},openGraph:{title:entry.name+' '+season+' | Pitwall Lab',description,images:[{url:'/races/'+season+'/'+slug+'/opengraph-image',width:1200,height:630}]}};
}
export default async function RacePage({params}:Props){
 const {season,slug}=await params,calendar=getCalendar(Number(season)),entry=calendar.find(r=>r.slug===slug);
 if(!entry||String(Number(season))!==season)notFound();
 const data=loadRace(Number(season),slug);
 if(data)return data.coverage==='results'?<HistoricalRace race={data} years={seasons} trackDetails={<TrackDetails race={data}/>}/>:<Dashboard key={season+'-'+slug} race={data} calendar={calendar} years={seasons} trackDetails={<TrackDetails race={data}/>}/>;
 const upcoming=entry.status==='upcoming';
 return <main className="archive"><p className="eyebrow">{season} · ROUND {entry.round} · {upcoming?'UPCOMING':'DATA UNAVAILABLE'}</p><h1>{entry.name}</h1><p>{entry.circuit}{entry.date&&' · '+new Date(entry.date+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})}</p><p className="muted">{upcoming?'This race is scheduled. Results, lap pace and tyre strategies will appear after completed session data is exported.':'The race snapshot is not currently available. No results or timings are estimated.'}</p><Link href={'/races?season='+season}>Back to the {season} season ↗</Link></main>;
}
