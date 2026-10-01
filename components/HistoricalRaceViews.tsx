'use client';
import {useEffect,useState,type ReactNode} from 'react';
import styles from './Dashboard.module.css';
export default function HistoricalRaceViews({overview,track}:{overview:ReactNode;track:ReactNode}){
 const [tab,setTab]=useState('overview');
 useEffect(()=>{const sync=()=>setTab(new URLSearchParams(window.location.search).get('tab')==='track'?'track':'overview');sync();window.addEventListener('popstate',sync);return ()=>window.removeEventListener('popstate',sync);},[]);
 function select(value:string){const query=new URLSearchParams(window.location.search);query.set('tab',value);window.history.replaceState(null,'',window.location.pathname+'?'+query+window.location.hash);setTab(value);}
 return <><nav className={styles.tabs} aria-label="Race views">{['overview','track'].map(value=><button key={value} aria-current={tab===value?'page':undefined} className={tab===value?styles.active:''} onClick={()=>select(value)}>{value==='track'?'Track':'Overview'}</button>)}</nav>{tab==='track'?track:overview}</>;
}
