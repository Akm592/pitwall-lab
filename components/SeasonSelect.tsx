'use client';
import {useRouter} from 'next/navigation';

export default function SeasonSelect({season,years,href}:{season:number;years:readonly number[];href:string}){
 const router=useRouter();
 return <label className="seasonPicker">Season <select value={season} onChange={event=>router.push(`${href}?season=${event.target.value}`)}>{[...years].reverse().map(year=><option key={year} value={year}>{year}</option>)}</select></label>;
}
