'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';

const links=[['/races','Races'],['/drivers','Drivers'],['/teams','Teams'],['/about','About']];
export default function NavLinks(){
 const pathname=usePathname();
 return <>{links.map(([href,label])=><Link key={href} href={href} aria-current={pathname===href||pathname.startsWith(`${href}/`)?'page':undefined}>{label}</Link>)}</>;
}
