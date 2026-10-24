// Lineage Tracker planner: "draw only what you can see" for big plans. Our own code, MIT.
// Pure JavaScript, no graphics library, so it can be tested without a screen.
//
// A plan stores crops as RULES (a block of rows with a spacing and an angle), never one object per plant.
// Each frame, select(view) works out which plants are on screen and how much detail each one deserves:
//   level 0  full detail            (big on screen, and only the nearest few)
//   level 1  reduced copy           (a bit smaller on screen)
//   level 2  simple stand-in        (about 50 triangles)
//   level 3  flat coloured marker   (a few pixels, drawn as one small shape; far fields may be summed up as one marker per group of plants)
//   nothing  off screen, or smaller than a pixel
// Each level has a cap on how many plants and triangles it may use. Plants over the cap fall to the next level,
// the ones furthest from the camera first. The cap depends on the Quality setting (Low, Medium, High, Ultra).

export const QUALITY_NAMES = ['low','medium','high','ultra'];
export const FIELD_QUALITY = {
  //        plants per level                  triangles at once   pixel size where a plant changes level
  low:   { maxFull:6,   maxReduced:40,   maxProxy:2500,  maxMarker:6000,   triBudget:500000,   p0:150, p1:45, p2:12, emit:6, minCell:2   },
  medium:{ maxFull:20,  maxReduced:150,  maxProxy:8000,  maxMarker:20000,  triBudget:1500000,  p0:130, p1:40, p2:10, emit:5, minCell:1   },
  high:  { maxFull:60,  maxReduced:500,  maxProxy:20000, maxMarker:60000,  triBudget:4000000,  p0:110, p1:35, p2:8,  emit:4, minCell:0.5 },
  ultra: { maxFull:160, maxReduced:1500, maxProxy:50000, maxMarker:150000, triBudget:10000000, p0:90,  p1:30, p2:7,  emit:3, minCell:0.25 }
};
const PMIN = 0.6;   // a single plant smaller than this many pixels is not drawn at all

// The Quality choice belongs to the device, not to the plan file, so a plan opens the same on a tablet and a gaming PC.
export function getQuality(){
  try{ const q = localStorage.getItem('ltplanner.quality'); if(QUALITY_NAMES.includes(q)) return q; }catch(e){}
  return 'low';
}
export function setQuality(q){
  if(!QUALITY_NAMES.includes(q)) return getQuality();
  try{ localStorage.setItem('ltplanner.quality', q); }catch(e){}
  return q;
}

