import {jsonLd} from '@/lib/seo';

export default function StructuredData({data}: {data: Record<string, unknown>}) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{__html: jsonLd(data)}} />;
}
