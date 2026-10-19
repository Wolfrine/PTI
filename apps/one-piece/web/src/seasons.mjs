// Japanese home-media season numbering, with every numbered broadcast retained
// in chronological order. Provenance and edition differences: docs/one-piece/SEASONS.md.
const definitions=[
 [1,'East Blue',1,61],
 [2,'Enter the Grand Line',62,77],
 [3,'Drum Island',78,92],
 [4,'Alabasta',93,130],
 [5,'TV Original',131,143],
 [6,'Skypiea',144,195],
 [7,'Naval Fortress & Foxy',196,228],
 [8,'Water Seven',229,263],
 [9,'Enies Lobby',264,336],
 [10,'Thriller Bark',337,381],
 [11,'Sabaody Archipelago',382,407],
 [12,'Amazon Lily',408,421],
 [13,'Impel Down',422,456],
 [14,'Marineford',457,516],
 [15,'Fish-Man Island',517,578],
 [16,'Punk Hazard',579,628],
 [17,'Dressrosa',629,746],
 [18,'Zou',747,782],
 [19,'Whole Cake Island',783,891],
 [20,'Wano Country',892,1088]
];
export const SEASONS=Object.freeze(definitions.map(([number,name,start,end])=>{
 const availableEnd=Math.min(1085,end),missing=Object.freeze(start<=590&&end>=590?[590]:[]);
 return Object.freeze({number,name,start,end,availableEnd,availableCount:Math.max(0,availableEnd-start+1)-missing.length,missing});
}));
export function getSeason(value){return SEASONS.find(s=>s.number===Number(value))??SEASONS[0];}
export function seasonForEpisode(value){const n=Number(value);return Number.isInteger(n)?SEASONS.find(s=>n>=s.start&&n<=s.end)??null:null;}
export function seasonEpisode(value){const season=seasonForEpisode(value);return season?Number(value)-season.start+1:null;}