// ---- views: what the camera sees, as a ground outline plus "how many pixels is one metre here" ----
// Overhead (orthographic) camera. halfH = half the visible height in metres.
export function orthoView({cx, cz, halfH, aspect, heightPx}){
  const hw = halfH*aspect, k = heightPx/(2*halfH);
  return { poly:[[cx-hw,cz-halfH],[cx+hw,cz-halfH],[cx+hw,cz+halfH],[cx-hw,cz+halfH]], uniform:true, pxAt:()=>k, eye:null };
}
// Perspective camera. eye and target are [x,y,z] in metres, y up.
export function perspView({eye, target, fovDeg, aspect, heightPx, maxDist=600, yMin=0, yMax=0, groundY=null}){
  const f = norm3(sub3(target, eye)), up=[0,1,0];
  let r = cross3(f, up); if(len3(r)<1e-6) r=[1,0,0]; r=norm3(r);
  const u = cross3(r, f), th = Math.tan(fovDeg*Math.PI/360), tw = th*aspect;
  // Where on the plan can something be and still show up in the picture? Plants stand on ground somewhere between yMin and yMax (the lowest and
  // highest ground on the site) and reach up to the top of the tallest plant, so the picture's footprint is the shadow of the view pyramid cut
  // to that slab: the corner rays meet the bottom plane (far side) and the top plane (near side, often right under the camera).
  // Using only a flat plane at ground level (the old way) lost the whole foreground whenever the camera stood on a hill.
  const pts = [];
  for(const [sx,sy] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
    const d = norm3(add3(add3(f, scale3(r, sx*tw)), scale3(u, sy*th)));
    for(const plane of (yMax>yMin ? [yMin, yMax] : [yMin])){
      let t;
      if(plane >= eye[1]) t = 0;                                    // the plane is at or above the camera: this part of the view starts right at the camera
      else if(d[1] < -1e-4) t = Math.min(maxDist, (plane-eye[1])/d[1]);   // the ray comes down to the plane
      else t = maxDist;                                              // looking at or above the horizon: stop at the distance limit
      pts.push([eye[0]+d[0]*t, eye[2]+d[2]*t]);
    }
  }
  if(eye[1] <= yMax) pts.push([eye[0], eye[2]]);                       // the camera's own spot
  const poly = hull(pts);
  const pf = heightPx/(2*th);
  return { poly, uniform:false, eye, pxAt:(x,z)=>{ const dx=x-eye[0], dz=z-eye[2]; const dy=groundY?Math.max(0.5,eye[1]-groundY(x,z)):eye[1], d=Math.sqrt(dx*dx+dz*dz+dy*dy); return pf/Math.max(d,0.5); } };
}
// convex outline of a few points (monotone chain), counter-clockwise
function hull(P){
  const q = P.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]).filter((p,i,a)=>!i||p[0]!==a[i-1][0]||p[1]!==a[i-1][1]);
  if(q.length<3) return q.length?q:[[0,0]];
  const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]); const lo=[], up=[];
  for(const p of q){ while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],p)<=0) lo.pop(); lo.push(p); }
  for(const p of q.slice().reverse()){ while(up.length>=2&&cr(up[up.length-2],up[up.length-1],p)<=0) up.pop(); up.push(p); }
  lo.pop(); up.pop(); return lo.concat(up);
}
const sub3=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], add3=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]], scale3=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const len3=a=>Math.hypot(a[0],a[1],a[2]), norm3=a=>{const l=len3(a)||1;return [a[0]/l,a[1]/l,a[2]/l];};
const cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

function polyBox(poly){ let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity; for(const [x,z] of poly){ if(x<x0)x0=x; if(x>x1)x1=x; if(z<z0)z0=z; if(z>z1)z1=z; } return {x0,z0,x1,z1}; }
// signed distance inside a convex outline (positive = inside); used with a margin so plants half over the edge still count
function polyInside(poly, x, z){
  let best = Infinity, area=0; for(let i=0;i<poly.length;i++){ const [x0,z0]=poly[i], [x1,z1]=poly[(i+1)%poly.length]; area += x0*z1-x1*z0; }
  const sgn = area>=0?1:-1;
  for(let i=0;i<poly.length;i++){ const [x0,z0]=poly[i], [x1,z1]=poly[(i+1)%poly.length]; const ex=x1-x0, ez=z1-z0, l=Math.hypot(ex,ez)||1; const d = sgn*(ex*(z-z0)-ez*(x-x0))/l; if(d<best) best=d; }
  return best;
}

// small stable hash -> 0..1, so a plant keeps its jitter and size from frame to frame
function h01(seed, a, b){ let h = (seed|0) ^ Math.imul(a|0, 374761393) ^ Math.imul(b|0, 668265263); h = Math.imul(h ^ (h>>>13), 1274126177); h ^= h>>>16; return (h>>>0)/4294967296; }

