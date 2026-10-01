import type {Metadata} from 'next';
import Link from 'next/link';
import Image from 'next/image';
import {siteUrl} from '@/lib/site';
import {seasons} from '@/lib/data';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './globals.css';
export const metadata:Metadata={metadataBase:siteUrl,title:{default:'Pitwall Lab — F1 Race Explorer',template:'%s | Pitwall Lab'},description:'Explore Formula 1 race pace, tyre strategy and driver comparisons with real FastF1 data.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en">
<body>
<header className="topbar">
<Link className="brand" href="/races">
<Image src="/brandmark.png" width={30} height={20} alt=""/>PITWALL LAB</Link>
<span className="tagline">F1 RACE EXPLORER</span>
<nav aria-label="Main navigation">
<span className="season">{seasons[0]}–{seasons[seasons.length-1]}</span>
<Link href="/races">Races</Link>
<Link href="/drivers">Drivers</Link>

<Link href="/about">About</Link>
</nav>
</header>{children}</body>
</html>}
