import {notFound} from 'next/navigation';
import {ImageResponse} from 'next/og';
import {loadRace,getCalendar} from '@/lib/data';

export const alt = 'Pitwall Lab race results and strategy';
export const size = {width: 1200, height: 630};
export const contentType = 'image/png';

export default async function OpenGraphImage({params}: {params: Promise<{season:string;slug: string}>}) {
  const {season,slug} = await params;
  const race = loadRace(Number(season),slug);
  const entry = getCalendar(Number(season)).find(r=>r.slug===slug);
  if(!entry||String(Number(season))!==season)notFound();
  return new ImageResponse(
    <div style={{display: 'flex', flexDirection: 'column', background: '#0c1218', color: '#f2f4f6', width: '100%', height: '100%', padding: 70}}>
      <div style={{display: 'flex', color: '#7ad7ef', fontSize: 28, letterSpacing: 4}}>PITWALL LAB · F1 RACE EXPLORER</div>
      <div style={{display: 'flex', fontSize: 68, fontWeight: 700, marginTop: 42}}>{race?.name || entry?.name || 'Race explorer'}</div>
      <div style={{display: 'flex', fontSize: 32, color: '#b7c1cd', marginTop: 18}}>{season} · {race?(race.coverage==='results'?'Historical race classification':'Results, lap pace and tyre strategy'):entry?.status==='upcoming'?'Upcoming Grand Prix':'Race data unavailable'}</div>
      <div style={{display: 'flex', marginTop: 60, gap: 28}}>
        {race?.drivers.slice(0, 3).map((driver,index) => <div key={index} style={{display: 'flex', flexDirection: 'column', borderLeft: `5px solid ${driver.color}`, paddingLeft: 18, width: 320}}><span style={{fontSize: 22, color: '#b7c1cd'}}>P{driver.position}</span><span style={{fontSize: 28, marginTop: 10}}>{driver.name}</span></div>)}
      </div>
    </div>, size,
  );
}
