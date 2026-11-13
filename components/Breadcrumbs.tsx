import Link from 'next/link';
import {siteUrl} from '@/lib/site';
import StructuredData from './StructuredData';

export default function Breadcrumbs({items}: {items: {label: string; href: string}[]}) {
  return <>
    <nav className="breadcrumbs" aria-label="Breadcrumb"><ol>{items.map((item, index) => <li key={item.href}>
      {index === items.length - 1 ? <span aria-current="page">{item.label}</span> : <Link href={item.href}>{item.label}</Link>}
    </li>)}</ol></nav>
    <StructuredData data={{'@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: items.map((item, index) => ({'@type': 'ListItem', position: index + 1,
        name: item.label, item: new URL(item.href, siteUrl).href})),
    }} />
  </>;
}
