import fs from 'node:fs';
import path from 'node:path';

export type TeamLogo={src:string;author:string;license:string;licenseUrl:string;sourceUrl:string;title:string;trademark:boolean};
// Written by scripts/sync_team_logos.py. Teams without an entry have no freely licensed logo and show a monogram badge.
export function loadTeamLogos():Record<string,TeamLogo>{
 try{return JSON.parse(fs.readFileSync(path.join(process.cwd(),'data/team-logos.json'),'utf8'));}
 catch{return {};}
}
export const teamLogos=loadTeamLogos();
