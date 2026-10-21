// A generated 20 acre farm (285 m x 285 m) for speed tests. Rules only: a few dozen numbers, not a list of plants.
// density 1 = a normal mixed farm (about 60,000 plants). density 6 = a whole field of corn as well (about 400,000).
export function demoFarm(density=1){
  const blocks=[], B=(o)=>blocks.push(o);
  // apple orchard, north-west: 24 trees x 25 rows (5 m x 4 m)
  B({id:'apples', species:'appleTree', x:-135, z:-135, angle:0, rows:25, cols:24, rowSpacing:4, plantSpacing:5, jitter:0.2, seed:11});
  // citrus block, north-east, rows tilted a little
  B({id:'citrus', species:'citrus', x:30, z:-130, angle:6, rows:16, cols:16, rowSpacing:5, plantSpacing:5, jitter:0.2, seed:12});
  // pumpkins and black futsu on 1.8 m rows
  B({id:'pumpkins', species:'pumpkinVine', x:-135, z:-20, angle:0, rows:34, cols:60, rowSpacing:1.8, plantSpacing:1.6, jitter:0.15, seed:13});
  B({id:'futsu', species:'blackFutsu', x:-135, z:45, angle:0, rows:20, cols:60, rowSpacing:1.8, plantSpacing:1.6, jitter:0.15, seed:14});
  B({id:'butternut', species:'southAnna', x:-30, z:-20, angle:0, rows:34, cols:50, rowSpacing:1.8, plantSpacing:1.8, jitter:0.15, seed:15});
  // pattypan and tomatoes in the home garden
  B({id:'pattypan', species:'pattypan', x:60, z:-20, angle:0, rows:20, cols:60, rowSpacing:1.2, plantSpacing:1, jitter:0.1, seed:16});
  B({id:'tomatoes', species:'tomato', x:60, z:10, angle:0, rows:40, cols:80, rowSpacing:1.2, plantSpacing:0.6, jitter:0.05, seed:17});
  // corn: 0.75 m rows, 0.25 m apart. density 1 = a 100 m x 60 m block
  const cornRows=Math.round(80*density), cornCols=Math.round(240*Math.min(density,1.6));
  B({id:'corn', species:'corn', x:-135, z:105, angle:3, rows:cornRows, cols:cornCols, rowSpacing:0.75, plantSpacing:0.25, jitter:0.03, seed:18});
  B({id:'sunflowers', species:'sunflower', x:70, z:90, angle:0, rows:30, cols:60, rowSpacing:0.9, plantSpacing:0.4, jitter:0.05, seed:20});
  const structures=[ // sheds, tanks and a paddock fence: drawn as simple boxes by the viewer
    {type:'shed', x:100, z:-120, w:12, d:8, h:4}, {type:'shed', x:116, z:-120, w:8, d:8, h:3.5},
    {type:'tank', x:100, z:-100, r:3, h:3}, {type:'tank', x:106, z:-100, r:3, h:3},
    {type:'greenhouse', x:100, z:-80, w:9, d:30, h:3.5},
    {type:'paddock', x:80, z:30, w:60, d:50}
  ];
  return { size:285, bounds:{x0:-142.5,z0:-142.5,x1:142.5,z1:142.5}, blocks:blocks.filter(b=>b.rows>0&&b.cols>0), structures };
}
export const FARM_SPECIES = ['appleTree','citrus','pumpkinVine','blackFutsu','southAnna','pattypan','tomato','corn','sunflower'];
