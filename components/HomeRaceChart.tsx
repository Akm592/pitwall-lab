'use client';

import dynamic from 'next/dynamic';
import type {racePreview} from '@/lib/home';
import {time} from '@/lib/stats';
import styles from '../app/home.module.css';

const Plot = dynamic(() => import('./Plot'), {ssr: false,
  loading: () => <div className={styles.chartLoading} role="status">Loading recorded lap pace…</div>});

export default function HomeRaceChart({series}: {series: ReturnType<typeof racePreview>}) {
  const values = series.flatMap(driver => driver.laps.flatMap(lap => lap.seconds == null ? [] : [lap.seconds]));
  if (!values.length) return <p className={styles.chartLoading}>Detailed lap timing is not available for this race. Explore the recorded results below.</p>;
  const low = Math.floor(Math.min(...values) / 5) * 5;
  const high = Math.max(low + 5, Math.ceil(Math.max(...values) / 5) * 5);
  const step = Math.max(5, Math.ceil((high - low) / 5 / 5) * 5);
  const ticks = Array.from({length: Math.floor((high - low) / step) + 1}, (_, index) => low + index * step);
  return <div className={styles.chart} aria-label={`Recorded lap pace for ${series.map(driver => driver.name).join(' and ')}. Lower lap times are faster.`}>
    <Plot data={series.map((driver, index) => ({
      x: driver.laps.map(lap => lap.number), y: driver.laps.map(lap => lap.seconds),
      name: driver.code, type: 'scatter' as const, mode: 'lines+markers' as const,
      connectgaps: false, line: {color: driver.color, width: 2.5,
        dash: index > 0 && series[0].color === driver.color ? 'dash' as const : 'solid' as const},
      marker: {size: 4}, hovertemplate: 'Lap %{x}<br>%{y:.3f} seconds<extra>%{fullData.name}</extra>',
    }))} layout={{autosize: true, height: 250, paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
      font: {family: 'Inter, sans-serif', color: '#c9c6c1', size: 13},
      margin: {l: 60, r: 12, t: 16, b: 45}, showlegend: false, hovermode: 'x unified',
      hoverlabel: {bgcolor: '#222226', font: {color: '#f5f3ee'}},
      xaxis: {title: {text: 'Lap'}, gridcolor: '#ffffff14', zeroline: false, fixedrange: true},
      yaxis: {title: {text: 'Lap time', standoff: 10}, gridcolor: '#ffffff14', zeroline: false,
        tickvals: ticks, ticktext: ticks.map(value => time(value)), fixedrange: true},
    }} config={{responsive: true, displayModeBar: false, scrollZoom: false}}
      useResizeHandler style={{width: '100%', height: 250}} />
  </div>;
}
