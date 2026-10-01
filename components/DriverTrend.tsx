'use client';
import dynamic from 'next/dynamic';
import {useRouter} from 'next/navigation';
const Plot=dynamic(()=>import('./Plot'),{ssr:false,loading:()=> <div style={{height:280,display:'grid',placeItems:'center',color:'var(--muted)'}}>Loading race results chart…</div>});

export default function DriverTrend({color,season,results}:{color:string;season:number;results:{round:number;slug:string;name:string;position:number|null;status:string}[]}){
 const router=useRouter();
 return <Plot data={[{x:results.map(r=>r.round),y:results.map(r=>r.position),text:results.map(r=>`${r.name}<br>${r.status}`),customdata:results.map(r=>r.slug),type:'scatter',mode:'lines+markers',connectgaps:false,line:{color,width:3},marker:{color,size:9,line:{color:'#edf3ff',width:1}},hovertemplate:'%{text}<br>Position %{y}<extra></extra>'}]} layout={{height:280,autosize:true,paper_bgcolor:'transparent',plot_bgcolor:'transparent',margin:{l:42,r:20,t:24,b:42},font:{family:'Inter, sans-serif',color:'#acbdd9'},showlegend:false,xaxis:{title:{text:'Round'},dtick:1,gridcolor:'#b9d5ff12',zeroline:false},yaxis:{title:{text:'Position'},autorange:'reversed',dtick:2,gridcolor:'#b9d5ff16',zeroline:false},hoverlabel:{bgcolor:'#141d38',font:{color:'#edf3ff'}}}} config={{responsive:true,displayModeBar:false}} useResizeHandler style={{width:'100%',height:280}} onClick={event=>{const point=event.points[0];if(point&&typeof point.customdata==='string')router.push(`/races/${season}/${point.customdata}`)}}/>;
}
