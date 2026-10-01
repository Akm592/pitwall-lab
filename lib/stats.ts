import type {Lap} from './data';
export function median(values:number[]){if(!values.length)return null;
const s=[...values].sort((a,b)=>a-b),m=Math.floor(s.length/2);
return s.length%2?s[m]:(s[m-1]+s[m])/2;}
export function time(value:number|null|undefined){if(value==null||!Number.isFinite(value))return '—';
const milliseconds=Math.round(value*1000);
return `${Math.floor(milliseconds/60000)}:${((milliseconds%60000)/1000).toFixed(3).padStart(6,'0')}`;}
export function summarize(laps:Lap[]){const eligible=laps.filter(l=>l.eligible&&l.timeSeconds!=null),values=eligible.map(l=>l.timeSeconds as number),mean=values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
return {count:values.length,median:median(values),fastest:eligible.reduce<Lap|null>((best,l)=>!best||(l.timeSeconds as number)<(best.timeSeconds as number)?l:best,null),deviation:values.length?Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/values.length):null,sectors:[1,2,3].map(s=>median(eligible.map(l=>l[`sector${s}` as 'sector1']).filter((v):v is number=>v!=null)))};}
