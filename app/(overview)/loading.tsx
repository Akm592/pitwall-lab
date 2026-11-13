import RaceLights from '@/components/RaceLights';

// Keep unknown profile/race URLs outside this streaming boundary so they retain HTTP 404.
export default function OverviewLoading() {
  return <main><RaceLights page label="Loading Pitwall Lab…"/></main>;
}
