'use client';

import Image from 'next/image';
import {useState} from 'react';
import type {DriverPhoto as Photo} from '@/lib/driver-photos';

export default function DriverPhoto({photo,name,code,number,sizes,priority=false}:{photo?:Photo;name:string;code:string;number:string;sizes:string;priority?:boolean}){
  const [failed,setFailed]=useState(false);
  const initials=code.length<=3?code:name.split(/\s+/).map(part=>part[0]).slice(0,3).join('').toUpperCase();
  if(!photo||failed)return <div style={{display:'grid',placeContent:'center',height:'100%',textAlign:'center',color:'var(--team)'}} aria-label={`${name}: portrait unavailable`}><strong style={{fontSize:'clamp(64px,10vw,130px)',lineHeight:1}}>{initials}</strong><span>#{number}</span></div>;
  return <Image src={photo.src} alt={name} fill sizes={sizes} priority={priority} style={{objectFit:'cover',objectPosition:photo.objectPosition||'50% 25%'}} onError={()=>setFailed(true)}/>;
}
