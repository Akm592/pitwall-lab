import Link from 'next/link';
import {pageMetadata} from '@/lib/seo';

export const metadata=pageMetadata('About Our F1 Data & Race Analysis',
  'Learn how Pitwall Lab compares F1 lap times, race pace and tyre strategies using recorded FastF1, OpenF1 and Jolpica data, with clear coverage limits.', '/about');

export default function About(){return <main className="archive prose">
  <p className="eyebrow">BEHIND THE NUMBERS</p><h1>Understand the race.</h1>
  <p>Pitwall Lab is an independent fan project for exploring completed Formula 1 races. <Link href="/races">Browse F1 race results from 1950 onward</Link>, compare drivers and explore recorded lap times. Upcoming races show their schedule, and missing sessions are clearly marked unavailable.</p>
  <h2>Where does the F1 data come from?</h2>
  <p>Race snapshots use <a href="https://docs.fastf1.dev/">FastF1</a>, <a href="https://openf1.org/">OpenF1</a> and historical classifications from <a href="https://jolpi.ca/">Jolpica</a>. Each race identifies its source. Championship standings use Jolpica and include sprint points; driver and team profiles sum imported race results only. Historical shared drives and championship counting rules can differ from modern conventions.</p>
  <p>Detailed timing is available for selected races from 2018 onward where imported data supports it. Results-only races show classification, grid, status and points; lap, sector and tyre measurements are not reconstructed. Timing can be missing or inaccurate. Missing values remain missing and charts leave gaps.</p>
  <h2>What is F1 race pace?</h2>
  <p>Race pace describes lap times over a race rather than a single qualifying lap. Our default eligible pace analysis includes accurate, non-deleted, non-generated laps with green track status and excludes pit in and out laps. Green status does not mean dry weather. Median pace and consistency describe observed laps; they do not isolate driver skill, fuel load or traffic effects.</p>
  <h2>How do I compare F1 lap times?</h2>
  <p>Open a race with detailed timing in the <Link href="/races">race archive</Link>, then select drivers in the comparison view. Lower lap times mean faster laps. Compare tyre compounds and stint lengths alongside the timing: drivers may have raced in different track conditions or used different strategies.</p>
  <h2>How do I read tyre strategy and position charts?</h2>
  <p>Tyre timelines show recorded compounds and stint lengths, helping explain pit-stop choices and changes in lap pace. They include all recorded stints. Position charts show recorded running position, not a reconstructed order between timing samples. This site analyses archived races; it does not provide live timing or strategy predictions.</p>
</main>}