const EMPTY = new Map();
const TRAINED = new Set(['grape','passionfruit','kiwifruit']);   // climbers on posts and wire: their arms must follow the row
export class PlantField {
  // species: { id: { h, r, tris:[full, reduced, proxy, marker] } }  h = height m, r = canopy radius m
  constructor({quality='low', species={}, blocks=[]}={}){
    this.quality = FIELD_QUALITY[quality] ? quality : 'low';
    this.species = {}; this.blocks = [];
    for(const k in species) this.setSpecies(k, species[k]);
    for(const b of blocks) this.addBlock(b);
  }
  setQuality(q){ if(FIELD_QUALITY[q]) this.quality=q; }
  // ground height: a function (x, z) -> metres. Plants stand on it. Without one the ground is flat at 0.
  setGround(fn){ this.ground = typeof fn==='function' ? fn : null; }
  setSpecies(id, s){ this.species[id] = { h:+s.h||1, r:+s.r||0.5, tris:(s.tris||[10000,4000,50,8]).slice(0,4) }; }
  // block rule: { id, species, x, z, angle(deg), rows, cols, rowSpacing, plantSpacing, jitter, seed, sizeVar }
  addBlock(b){
    const c = { id:b.id||('b'+this.blocks.length), species:b.species, x:+b.x||0, z:+b.z||0, angle:+b.angle||0,
      rows:Math.max(1,b.rows|0), cols:Math.max(1,b.cols|0), rowSpacing:+b.rowSpacing||1, plantSpacing:+b.plantSpacing||1,
      jitter:+b.jitter||0, seed:b.seed|0||1, sizeVar:b.sizeVar===undefined?0.1:+b.sizeVar, scale:b.scale>0?+b.scale:1 };
    this.blocks.push(c); return c;
  }
  count(){ let n=0; for(const b of this.blocks) n+=b.rows*b.cols; return n; }
  rules(){ return { blocks:this.blocks.map(b=>({...b})) }; }   // what goes in the plan file

