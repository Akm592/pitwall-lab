import fs from 'node:fs';
import path from 'node:path';

type Standing = {position: number; name: string; points: number; wins: number};
export type Championship = {
  season: number; round: number; source: string; sourceUrl: string; exportedAt: string;
  drivers: (Standing & {code: string; team: string})[];
  constructors: (Standing & {id: string})[];
};

export function loadStandings(season: number): Championship | null {
  try {
    const data: Championship = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', String(season), 'standings.json'), 'utf8'));
    if (data.season !== season || !Number.isInteger(data.round) || data.round < 1
      || !data.drivers?.length || !data.constructors?.length
      || ![...data.drivers, ...data.constructors].every(row => Number.isInteger(row.position)
        && row.position > 0 && typeof row.name === 'string' && Number.isFinite(row.points) && row.points >= 0)) return null;
    return data;
  } catch { return null; }
}
