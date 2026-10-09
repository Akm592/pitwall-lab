import manifest from '@/data/team-logos.json';

export type TeamLogo={src:string;author:string;license:string;licenseUrl:string;sourceUrl:string;title:string;trademark:boolean;background?:'dark'};
// Written by scripts/sync_team_logos.py. Teams without an imported logo show a monogram badge.
export function loadTeamLogos():Record<string,TeamLogo>{
 return manifest as Record<string,TeamLogo>;
}
export const teamLogos=loadTeamLogos();
