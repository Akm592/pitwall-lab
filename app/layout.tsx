import type {Metadata} from 'next';
import Link from 'next/link';
import Image from 'next/image';
import {siteUrl} from '@/lib/site';
import {seasons} from '@/lib/data';
import NavLinks from '@/components/NavLinks';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource-variable/archivo/wdth.css';
import './globals.css';
export const metadata:Metadata={metadataBase:siteUrl,title:{default:'Pitwall Lab — F1 Race Explorer',template:'%s | Pitwall Lab'},description:'Explore Formula 1 race pace, tyre strategy and driver comparisons with real FastF1 data.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en">
<body>
<header className="topbar">
<div className="topbarGlass">
<Link className="brand" href="/races">
<Image src="/brandmark.png" width={30} height={20} alt=""/>PITWALL<span>LAB</span></Link>
<nav aria-label="Main navigation">
<NavLinks/>
</nav>
<span className="season"><i/>{seasons[0]}–{seasons[seasons.length-1]} archive</span>
</div>
</header>{children}</body>
</html>}