  // world position of plant (r, c) in a block
  pos(b, r, c, out){
    let lx = c*b.plantSpacing, lz = r*b.rowSpacing;
    if(b.jitter){ lx += (h01(b.seed,r,c)-0.5)*2*b.jitter; lz += (h01(b.seed+1,r,c)-0.5)*2*b.jitter; }
    const a = b.angle*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a);
    out[0] = b.x + lx*ca - lz*sa; out[1] = b.z + lx*sa + lz*ca;
  }

  select(view){
    const Q = FIELD_QUALITY[this.quality], t0 = (typeof performance!=='undefined'?performance.now():Date.now());
    const cand = [[],[],[],[]];     // per level: {sp, x, z, rot, sc, px}
    const stats = { considered:0, culled:0, full:0, reduced:0, proxy:0, marker:0, represented:0, demoted:0, thinned:0, tris:0, ms:0, quality:this.quality };
    let rmax = 0; for(const k in this.species) rmax=Math.max(rmax, this.species[k].r);
    const box = polyBox(view.poly), margin = rmax*1.2;
    const tmp=[0,0], T=[Q.p0,Q.p1,Q.p2];
    for(const b of this.blocks){
      const sp = this.species[b.species]; const total=b.rows*b.cols;
      stats.considered += total;
      if(!sp) continue;
      const baseSize = Math.max(2*sp.r, sp.h), size = baseSize*b.scale;
      // block outline (world) vs view outline: quick reject
      const bw=(b.cols-1)*b.plantSpacing, bh=(b.rows-1)*b.rowSpacing, a=b.angle*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a);
      const corners=[[0,0],[bw,0],[bw,bh],[0,bh]].map(([lx,lz])=>[b.x+lx*ca-lz*sa, b.z+lx*sa+lz*ca]), bb=polyBox(corners);
      if(bb.x1+margin<box.x0 || bb.x0-margin>box.x1 || bb.z1+margin<box.z0 || bb.z0-margin>box.z1){ continue; }
      // index range that can be on screen: view box in the block's own axes
      let c0=Infinity,c1=-Infinity,r0=Infinity,r1=-Infinity;
      for(const [vx,vz] of [[box.x0,box.z0],[box.x1,box.z0],[box.x1,box.z1],[box.x0,box.z1]]){
        const dx=vx-b.x, dz=vz-b.z, lx=dx*ca+dz*sa, lz=-dx*sa+dz*ca;
        if(lx<c0)c0=lx; if(lx>c1)c1=lx; if(lz<r0)r0=lz; if(lz>r1)r1=lz; }
      const pm=margin+b.jitter;
      let C0=Math.max(0,Math.floor((c0-pm)/b.plantSpacing)), C1=Math.min(b.cols-1,Math.ceil((c1+pm)/b.plantSpacing));
      let R0=Math.max(0,Math.floor((r0-pm)/b.rowSpacing)), R1=Math.min(b.rows-1,Math.ceil((r1+pm)/b.rowSpacing));
      if(C1<C0||R1<R0) continue;
      const emit=(r,c,s)=>{            // one plant (s=1) or one marker standing for s*s plants
        this.pos(b,r,c,tmp);
        if(polyInside(view.poly,tmp[0],tmp[1]) < -margin){ return; }
        const k=view.pxAt(tmp[0],tmp[1]);
        const vary = (1+(h01(b.seed+7,r,c)-0.5)*2*b.sizeVar)*b.scale;
        const px = baseSize*vary*k*(s>1?s:1);
        if(s===1 && px<PMIN) return;
        const rot = TRAINED.has(b.species) ? -a : h01(b.seed+3,r,c)*6.2832;   // trained vines run along their row; everything else turns at random
        let L = s>1 ? 3 : px>=Q.p0?0 : px>=Q.p1?1 : px>=Q.p2?2 : 3, stay = false;
        if(s===1){   // a plant keeps its detail level until it is clearly past the change point, so moving the camera does not make trees flicker between shapes
          const idx = r*b.cols+c, pm = b._prev || EMPTY, pl = pm.has(idx) ? pm.get(idx) : 3;
          if(pl<L){ if(px >= T[pl]*0.8){ L = pl; stay = true; } }
          else if(pl>L){ if(px < T[pl-1]*1.25){ L = pl; stay = true; } }
          else stay = pl<3;
        }
        cand[L].push({sp:b.species, x:tmp[0], y:this.ground?this.ground(tmp[0],tmp[1]):0, z:tmp[1], rot, sc:vary*(s>1?s:1), px, key:stay?px*1.25:px, blk:s===1?b:null, idx:s===1?r*b.cols+c:-1, cover:s>1?Math.min(s,b.rows-r)*Math.min(s,b.cols-c):1});
      };
      const leaf=(rA,rB,cA,cB)=>{      // plants rA..rB, cA..cB inclusive, all about the same distance away
        const mr=(rA+rB)/2, mc=(cA+cB)/2; this.pos(b,mr,mc,tmp);
        const k=view.pxAt(tmp[0],tmp[1]);
        const sizePx=size*k;
        if(sizePx<PMIN*0.5) return;
        const spacingPx=Math.min(b.rowSpacing,b.plantSpacing)*k;
        const s = spacingPx>=Q.emit ? 1 : Math.max(2,Math.ceil(Q.emit/Math.max(spacingPx,0.01)));
        if(s===1){ for(let r=rA;r<=rB;r++) for(let c=cA;c<=cB;c++) emit(r,c,1); }
        else {
          const rs=Math.ceil(rA/s)*s, cs=Math.ceil(cA/s)*s;      // always the same plants are kept, so the picture does not shimmer
          for(let r=rs;r<=rB;r+=s) for(let c=cs;c<=cB;c+=s) emit(r,c,s);
        }
      };
      const split=(rA,rB,cA,cB)=>{
        const n=(rB-rA+1)*(cB-cA+1);
        if(view.uniform || n<=64){ leaf(rA,rB,cA,cB); return; }
        // rough outside test for a whole group, so a far-off group costs one check
        this.pos(b,(rA+rB)/2,(cA+cB)/2,tmp);
        const half=0.5*Math.hypot((rB-rA+1)*b.rowSpacing,(cB-cA+1)*b.plantSpacing)+margin+b.jitter;
        if(polyInside(view.poly,tmp[0],tmp[1]) < -half) return;
        if(rB-rA>=cB-cA){ const m=(rA+rB)>>1; split(rA,m,cA,cB); split(m+1,rB,cA,cB); }
        else { const m=(cA+cB)>>1; split(rA,rB,cA,m); split(rA,rB,m+1,cB); }
      };
      split(R0,R1,C0,C1);
    }
    // ---- caps: too many at one level -> the smallest on screen drop to the next level ----
    let used = 0; const lim=[Q.triBudget*0.4, Q.triBudget*0.8, Q.triBudget];   // the nearest few may use at most 40% of the triangles, so the middle distance keeps real 3D shapes instead of falling straight to flat specks
    const caps=[Q.maxFull,Q.maxReduced,Q.maxProxy,Q.maxMarker];
    for(let L=0;L<3;L++){
      const list=cand[L]; if(!list.length) continue;
      list.sort((a,b)=>b.key-a.key);
      const keep=[];
      for(const e of list){ const cost=this.species[e.sp].tris[L];
        if(keep.length<caps[L] && used+cost<=lim[L]){ keep.push(e); used+=cost; }
        else { cand[L+1].push(e); stats.demoted++; } }
      cand[L]=keep;
    }
    if(cand[3].length>caps[3]){      // far too many tiny ones: keep an even share
      const list=cand[3], keepN=caps[3], out=[]; const step=list.length/keepN; for(let i=0;i<keepN;i++) out.push(list[Math.floor(i*step)]);
      const f=Math.sqrt(list.length/keepN); for(const e of out){ e.sc*=f; e.cover=Math.round(e.cover*f*f); }   // survivors grow a little so the field has no holes
      stats.thinned += list.length-keepN; cand[3]=out;
    }
    // remember the level each plant ended up drawn at (after the limits), so next frame's hold matches what was on screen
    const fresh = new Map();
    for(let L=0;L<3;L++) for(const e of cand[L]){ if(!e.blk) continue; let m=fresh.get(e.blk); if(!m) fresh.set(e.blk, m=new Map()); m.set(e.idx, L); }
    for(const b of this.blocks){ const nb=fresh.get(b)||EMPTY; if(b._prev!==EMPTY && b._prev!==undefined || nb!==EMPTY) b._prev=nb; }
    // ---- output: one packed array per species and level ----
    const groups=[]; const names=['full','reduced','proxy','marker'];
    for(let L=0;L<4;L++){
      const bySp={}; for(const e of cand[L]) (bySp[e.sp]||(bySp[e.sp]=[])).push(e);
      for(const sp in bySp){ const arr=bySp[sp], data=new Float32Array(arr.length*5);   // x, height, z, turn, size for each plant
        arr.forEach((e,i)=>{ data[i*5]=e.x; data[i*5+1]=e.y; data[i*5+2]=e.z; data[i*5+3]=e.rot; data[i*5+4]=e.sc; stats.represented+=e.cover||1; });
        groups.push({species:sp, level:L, count:arr.length, data});
        stats[names[L]]+=arr.length; stats.tris+=arr.length*this.species[sp].tris[L]; }
    }
    stats.drawn = stats.full+stats.reduced+stats.proxy+stats.marker;
    stats.culled = Math.max(0, stats.considered - stats.represented);
    stats.ms = (typeof performance!=='undefined'?performance.now():Date.now()) - t0;
    return { groups, stats };
  }
}

