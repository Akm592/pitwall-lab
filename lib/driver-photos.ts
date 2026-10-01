import fs from 'node:fs';
import path from 'node:path';

export type DriverPhoto = {
  src: string;
  author: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  title: string;
  changes: string;
  objectPosition?: string;
};
export function loadDriverPhotos(): Record<string, DriverPhoto> {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(),'data/driver-photos.json'),'utf8')); }
  catch { return {}; }
}
export const driverPhotos = loadDriverPhotos();