// ---- ground in tiles: only the tiles on screen exist, and cells get coarser with distance ----
// bounds {x0,z0,x1,z1} of the plan. Returns tiles { x, z, size, cell } (cell = cell width in metres).
export function visibleTiles(view, bounds, quality='low', tile=32){
  const Q=FIELD_QUALITY[quality]||FIELD_QUALITY.low, box=polyBox(view.poly), out=[];
  const tx0=Math.floor(Math.max(bounds.x0,box.x0)/tile), tx1=Math.floor(Math.min(bounds.x1,box.x1)/tile);
  const tz0=Math.floor(Math.max(bounds.z0,box.z0)/tile), tz1=Math.floor(Math.min(bounds.z1,box.z1)/tile);
  let cells=0;
  for(let tz=tz0;tz<=tz1;tz++) for(let tx=tx0;tx<=tx1;tx++){
    const cx=(tx+0.5)*tile, cz=(tz+0.5)*tile;
    if(polyInside(view.poly,cx,cz) < -tile*0.75) continue;
    const k=view.pxAt(cx,cz);                         // pixels per metre
    let cell=Q.minCell; while(cell*k<8 && cell<tile) cell*=2;    // a ground cell is never less than about 8 pixels wide
    cell=Math.min(cell,tile);
    out.push({x:tx*tile, z:tz*tile, size:tile, cell}); cells+=Math.pow(tile/cell,2);
  }
  return { tiles:out, cells };
}
