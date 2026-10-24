// Lineage Tracker plant generator (lab). MIT, see LICENSE. Our own code.
// spec -> one merged BufferGeometry (vertex colours). Same spec + seed = same plant.
import * as THREE from './vendor/three.module.js';
export const SPEC_VERSION = 2;
// Quality levels: how much detail one plant gets. 'low' is the default and is what a tablet runs.
// seg = tube sides, leaf = leaf grid rows/columns, fruit = fruit grid, dens = leaves per twig.
// 'lod1' is the cheaper copy used for plants a little way from the camera (never chosen by the person).
export const QUALITY_LEVELS = ['low','medium','high','ultra'];
export const PROFILES = {
  lod1:{seg:0.6,leaf:0.35,fruit:0.5,dens:0.4,big:1.7},
  low:{seg:1,leaf:0.6,fruit:0.7,dens:0.7,big:1.2},
  medium:{seg:1.25,leaf:1,fruit:1,dens:1},
  high:{seg:2,leaf:1.6,fruit:1.5,dens:1.4},
  ultra:{seg:3,leaf:2.4,fruit:2.2,dens:2}
};
const rnd=(x,min)=>Math.max(min,Math.round(x));

function rng(seed){ let s = seed>>>0 || 1; return ()=>{ s^=s<<13; s>>>=0; s^=s>>>17; s^=s<<5; s>>>=0; return s/4294967296; }; }
const V = (x,y,z)=>new THREE.Vector3(x,y,z);
const UP = V(0,1,0);
function hex(c){ const k=new THREE.Color(c); return [k.r,k.g,k.b]; }
function mix(a,b,t){ return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]; }
const sstep=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
function frame(f){ const a=Math.abs(f.y)>0.95?V(1,0,0):UP; const s=f.clone().cross(a).normalize(); const n=s.clone().cross(f).normalize(); return {s,n}; }

// leaf outline presets: a,b shape the width curve, serr = edge teeth, notch = heart base
const SHAPES = {
  ovate:{a:0.8,b:0.8,serr:0.04,notch:0},
  heart:{a:0.55,b:0.85,serr:0.03,notch:0.35},
  strap:{a:0.22,b:0.55,serr:0,notch:0},
  oval:{a:0.9,b:0.7,serr:0.07,notch:0},
  lanceolate:{a:0.6,b:0.75,serr:0.02,notch:0},
  lobed:{a:0.85,b:0.8,serr:0,notch:0,lobes:6,lobeDepth:0.28},
  round:{a:0.7,b:0.55,serr:0.015,notch:0},
  spoon:{a:1.25,b:0.6,serr:0.01,notch:0},
  paddle:{a:1,b:0.2,serr:0,notch:0},
  serrate:{a:0.6,b:0.75,serr:0.14,notch:0}   // deeply toothed narrow leaflet (cannabis)   // banana: long blade with nearly straight sides
};

class Mesh {
  constructor(q){ this.p=[]; this.c=[]; this.i=[]; this.q=q||PROFILES.low; this.cure=0; }
  vert(v,c){ this.p.push(v.x,v.y,v.z); this.c.push(c[0],c[1],c[2]); return this.p.length/3-1; }
  tri(a,b,c){ this.i.push(a,b,c); }
  tube(pts, r0, r1, col, seg=5){
    seg=rnd(seg*this.q.seg,3); let prev=null;
    for(let k=0;k<pts.length;k++){
      const t=k/(pts.length-1), r=r0+(r1-r0)*t;
      const d = pts[Math.min(k+1,pts.length-1)].clone().sub(pts[Math.max(k-1,0)]).normalize();
      const a = Math.abs(d.y)<0.9?V(0,1,0):V(1,0,0);
      const u=a.clone().cross(d).normalize(), w=d.clone().cross(u);
      const ring=[];
      for(let s=0;s<seg;s++){ const th=s/seg*Math.PI*2; ring.push(this.vert(pts[k].clone().addScaledVector(u,Math.cos(th)*r).addScaledVector(w,Math.sin(th)*r), mix(col,[0.2,0.15,0.1],t*0.3))); }
      if(prev) for(let s=0;s<seg;s++){ const n=(s+1)%seg; this.tri(prev[s],prev[n],ring[s]); this.tri(prev[n],ring[n],ring[s]); }
      prev=ring;
    }
  }
  // grid leaf: T rows along the leaf, S columns across. detail 0 = tiny (trees), 1 = hero
  // leaf patterns (variegation): pattern = {kind: 'edge' | 'centre' | 'ring' | 'speckle' | 'veins', color, amount}; p = {t: along the leaf 0-1, a: across 0 (middle) - 1 (edge), v: vein strength 0-1, th: angle (round leaves)}
  patMix(cc,pt,p){
    if(!pt) return cc; let w=0; const {t,a}=p;
    if(pt.kind==='edge') w=sstep(0.55,0.95,a)*0.9+sstep(0.88,1,t)*0.5;
    else if(pt.kind==='centre') w=(1-sstep(0.18,0.62,a))*sstep(0.04,0.3,t)*(1-sstep(0.62,0.98,t));
    else if(pt.kind==='ring'){ const r=Math.hypot(a,(t-0.45)*1.35); w=Math.exp(-Math.pow((r-0.52)/0.13,2)); }
    else if(pt.kind==='speckle'){ const h=Math.sin(t*37+a*9+(p.th||0)*3)*Math.sin(t*23-a*17+1.7); w=sstep(0.45,0.7,h); }
    else if(pt.kind==='veins') w=Math.max(p.v||0,Math.max(0,1-a*9)*0.9);
    return mix(cc,pt.rgb,Math.max(0,Math.min(1,w*pt.amount)));
  }
  leaf(pos, dir, size, col, o={}){
    const sh=SHAPES[o.shape||'ovate'], f=dir.clone().normalize(), {s,n}=frame(f);
    if(o.shape==='palmate') return this.palmate(pos,f,s,n,size,col,o);
    const T=rnd((o.detail?10:4)*this.q.leaf,2),   // at least 2 steps: with 1 the blade has no width (both ends are points) and the leaf vanishes
          S=rnd((o.detail?7:3)*this.q.leaf,1), wide=o.wide||0.5, fold=o.fold===undefined?0.25:o.fold, droop=o.droop===undefined?0.25:o.droop, wave=o.wave||0, veins=o.veins||5;
    const dark=mix(col,[0,0.05,0],0.35), light=mix(col,[1,1,0.75],0.38);
    const rows=[];
    for(let r=0;r<=T;r++){
      const t=r/T; let w=wide*0.5*Math.pow(Math.max(0,Math.sin(Math.PI*Math.pow(t,sh.a))),sh.b);
      if(sh.notch) w*=1-sh.notch*Math.exp(-t*t/0.012)*0.0+0; 
      if(sh.lobes) w*=1-sh.lobeDepth*(0.5-0.5*Math.cos(t*Math.PI*2*sh.lobes));
      if(sh.serr) w*=1+sh.serr*Math.sin(t*38);
      // spine curves down toward the tip
      const base=pos.clone().addScaledVector(f,size*t).addScaledVector(n,-droop*size*t*t);
      const row=[];
      for(let c=0;c<=S;c++){
        const u=(c/S)*2-1, au=Math.abs(u);
        let off=n.clone().multiplyScalar(fold*size*w*au*1.2 + wave*size*0.03*Math.sin(t*11+u*2.5)*au + (o.ruffle||0)*size*0.07*Math.sin(t*23+u*4)*au*au*sstep(0.1,0.5,t));   // ruffle: frilly edges (lettuce, kale)
        // heart-shaped base: pull the base corners back
        let tf=0; if(sh.notch) tf=sh.notch*size*0.45*Math.exp(-t*t/0.02)*au;
        const P=base.clone().addScaledVector(s,u*w*size*2).add(off).addScaledVector(f,-tf);
        let cc=mix(dark,col,sstep(0,0.22,t)); 
        cc=mix(cc,o.midrib||light,Math.max(0,1-au*7)*(o.midrib?0.9:0.7)*(S>=4?1:0.3));   // midrib (coloured on chard and beetroot); faint on coarse leaves, where the middle column is a big share
        cc=mix(cc,light,0.12*Math.max(0,Math.sin((t*veins*Math.PI*2)+au*5)) *(1-au)); // side veins
        cc=mix(cc,dark,sstep(0.75,1,au)*0.35);                                       // edge
        if(o.pat) cc=this.patMix(cc,o.pat,{t,a:au,v:Math.pow(Math.max(0,Math.sin((t*veins*Math.PI*2)+au*5)),6)*(1-au)});
        row.push(this.vert(P,cc));
      }
      rows.push(row);
    }
    for(let r=0;r<T;r++) for(let c=0;c<S;c++){ this.tri(rows[r][c],rows[r][c+1],rows[r+1][c]); this.tri(rows[r][c+1],rows[r+1][c+1],rows[r+1][c]); }
  }
  // round lobed leaf (pumpkin, squash, gourd): polar grid, 5 lobes, notched base
  palmate(pos,f,s,n,size,col,o){
    const K=rnd((o.detail?30:12)*this.q.leaf,6), Rn=rnd((o.detail?5:2)*this.q.leaf,1), lobes=o.lobes||5, sinus=o.sinus===undefined?0.3:o.sinus, cup=o.fold===undefined?0.3:o.fold, droop=o.droop===undefined?0.15:o.droop;
    const centre=pos.clone().addScaledVector(f,size*0.5);
    const dark=mix(col,[0,0.05,0],0.4), light=mix(col,[1,1,0.7],0.4);
    const rings=[]; const cv=this.vert(centre.clone().addScaledVector(n,cup*size*0.0),mix(col,light,0.4));
    for(let k=1;k<=Rn;k++){ const q=k/Rn, ring=[];
      for(let j=0;j<K;j++){ const th=j/K*Math.PI*2-Math.PI*0 ;
        const lobeR=1-sinus*(0.5-0.5*Math.cos(lobes*th));
        const baseNotch=1-0.62*Math.exp(-Math.pow((Math.PI-Math.abs(((th+Math.PI)%(2*Math.PI))-Math.PI))/0.28,2));
        const rr=size*0.5*lobeR*baseNotch*q*1.05;
        const P=centre.clone().addScaledVector(f,Math.cos(th)*rr).addScaledVector(s,Math.sin(th)*rr).addScaledVector(n,cup*size*q*q*0.35-droop*size*q*q*0.2*(1+Math.cos(th))*0.5);
        const vein=Math.max(...[...Array(lobes).keys()].map(m=>{ let d=Math.abs(((th-m*2*Math.PI/lobes+Math.PI*3)%(2*Math.PI))-Math.PI); d=Math.PI-d; return Math.exp(-d*d/0.015);}));
        let cc=mix(col,light,vein*0.55*(1-q*0.4)); cc=mix(cc,dark,sstep(0.7,1,q)*0.3);
        if(o.pat) cc=this.patMix(cc,o.pat,{t:q,a:q,v:vein,th});
        ring.push(this.vert(P,cc)); }
      rings.push(ring); }
    for(let j=0;j<K;j++){ const nx=(j+1)%K; this.tri(cv,rings[0][nx],rings[0][j]); }
    for(let k=0;k<Rn-1;k++) for(let j=0;j<K;j++){ const nx=(j+1)%K; this.tri(rings[k][j],rings[k][nx],rings[k+1][j]); this.tri(rings[k][nx],rings[k+1][nx],rings[k+1][j]); }
  }
  // a round head (cabbage, cauliflower curd, broccoli, onion bulb, beetroot shoulder): squashed sphere with bumps; vein arcs for cabbage
  ball(c, rx, ry, c1, c2, o={}){
    const W=rnd(18*this.q.fruit,8), H=rnd(10*this.q.fruit,5), rows=[], bumps=o.bumps||0, freq=o.freq||9, veins=o.veins||0, half=o.half?0.55:1;
    for(let y=0;y<=H;y++){ const v=y/H*half, th=v*Math.PI, row=[];
      for(let x=0;x<W;x++){ const ph=x/W*Math.PI*2, b=bumps?bumps*(0.5+0.5*Math.sin(ph*freq+Math.sin(th*freq*0.7)*2)*Math.sin(th*freq*0.8+ph*1.7)):0, r=Math.sin(th)*(1+b);
        let cc=mix(c1,c2,0.5+0.5*Math.cos(th)); if(bumps) cc=mix(cc,[0.1,0.1,0.05],Math.max(0,-b/bumps)*0.35);
        if(veins) cc=mix(cc,mix(c2,[1,1,0.9],0.4),Math.pow(Math.max(0,Math.cos(ph*veins+th*2.2)),18)*0.6);
        row.push(this.vert(V(c.x+Math.cos(ph)*rx*r, c.y+Math.cos(th)*ry*(1+b*0.5), c.z+Math.sin(ph)*rx*r),cc)); }
      rows.push(row); }
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const n=(x+1)%W; this.tri(rows[y][x],rows[y][n],rows[y+1][x]); this.tri(rows[y][n],rows[y+1][n],rows[y+1][x]); }
  }
  fruit(pos, fs, ripe, R){
    const sh=fs.shape, sz=fs.size*(0.3+0.7*ripe);
    if(sh.kind==='head') return this.head(pos,fs,sz,R);
    const c1=hex(fs.colorUnripe||'#5f9a3a'), c2=hex(fs.colorRipe), c3=hex(fs.colorSecondary||fs.colorRipe);
    let base=mix(c1,c2,Math.min(1,ripe*1.15)); if(this.cure&&fs.colorCured) base=mix(base,hex(fs.colorCured),this.cure);
    const qf=this.q.fruit*Math.min(1,Math.max(0.3,fs.size/0.07));   // small fruit (olives, cherries, berries) need far fewer triangles
    const W0=sh.ribs>0||sh.kernels?28:20, W=Math.max(sh.ribs>1?8:6,sh.ribs>1?Math.max(rnd(W0*qf,6),sh.ribs*3):rnd(W0*qf,6)), H=rnd(16*qf,4), rows=[];
    const blushAng=R()*6.28, grooveShade=sh.grooveShade===undefined?0.3:sh.grooveShade;
    for(let y=0;y<=H;y++){ const v=y/H, th=v*Math.PI, row=[];
      for(let x=0;x<W;x++){ const ph=x/W*Math.PI*2;
        let prof=Math.pow(Math.max(0,Math.sin(th)),sh.fullness||0.75);                // fullness: <1 boxy, >1 pointed
        if(sh.neck) prof=(sh.neck+(1-sh.neck)*sstep(0.42,0.75,v))*Math.pow(Math.max(0,Math.sin(th)),0.4);   // butternut: narrow neck, round bulb
        let rib=0; if(sh.ribs) rib=Math.cos(ph*sh.ribs);
        if(sh.kernels) rib=Math.cos(ph*sh.kernels)*Math.cos(th*10)*0.4;
        let rad=0.5*sh.width*prof*(1+sh.ribDepth*rib);
        if(sh.warts) rad*=1+sh.warts*Math.max(0,Math.sin(ph*13+th*7)*Math.sin(ph*5-th*17))*Math.sin(th);   // bumpy skin
        rad*=1+(v<0.5?sh.taperTop*(v-0.5):sh.taperBottom*(0.5-v))*0.0;   // simple
        rad*=1-(v<0.5? sh.taperTop*(0.5-v) : sh.taperBottom*(v-0.5))*1.0;
        let yy=(sh.neck?(0.5-v):Math.cos(th)*0.5)*sh.height;
        // dimples where stem and flower end sit
        yy-= (v<0.2? 1:0)*sh.dimple*0.07*Math.exp(-v*v/0.004)*sh.height;
        yy+= (v>0.8? 1:0)*sh.dimple*0.05*Math.exp(-(1-v)*(1-v)/0.004)*sh.height;
        const shade=1-grooveShade*(rib<0?-rib:0)*0.0 - grooveShade*0.4*Math.max(0,-rib);
        let cc=mix(base,[0.05,0.05,0.05],(1-shade)*0.9);
        if(sh.blush){ const b=sstep(-0.3,0.8,Math.cos(ph-blushAng)); cc=mix(cc,c3,b*sh.blush*Math.min(1,ripe*1.2)); }
        if(sh.stripes){ const st=sstep(0.3,0.5,Math.cos(ph*sh.stripes)); cc=mix(cc,c3,st*0.7); }
        if(sh.scales){ const sc=Math.sin(ph*sh.scales+th*sh.scales*1.4)*Math.sin(ph*sh.scales-th*sh.scales*1.4); cc=mix(cc,[0.15,0.1,0.02],sstep(0.2,0.9,-sc)*0.45); cc=mix(cc,c3,sstep(0.5,1,sc)*0.3); }   // pineapple eyes
        if(sh.tip) { yy-=sh.tip*0.09*sh.height*Math.exp(-(1-v)*(1-v)/0.006); rad*=1-0.25*sh.tip*Math.exp(-(1-v)*(1-v)/0.01); }   // lemon nipple
        const y0=(yy+0.5*sh.height)*sz;
        row.push(this.vert(pos.clone().add(V(Math.cos(ph)*rad*sz,y0,Math.sin(ph)*rad*sz*(sh.flat||1))),cc)); }
      rows.push(row); }
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const n=(x+1)%W; this.tri(rows[y][x],rows[y][n],rows[y+1][x]); this.tri(rows[y][n],rows[y+1][n],rows[y+1][x]); }
    const top=pos.clone().add(V(0,sh.height*sz*(1-0.04*sh.dimple),0));
    const green=hex('#4a6a2a'), woody=hex(sh.stemColor||'#6b5a2a');
    if(sh.stem){ const L=sh.stem*sz, tp=[top.clone(),top.clone().add(V(0.15*L,L*0.6,0)),top.clone().add(V(0.5*L,L,0.1*L))]; this.tube(tp,sz*0.04*(sh.stemThick||1),sz*0.03*(sh.stemThick||1),woody,sh.stemRidges?5:6); }
    if(sh.husk){ for(let i=0;i<sh.husk;i++){ const a=i/sh.husk*6.283+R()*0.3, r0=sh.width*sz*0.28; this.leaf(pos.clone().add(V(Math.cos(a)*r0,sz*0.02,Math.sin(a)*r0)),V(Math.cos(a)*0.16,1,Math.sin(a)*0.16),sz*sh.height*1.15,mix(hex('#6a9a3a'),hex('#b8c878'),R()*0.5),{shape:'strap',wide:0.45,fold:1.0,droop:0.05,wave:0.2,detail:1,veins:10}); } }
    if(sh.crown){ const k=sh.crown, cg=hex('#5a7a4a'); for(let i=0;i<k;i++){ const a=i*2.39996, el=1.25-0.45*(i/k); this.leaf(top.clone(),V(Math.cos(a)*Math.cos(el),Math.sin(el),Math.sin(a)*Math.cos(el)),sz*(0.55+0.35*(1-i/k)),mix(cg,[0.6,0.7,0.55],R()*0.25),{shape:'strap',wide:0.14,fold:0.5,droop:0.05,detail:0}); } }
    if(sh.calyx){ const k=sh.calyx, fl=sh.calyxEnd==='flower', at=fl?pos.clone().add(V(0,sz*0.03,0)):top.clone().add(V(0,-sz*0.02,0)), cc=hex(sh.calyxColor||'#4a6a2a');   // the dry flower parts sit at the far end on apples, quinces, feijoas and pomegranates
      for(let i=0;i<k;i++){ const a=i/k*6.28; this.leaf(at,V(Math.cos(a),fl?-0.9:0.15,Math.sin(a)),sz*(fl?0.18:0.28),cc,{shape:'lanceolate',wide:0.35,fold:0.1,droop:-0.1,detail:0}); } }
  }
  head(pos,fs,sz,R){   // sunflower-type head: ring of petals + seed disc, facing up/out
    const petal=hex(fs.colorRipe), disc=hex(fs.colorSecondary||'#4a2a12');
    const n=fs.shape.petals||22, tilt=0.45;
    const c=pos.clone();
    for(let i=0;i<n;i++){ const a=i/n*6.283+R()*0.1; this.leaf(c.clone().add(V(Math.cos(a)*sz*0.22,0,Math.sin(a)*sz*0.22)),V(Math.cos(a),tilt,Math.sin(a)),sz*0.36*(0.9+R()*0.2),mix(petal,[1,1,0.6],R()*0.2),{shape:'lanceolate',wide:0.38,fold:0.12,droop:0.1,detail:0}); }
    const ring=[], K=20; const cv=this.vert(c.clone().add(V(0,sz*0.05,0)),mix(disc,[0,0,0],0.3));
    for(let r=1;r<=3;r++){ const rr=sz*0.24*r/3, row=[]; for(let j=0;j<K;j++){ const a=j/K*6.283; row.push(this.vert(c.clone().add(V(Math.cos(a)*rr,sz*0.04*(1-r/3)*0.6+(r===3?0:sz*0.03),Math.sin(a)*rr)),mix(disc,[0.7,0.5,0.15],r===3?0.5:0.1*(r%2)))); } ring.push(row); }
    for(let j=0;j<K;j++){ const nx=(j+1)%K; this.tri(cv,ring[0][nx],ring[0][j]); }
    for(let k=0;k<2;k++) for(let j=0;j<K;j++){ const nx=(j+1)%K; this.tri(ring[k][j],ring[k][nx],ring[k+1][j]); this.tri(ring[k][nx],ring[k+1][nx],ring[k+1][j]); }
  }
  // a small low-poly berry (grapes, currants, blueberries): far fewer triangles than a full fruit
  berry(c,r,col){ const W=rnd(8*this.q.fruit,5), H=rnd(5*this.q.fruit,3), rows=[], hi=mix(col,[1,1,1],0.25), lo=mix(col,[0,0,0],0.3);
    for(let y=0;y<=H;y++){ const th=y/H*Math.PI, row=[]; for(let x=0;x<W;x++){ const ph=x/W*6.283; row.push(this.vert(V(c.x+Math.cos(ph)*Math.sin(th)*r,c.y+Math.cos(th)*r,c.z+Math.sin(ph)*Math.sin(th)*r),mix(lo,hi,0.5+0.5*Math.cos(th)))); } rows.push(row); }
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const n=(x+1)%W; this.tri(rows[y][x],rows[y][n],rows[y+1][x]); this.tri(rows[y][n],rows[y+1][n],rows[y+1][x]); } }
  // a grape bunch hanging from p: a short stalk, berries in rings, wide at the shoulder and narrowing to a point
  bunch(p,fs,ripe,R){ const col=mix(hex(fs.colorUnripe||'#8ab050'),hex(fs.colorRipe),Math.min(1,ripe*1.2)), r=fs.size/2*(0.6+0.4*ripe), L=(fs.length||0.18)*(0.5+0.5*ripe), n=Math.max(8,Math.round((fs.per||30)*Math.min(1.2,this.q.fruit)));
    const top=p.clone().add(V(0,-0.03,0)); this.tube([p.clone(),top],0.004,0.003,hex('#6b5a2a'),3);
    for(let i=0;i<n;i++){ const t=i/n, y=-L*t, rad=(L*0.26)*(1-t)*(1-0.3*t)+r*0.4, a=i*2.39996; this.berry(top.clone().add(V(Math.cos(a)*rad*Math.sqrt(R()),y,Math.sin(a)*rad*Math.sqrt(R()))),r*(0.9+R()*0.2),mix(col,[0.1,0.05,0.1],R()*0.2)); } }
  // a banana bunch: the stalk arches out of the top and hangs down; hands of curved fingers turn upward; a dark purple bell at the end
  bananas(p,fs,ripe,R){ const g=Math.max(0.3,ripe), col=mix(hex(fs.colorUnripe||'#5f9a3a'),hex(fs.colorRipe),sstep(0.75,1,ripe)), stalkC=hex('#6a7a3a'), Lf=fs.size*(0.5+0.5*g), hands=fs.hands||6, per=Math.max(4,Math.round((fs.per||12)*Math.min(1,this.q.fruit+0.2)));
    const s=[p.clone(),p.clone().add(V(0.22,0.02,0)),p.clone().add(V(0.36,-0.25,0)),p.clone().add(V(0.4,-0.7,0)),p.clone().add(V(0.4,-1.05,0))]; this.tube(s,0.035,0.022,stalkC,6);
    const along=(t)=>{ const f=t*(s.length-1), i=Math.min(s.length-2,Math.floor(f)); return s[i].clone().lerp(s[i+1],f-i); };
    for(let h=0;h<hands;h++){ const t=0.42+0.38*h/Math.max(1,hands-1), c=along(t), sc=1-0.25*h/hands;
      for(let k=0;k<per;k++){ const a=k/per*Math.PI*1.6-0.3+h*0.5, out=V(Math.cos(a),0,Math.sin(a)), b0=c.clone().addScaledVector(out,0.04), m=b0.clone().addScaledVector(out,Lf*0.35*sc).add(V(0,Lf*0.25*sc,0)), e=b0.clone().addScaledVector(out,Lf*0.45*sc).add(V(0,Lf*0.75*sc,0));
        const rr=Lf*0.11*sc; this.tube([b0,b0.clone().lerp(m,0.5),m],rr*0.45,rr,col,5); this.tube([m,m.clone().lerp(e,0.5).addScaledVector(out,Lf*0.05),e],rr,rr*0.35,col,5); } }
    const end=s[s.length-1]; this.tube([along(0.82),end],0.012,0.012,stalkC,4); this.ball(end.clone().add(V(0,-0.1,0)),0.055,0.11,hex('#5a1a34'),hex('#7a2a44')); }
  geometry(){ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3)); g.setIndex(this.i); g.computeVertexNormals(); return g; }
}

const APPLE={count:14,size:0.075,shape:{width:1,height:0.88,fullness:0.7,ribs:5,ribDepth:0.02,taperTop:0,taperBottom:0.25,dimple:1.6,blush:1.0,stem:0.5,stemThick:0.7,calyx:5,calyxEnd:'flower',calyxColor:'#6a5a30',stripes:0},colorUnripe:'#7fb049',colorRipe:'#d8c23a',colorSecondary:'#c42b2b'};
// helpers for the fruit, nut and berry plants below: a tree, a fruit and a leaf with sensible defaults
/* crown shapes (checked against orchard and garden photos): round = citrus, dense to near the ground; dome = tall evergreens; spread = broad
   low limbs; vase = open-centre stone and pome fruit; upright = pear and cherry; shrub = many stems from the ground; canes = raspberry, blackberry */
const CROWN={round:{trunkFrac:0.1,angle:62,tropism:0.25,lenRatio:0.75,kids:[0,7,5,4],droop:0.05,levels:4},
  dome:{trunkFrac:0.2,angle:55,tropism:0.35,lenRatio:0.72,kids:[0,6,5,4],droop:0.05,levels:4},
  spread:{trunkFrac:0.22,angle:62,tropism:0.12,lenRatio:0.76,kids:[0,5,4,4],droop:0.08,twist:0.6,levels:4},
  vase:{trunkFrac:0.22,angle:50,tropism:0.3,lenRatio:0.7,kids:[0,4,5,4],droop:0.1,levels:4},
  upright:{trunkFrac:0.25,angle:35,tropism:0.45,lenRatio:0.68,kids:[0,5,5,4],droop:0.06,levels:4},
  shrub:{trunkFrac:0.4,angle:40,tropism:0.3,lenRatio:0.7,kids:[0,5,4],droop:0.1,levels:3,stems:7,stemAngle:20},
  canes:{trunkFrac:0.8,angle:40,tropism:0.3,lenRatio:0.6,kids:[0,4],droop:0.1,levels:2,stems:7,stemAngle:12}};
const T=o=>({v:2,kind:'tree',fit:true,taper:0.62,twist:0.4,trunk:0.12,...CROWN[o.crown||'dome'],...o});
const F=(size,shape,ripe,unripe,x={})=>({count:20,size,shape:{width:1,height:1,fullness:0.75,ribs:0,ribDepth:0,taperTop:0,taperBottom:0,dimple:0.5,stem:0.15,stemThick:0.6,...shape},colorRipe:ripe,colorUnripe:unripe||'#6a9a3a',colorSecondary:x.blush||ripe,...x});
const LF=(shape,size,color,color2,o={})=>({shape,wide:0.5,size,density:8,color,color2,fold:0.3,droop:0.25,wave:0.2,...o});
export const PRESETS = {
  appleTree:{v:2,kind:'tree',fit:true,spread:4,seed:11,height:4.5,trunk:0.14,levels:4,kids:[0,4,4,3],angle:48,lenRatio:0.62,taper:0.62,twist:0.35,tropism:0.25,droop:0.1,leaf:{shape:'oval',wide:0.62,size:0.28,density:10,color:'#4d8a35',color2:'#79b04a',fold:0.3,droop:0.3,wave:0.5},bear:'spurs',fruit:{...APPLE,count:18,per:2}},
  oakTree:{v:2,kind:'tree',seed:5,height:6.5,trunk:0.28,levels:5,kids:[0,3,4,4,3],angle:60,lenRatio:0.7,taper:0.64,twist:0.7,tropism:-0.05,droop:0.05,leaf:{shape:'lobed',wide:0.55,size:0.26,density:7,color:'#3f7a2c',color2:'#6a9a3b',fold:0.35,droop:0.2,wave:0.7},fruit:{count:0}},
  willow:{v:2,kind:'tree',seed:21,height:5.5,trunk:0.2,levels:4,kids:[0,5,5,4],angle:38,lenRatio:0.7,taper:0.6,twist:0.3,tropism:0.1,droop:0.9,leaf:{shape:'lanceolate',wide:0.2,size:0.3,density:9,color:'#7fa83f',color2:'#a6c455',fold:0.2,droop:0.5,wave:0.2},fruit:{count:0}},
  pumpkinVine:{v:2,kind:'vine',seed:7,length:5,stem:0.03,sideVines:3,leaf:{shape:'palmate',lobes:5,sinus:0.32,size:0.55,density:1,color:'#3f7d2f',color2:'#5d9a3a',fold:0.35,droop:0.2},fruit:{count:3,size:0.34,shape:{width:1.2,height:0.85,fullness:0.5,ribs:10,ribDepth:0.11,grooveShade:0.7,taperTop:0,taperBottom:0,dimple:1.8,stem:0.5,stemThick:1.6,stemRidges:1,stemColor:'#7a6a3a',stripes:0},colorUnripe:'#5a8a3a',colorRipe:'#e8731a',colorSecondary:'#e8731a'}},
  blackPumpkin:{v:2,kind:'vine',seed:9,length:5.5,stem:0.03,sideVines:4,leaf:{shape:'palmate',lobes:5,sinus:0.4,size:0.5,density:1,color:'#2f6a2a',color2:'#4b8a38',fold:0.3,droop:0.25},fruit:{count:4,size:0.3,shape:{width:1.0,height:1.12,fullness:0.7,ribs:7,ribDepth:0.07,grooveShade:0.5,taperTop:0.35,taperBottom:0.05,dimple:1.2,stem:0.55,stemThick:1.4,stemRidges:1,stemColor:'#5a4a2a',stripes:0},colorUnripe:'#3e6a35',colorRipe:'#1c1f24',colorSecondary:'#2a3a30'}},
  tomato:{v:2,kind:'bush',seed:3,height:1.6,stem:0.018,joints:12,leaf:{shape:'compound',leaflet:'oval',wide:0.7,size:0.34,density:2,color:'#4a8a30',color2:'#6aa845',fold:0.3,droop:0.3,wave:0.9},fruit:{count:10,size:0.085,shape:{width:1.05,height:0.88,fullness:0.65,ribs:5,ribDepth:0.04,grooveShade:0.15,taperTop:0,taperBottom:0.08,dimple:0.8,blush:0.25,calyx:6,stem:0.5,stemThick:0.6,stemColor:'#4a6a2a'},colorUnripe:'#6aa83c',colorRipe:'#d6281d',colorSecondary:'#e8602a'}},
  corn:{v:2,kind:'stalk',seed:2,height:2.2,stem:0.035,joints:9,leaf:{shape:'strap',wide:0.14,size:1.0,density:1,color:'#5c9a38',color2:'#7ab648',fold:0.6,droop:0.7,wave:1.0,veins:12},fruit:{count:2,size:0.3,shape:{width:0.34,height:1.5,fullness:0.55,kernels:18,ribDepth:0.06,taperTop:0.75,taperBottom:0.1,dimple:0,husk:5,stem:0.1},colorUnripe:'#c8d878',colorRipe:'#f0c820',colorSecondary:'#f0c820'}},
  sunflower:{v:2,kind:'stalk',seed:4,height:2.4,stem:0.04,joints:11,leaf:{shape:'heart',wide:0.85,size:0.55,density:1,color:'#4b8a33',color2:'#6aa840',fold:0.25,droop:0.45,wave:0.5},fruit:{count:1,size:0.5,shape:{kind:'head',petals:22,width:1,height:0.1},colorUnripe:'#5a8a3a',colorRipe:'#f0b81a',colorSecondary:'#4a2a12'}},
  // Reference notes (shape, colour, habit cross-checked against several published descriptions; reference only, nothing copied):
  // citrus: round dense crown, glossy dark-green 5-10 cm leaves, round orange fruit; mature trees 3.5-9 m high and wide, kept near 4 m in orchards
  citrus:{v:2,kind:'tree',seed:31,height:4,spread:4.2,trunkFrac:0.26,trunk:0.13,levels:4,kids:[0,5,4,3],angle:58,lenRatio:0.66,taper:0.62,twist:0.4,tropism:0.12,droop:0.05,leaf:{shape:'oval',wide:0.5,size:0.14,density:9,color:'#2f6a2c',color2:'#4a8a38',fold:0.3,droop:0.25,wave:0.2},fruit:{count:16,size:0.08,shape:{width:1,height:0.94,fullness:0.8,ribs:0,ribDepth:0,taperTop:0,taperBottom:0,dimple:0.5,stem:0.12,stemThick:0.5,calyx:5,warts:0.03},colorUnripe:'#6aa83c',colorRipe:'#f08a16',colorSecondary:'#f08a16'}},
  // Black Futsu: squat blocky heavy ribs, bumpy skin, near-black green that cures to tawny orange-brown, 1.4-2.3 kg, compact vine
  blackFutsu:{v:2,kind:'vine',seed:13,length:4,stem:0.028,sideVines:3,leaf:{shape:'palmate',lobes:5,sinus:0.36,size:0.48,density:1,color:'#2f6a2a',color2:'#4b8a38',fold:0.3,droop:0.25},fruit:{count:4,size:0.21,shape:{width:1,height:0.72,fullness:0.5,ribs:10,ribDepth:0.1,grooveShade:0.6,warts:0.07,taperTop:0,taperBottom:0,dimple:1.4,stem:0.4,stemThick:1.5,stemRidges:1,stemColor:'#5a4a2a',stripes:0},colorUnripe:'#3e6a35',colorRipe:'#1f2b22',colorSecondary:'#2a3a30',colorCured:'#b58a52'}},
  // South Anna butternut: butternut shape (narrow neck, round bulb), green turning tan, strong vine
  southAnna:{v:2,kind:'vine',seed:17,length:5,stem:0.03,sideVines:4,leaf:{shape:'palmate',lobes:5,sinus:0.2,size:0.5,density:1,color:'#3a7a2d',color2:'#5a9a3a',fold:0.3,droop:0.2},fruit:{count:3,size:0.3,shape:{width:0.5,height:1,neck:0.62,fullness:0.7,ribs:0,ribDepth:0,taperTop:0,taperBottom:0,dimple:0.4,stem:0.3,stemThick:1.4,stemRidges:1,stemColor:'#7a6a3a',stripes:0},colorUnripe:'#6f9a47',colorRipe:'#d2a870',colorSecondary:'#d2a870'}},
  // Golden scallop pattypan: flat scalloped disc, bush habit, big long-stalked leaves
  pattypan:{v:2,kind:'rosette',seed:19,height:0.7,spread:1.3,leaves:9,stem:0.016,leaf:{shape:'palmate',lobes:5,sinus:0.38,size:0.46,density:1,color:'#3f7d2f',color2:'#5d9a3a',fold:0.3,droop:0.25},fruit:{count:5,size:0.13,shape:{width:1,height:0.55,fullness:0.45,ribs:11,ribDepth:0.2,grooveShade:0.4,taperTop:0,taperBottom:0.45,dimple:0.8,stem:0.3,stemThick:1.2,stemColor:'#6a8a3a',stripes:0},colorUnripe:'#bfd86a',colorRipe:'#f0b81a',colorSecondary:'#f0b81a'}},
  // ---- fruiting bushes (same build as the tomato, own leaves and fruit) ----
  capsicum:{v:2,kind:'bush',seed:63,height:0.8,stem:0.016,joints:9,leaf:{shape:'ovate',wide:0.55,size:0.16,density:2,color:'#2f6e2a',color2:'#4a8a38',fold:0.3,droop:0.25,wave:0.2},fruit:{count:6,size:0.1,shape:{width:0.95,height:1.05,fullness:0.45,ribs:4,ribDepth:0.09,grooveShade:0.4,taperTop:0,taperBottom:0.15,dimple:1,stem:0.35,stemThick:0.9,stemColor:'#3f6a2a'},colorUnripe:'#3f7a2a',colorRipe:'#d62a1f',colorSecondary:'#d62a1f'}},
  chilli:{v:2,kind:'bush',seed:64,height:0.7,stem:0.012,joints:9,leaf:{shape:'lanceolate',wide:0.45,size:0.11,density:3,color:'#2f6e2a',color2:'#4a8a38',fold:0.25,droop:0.25,wave:0.1},fruit:{count:12,size:0.07,shape:{width:0.32,height:1.9,fullness:0.9,ribs:0,ribDepth:0,taperTop:0,taperBottom:0.9,dimple:0.3,stem:0.25,stemThick:0.5,stemColor:'#3f6a2a'},colorUnripe:'#3f7a2a',colorRipe:'#d8201a',colorSecondary:'#d8201a'}},
  eggplant:{v:2,kind:'bush',seed:65,height:0.9,stem:0.018,joints:9,leaf:{shape:'ovate',wide:0.7,size:0.22,density:2,color:'#4a6a4a',color2:'#6a8060',fold:0.3,droop:0.3,wave:0.5},fruit:{count:4,size:0.15,shape:{width:0.55,height:1.5,fullness:0.75,ribs:0,ribDepth:0,taperTop:0.25,taperBottom:0,dimple:0.4,calyx:5,stem:0.3,stemThick:1,stemColor:'#4a5a3a'},colorUnripe:'#4a2a4a',colorRipe:'#2e1430',colorSecondary:'#3a1838'}},
  potato:{v:2,kind:'bush',seed:66,height:0.6,stem:0.016,joints:8,leaf:{shape:'compound',leaflet:'oval',wide:0.7,size:0.22,density:3,color:'#3f7030',color2:'#5a8a40',fold:0.3,droop:0.3,wave:0.4},fruit:{count:0}},
  bean:{v:2,kind:'bush',seed:67,height:1.8,stem:0.008,joints:14,leaf:{shape:'heart',wide:0.75,size:0.11,density:3,color:'#3f7f2f',color2:'#5a9a3a',fold:0.25,droop:0.3,wave:0.2},fruit:{count:12,size:0.13,shape:{width:0.12,height:2.8,fullness:1.2,ribs:0,ribDepth:0,taperTop:0.1,taperBottom:0.5,dimple:0,stem:0.1,stemThick:0.3},colorUnripe:'#5a9a3a',colorRipe:'#4f8f2f',colorSecondary:'#4f8f2f'}},
  pea:{v:2,kind:'bush',seed:68,height:1.2,stem:0.006,joints:14,leaf:{shape:'oval',wide:0.75,size:0.07,density:4,color:'#5a8f6a',color2:'#7aa585',fold:0.3,droop:0.2,wave:0.1},fruit:{count:10,size:0.08,shape:{width:0.28,height:2.4,fullness:1,ribs:0,ribDepth:0,taperTop:0.2,taperBottom:0.4,dimple:0,stem:0.1,stemThick:0.3},colorUnripe:'#7fb35a',colorRipe:'#6aa84a',colorSecondary:'#6aa84a'}},
  // ---- leafy vegetables and herbs (kind 'leafy', see leafy()) ----
  lettuce:{v:2,kind:'leafy',form:'loose',seed:41,height:0.25,spread:0.34,leaves:16,leaf:{density:1,shape:'round',wide:0.95,size:0.16,color:'#7fb33a',color2:'#a9d15a',fold:0.35,droop:0.15,ruffle:0.8},fruit:{count:0}},
  lettuceRed:{v:2,kind:'leafy',form:'loose',seed:42,height:0.25,spread:0.34,leaves:16,leaf:{density:1,shape:'round',wide:0.9,size:0.16,color:'#7a2f3a',color2:'#8f5a33',fold:0.35,droop:0.15,ruffle:1.1},fruit:{count:0}},
  spinach:{v:2,kind:'leafy',form:'loose',seed:43,height:0.22,spread:0.3,leaves:12,leaf:{density:1,shape:'spoon',wide:0.75,size:0.13,color:'#2f6a2a',color2:'#3f7f34',fold:0.3,droop:0.25,ruffle:0.2},fruit:{count:0}},
  cabbage:{v:2,kind:'leafy',form:'head',seed:44,height:0.4,spread:0.62,leaves:10,leaf:{density:1,shape:'round',wide:1,size:0.3,color:'#6f9a7c',color2:'#8fb39a',fold:0.4,droop:0.3,ruffle:0.25},head:{size:0.42,color:'#a8c99a',color2:'#d6e6c4',veins:7},fruit:{count:0}},
  cabbageRed:{v:2,kind:'leafy',form:'head',seed:45,height:0.4,spread:0.6,leaves:10,leaf:{density:1,shape:'round',wide:1,size:0.28,color:'#5b3a6e',color2:'#7a5a8a',fold:0.4,droop:0.3,ruffle:0.25},head:{size:0.42,color:'#6a2c63',color2:'#8e4a85',veins:7},fruit:{count:0}},
  cauliflower:{v:2,kind:'leafy',form:'curd',seed:46,height:0.6,spread:0.7,leaves:12,leaf:{density:1,shape:'lanceolate',wide:0.55,size:0.38,color:'#5f8f6a',color2:'#7fa984',fold:0.35,droop:0.2,ruffle:0.3},head:{size:0.38,color:'#f1ead2',color2:'#e2d6b0',bumps:0.08,freq:11},fruit:{count:0}},
  broccoli:{v:2,kind:'leafy',form:'curd',seed:47,height:0.7,spread:0.7,leaves:11,leaf:{density:1,shape:'lanceolate',wide:0.5,size:0.38,color:'#567f5c',color2:'#73997a',fold:0.35,droop:0.2,ruffle:0.35},head:{size:0.34,color:'#3f6b3a',color2:'#58804a',bumps:0.14,freq:13},fruit:{count:0}},
  kale:{v:2,kind:'leafy',form:'tall',seed:48,height:0.8,spread:0.62,leaves:12,leaf:{density:1,shape:'lanceolate',wide:0.45,size:0.42,color:'#4d7a55',color2:'#6d9a6a',fold:0.3,droop:0.35,ruffle:1.4},fruit:{count:0}},
  kaleTuscan:{v:2,kind:'leafy',form:'tall',seed:49,height:0.8,spread:0.55,leaves:12,leaf:{density:1,shape:'lanceolate',wide:0.32,size:0.45,color:'#2f4a3a',color2:'#45604a',fold:0.25,droop:0.4,wave:0.9,ruffle:0.5},fruit:{count:0}},
  silverbeet:{v:2,kind:'leafy',form:'stalks',seed:50,height:0.55,spread:0.55,leaves:9,stem:0.014,stalkFrac:0.42,stalk:'#f2f0e0',leaf:{density:1,shape:'ovate',wide:0.72,size:0.24,color:'#2f6e2c',color2:'#4a8a3a',fold:0.25,droop:0.2,wave:0.6},fruit:{count:0}},
  chardRainbow:{v:2,kind:'leafy',form:'stalks',seed:51,height:0.55,spread:0.55,leaves:9,stem:0.014,stalkFrac:0.42,stalkColors:['#d8303a','#f2c230','#f08a2a','#ecebd8','#c2387a'],leaf:{density:1,shape:'ovate',wide:0.72,size:0.24,color:'#2d5a2a',color2:'#46723a',fold:0.25,droop:0.2,wave:0.7},fruit:{count:0}},
  beetroot:{v:2,kind:'leafy',form:'stalks',seed:52,height:0.3,spread:0.3,leaves:8,stem:0.006,stalkFrac:0.45,stalkColors:['#9a1f3a'],leaf:{density:1,shape:'ovate',wide:0.65,size:0.16,color:'#3d5a2c',color2:'#5a3a3a',fold:0.25,droop:0.2,wave:0.5},head:{size:0.3,color:'#5a1530',color2:'#7a2040'},fruit:{count:0}},
  radish:{v:2,kind:'leafy',form:'stalks',seed:53,height:0.18,spread:0.2,leaves:6,stem:0.004,stalkFrac:0.4,stalkColors:['#c86a7a'],leaf:{density:1,shape:'spoon',wide:0.6,size:0.1,color:'#4f8a3a',color2:'#6aa04a',fold:0.2,droop:0.25,wave:0.6},head:{size:0.35,color:'#d8304a',color2:'#e8607a'},fruit:{count:0}},
  carrot:{v:2,kind:'leafy',form:'fern',seed:54,height:0.32,spread:0.24,leaves:8,leaf:{density:1,shape:'lanceolate',wide:0.5,size:0.035,color:'#4f8f3a',color2:'#6aa84a',fold:0.1,droop:0.1},head:{size:0.18,color:'#e8761f',color2:'#f0923a'},fruit:{count:0}},
  onion:{v:2,kind:'leafy',form:'strap',seed:55,height:0.5,spread:0.24,leaves:7,leaf:{density:1,shape:'strap',wide:0.12,size:0.4,color:'#5a8a6a',color2:'#7aa585',fold:0.45,droop:0.2},head:{size:0.55,color:'#d9b46a',color2:'#eed9a0',veins:6},fruit:{count:0}},
  onionRed:{v:2,kind:'leafy',form:'strap',seed:56,height:0.5,spread:0.24,leaves:7,leaf:{density:1,shape:'strap',wide:0.12,size:0.4,color:'#5a8a6a',color2:'#7aa585',fold:0.45,droop:0.2},head:{size:0.55,color:'#7a2a4a',color2:'#a0506a',veins:6},fruit:{count:0}},
  garlic:{v:2,kind:'leafy',form:'strap',seed:57,height:0.5,spread:0.22,leaves:7,leaf:{density:1,shape:'strap',wide:0.16,size:0.4,color:'#6a9a6a',color2:'#88b088',fold:0.4,droop:0.25},head:{size:0.45,color:'#efe9dc',color2:'#dcd0bc',veins:9},fruit:{count:0}},
  leek:{v:2,kind:'leafy',form:'strap',fan:true,shank:0.35,seed:58,height:0.6,spread:0.3,leaves:8,stalk:'#e9eedb',leaf:{density:1,shape:'strap',wide:0.2,size:0.4,color:'#3f6f5a',color2:'#5e8c72',fold:0.35,droop:0.3},fruit:{count:0}},
  basil:{v:2,kind:'leafy',form:'mound',seed:59,height:0.45,spread:0.35,leaves:16,leaf:{density:1,shape:'ovate',wide:0.7,size:0.075,color:'#4f9a35',color2:'#6fb84a',fold:0.45,droop:0.1},fruit:{count:0}},
  parsley:{v:2,kind:'leafy',form:'mound',seed:60,height:0.35,spread:0.32,leaves:18,leaf:{density:1,shape:'lobed',wide:0.75,size:0.06,color:'#2f7a2a',color2:'#4a9a3a',fold:0.2,droop:0.1},fruit:{count:0}},
  herbs:{v:2,kind:'leafy',form:'mound',seed:61,height:0.4,spread:0.4,leaves:20,leaf:{density:1,shape:'lanceolate',wide:0.4,size:0.05,color:'#6a8f55',color2:'#8aa86e',fold:0.2,droop:0.05},fruit:{count:0}},
  strawberry:{v:2,kind:'leafy',form:'low',seed:62,height:0.2,spread:0.36,leaves:9,leaf:{density:1,shape:'oval',wide:0.85,size:0.095,color:'#3f7a2f',color2:'#5a9a3a',fold:0.35,droop:0.15},fruit:{count:5,size:0.032,shape:{width:0.85,height:1.15,fullness:1.15,ribs:0,ribDepth:0,taperTop:0,taperBottom:0.55,dimple:0.3,calyx:5,stem:0.2,stemThick:0.4},colorUnripe:'#cfe08a',colorRipe:'#d8202a',colorSecondary:'#d8202a'}},
  /* ---- fruit, nut and berry plants (look stage 4).  Each was checked against growing guides and photo descriptions (reference only, own
     drawing): fruit shape, size and colour, and WHERE the fruit grows on the plant (spec.bear; see bear() and climber()). ---- */
  // citrus: dense round evergreen crowns, glossy leaves; fruit at the shoot ends, partly inside the canopy
  lemon:T({crown:'round',trunk:0.08,seed:301,height:4,spread:3.5,leaf:LF('oval',0.209,'#2f6a2c','#4a8a38',{wide:0.48,density:9}),bear:'tips',fruit:F(0.072,{width:0.78,fullness:0.95,tip:1,dimple:0.15,stem:0.1,warts:0.04},'#f2d531','#5f9a3a',{count:20})}),
  orange:T({crown:'round',trunk:0.1,seed:302,height:5,spread:4.5,leaf:LF('oval',0.228,'#2c642a','#467f35',{wide:0.5,density:9}),bear:'tips',fruit:F(0.08,{height:0.96,fullness:0.8,dimple:0.4,stem:0.1,warts:0.03},'#f08a16','#6aa83c',{count:22})}),
  mandarin:T({crown:'round',trunk:0.07,seed:303,height:3.5,spread:3,leaf:LF('lanceolate',0.171,'#2f6a2c','#4a8a38',{wide:0.42,density:10}),bear:'tips',fruit:F(0.065,{height:0.78,fullness:0.7,dimple:0.8,stem:0.08,warts:0.03},'#f07412','#6aa83c',{count:30})}),
  lime:T({crown:'round',trunk:0.07,seed:304,height:4,spread:3,leaf:LF('oval',0.171,'#2f6a2c','#4a8a38',{wide:0.48,density:9}),bear:'tips',fruit:F(0.055,{height:1.05,fullness:0.85,tip:0.4,dimple:0.2,stem:0.1,warts:0.02},'#7fb23a','#4a8a30',{count:26})}),
  grapefruit:T({crown:'round',trunk:0.1,seed:305,height:5,spread:4.5,leaf:LF('oval',0.266,'#2c642a','#467f35',{wide:0.52,density:8}),bear:'tips',fruit:F(0.12,{height:0.92,fullness:0.75,dimple:0.4,stem:0.08,warts:0.02},'#f0cc4a','#6aa83c',{count:14,blush:'#e89a6a'})}),
  kumquat:T({crown:'round',trunk:0.04,seed:306,height:2.5,spread:2,leaf:LF('lanceolate',0.133,'#2f6a2c','#4a8a38',{wide:0.4,density:10}),bear:'tips',fruit:F(0.032,{width:0.8,height:1,fullness:0.9,dimple:0.2,stem:0.15},'#f28a1a','#6aa83c',{count:60,per:3})}),
  // avocado: tall dense evergreen, big elliptic leaves; pear-shaped fruit hanging on long stalks from the branch ends
  avocado:T({crown:'dome',seed:307,height:8,spread:6,trunk:0.18,leaf:LF('oval',0.436,'#2c5a28','#3f7432',{wide:0.42,density:12}),bear:'stalks',fruit:F(0.085,{width:0.72,height:1,fullness:0.7,neck:0.68,dimple:0,stem:0.25,stemThick:0.8,warts:0.05},'#2d3b1f','#4a7a2c',{count:18,stalk:0.12})}),
  // mango: big dome of long narrow leathery leaves; oval, slightly flattened fruit with a red blush, hanging on long stalks in loose groups at the branch ends
  mango:T({crown:'dome',seed:308,height:8,spread:7,trunk:0.22,leaf:LF('lanceolate',0.456,'#2a5a26','#3f7a30',{wide:0.28,density:14,droop:0.4}),bear:'stalks',fruit:F(0.12,{width:0.68,height:1,fullness:0.8,flat:0.8,taperBottom:0.18,dimple:0,stem:0.1,blush:0.8},'#e8b830','#5f8f3a',{count:22,per:2,stalk:0.28,blush:'#d8502a'})}),
  // macadamia: dense evergreen with stiff, toothed leaves; round green husks in long hanging strings
  macadamia:T({crown:'dome',seed:309,height:8,spread:6,trunk:0.15,leaf:LF('lanceolate',0.462,'#2f5f2a','#47753a',{wide:0.32,density:12,wave:0.6}),bear:'chains',fruit:F(0.028,{dimple:0,stem:0},'#4f7a35','#5f8f3a',{count:42,per:6,stalk:0.22})}),
  // coffee: a shrub with glossy leaves on level branches; clusters of round red cherries along the branches
  coffee:T({crown:'round',seed:310,height:2.5,spread:2,trunk:0.03,leaf:LF('lanceolate',0.13,'#235224','#356a30',{wide:0.4,density:6,wave:0.5}),bear:'along',fruit:F(0.014,{height:1.1,dimple:0.2,stem:0},'#b8241e','#6a9a3a',{count:110,per:7})}),
  // feijoa: bushy, grey-green leaves with silver undersides; egg-shaped green fruit with the dry flower still on the end
  feijoa:T({crown:'shrub',seed:311,height:3,spread:3,trunk:0.04,leaf:LF('oval',0.114,'#4f6f4f','#8a9f8a',{wide:0.55,density:9}),bear:'tips',fruit:F(0.05,{width:0.8,height:1.3,fullness:0.85,dimple:0,stem:0.05,calyx:4,calyxEnd:'flower',calyxColor:'#6a5a3a'},'#5a8a3a','#5a8a3a',{count:24})}),
  // fig: low spreading tree, thick grey limbs, big three-to-five-lobed leaves; tear-drop fruit singly at the leaf bases along the shoots
  fig:T({crown:'spread',seed:312,height:4,spread:4.5,trunk:0.12,bark:'#8a8478',leaf:LF('palmate',0.564,'#3f7a30','#5a9040',{lobes:5,sinus:0.55,density:6,fold:0.2}),bear:'along',fruit:F(0.055,{width:0.82,fullness:0.65,neck:0.55,dimple:0.3,stem:0.15},'#5a2a48','#7fa04a',{count:34})}),
  // mulberry: broad spreading crown, heart-shaped toothed leaves; long berries (red, then black) crowded along the shoots
  mulberry:T({crown:'spread',seed:313,height:6,spread:6.5,trunk:0.15,leaf:LF('heart',0.308,'#4a8a34','#68a245',{wide:0.75,density:11}),bear:'along',fruit:F(0.022,{width:0.6,height:1.6,fullness:0.9,warts:0.35,dimple:0,stem:0.1},'#2a0f1e','#d84a4a',{count:90,per:3})}),
  // olive: silvery narrow leaves, gnarled trunk; small oval olives in bunches along the branches
  olive:T({crown:'dome',seed:314,height:6,spread:5,trunk:0.15,bark:'#7a7468',leaf:LF('lanceolate',0.2,'#5f7a5a','#a0ad95',{wide:0.26,density:14,fold:0.15}),bear:'along',fruit:F(0.02,{width:0.75,height:1.25,fullness:0.85,dimple:0,stem:0.3},'#2c1a2c','#7f8f3a',{count:130,per:4})}),
  // pomegranate: shrubby, small glossy leaves; round red fruit with a crown at the flower end, at the shoot tips
  pomegranate:T({crown:'shrub',seed:315,height:3,spread:3,trunk:0.04,leaf:LF('lanceolate',0.114,'#3f7a2f','#5a9a3a',{wide:0.35,density:10}),bear:'tips',fruit:F(0.09,{height:0.92,fullness:0.75,dimple:0.2,stem:0.05,calyx:6,calyxEnd:'flower',calyxColor:'#a8302a',blush:0.6},'#b8282a','#a8a040',{count:16,blush:'#d8603a'})}),
  // European pear: upright crown; pear-shaped fruit hanging from spurs in twos and threes
  pear:T({crown:'upright',trunk:0.1,seed:316,height:5,spread:4,leaf:LF('oval',0.152,'#3f7a30','#5a9a40',{wide:0.62,density:8}),bear:'spurs',fruit:F(0.1,{width:0.68,fullness:0.75,neck:0.68,dimple:0.6,stem:0.35,stemThick:0.7,blush:0.2},'#c9c23e','#8ab04a',{count:22,per:2,blush:'#c88a3a'})}),
  // nashi: round, flat-topped, russet-bronze fruit on spurs
  nashi:T({crown:'vase',trunk:0.09,seed:317,height:4,spread:4,leaf:LF('oval',0.19,'#3f7a30','#5a9a40',{wide:0.6,density:8}),bear:'spurs',fruit:F(0.09,{height:0.85,fullness:0.7,dimple:0.9,stem:0.35},'#c8a050','#9ab050',{count:22,per:2})}),
  // peach and nectarine: open vase shape, long narrow leaves; round fruit with a seam and a red blush, singly along last year's shoots
  peach:T({crown:'vase',trunk:0.08,seed:318,height:4,spread:4.5,leaf:LF('lanceolate',0.266,'#3f7f2f','#5a9a3a',{wide:0.28,density:9,droop:0.35}),bear:'along',fruit:F(0.07,{fullness:0.75,ribs:1,ribDepth:0.06,dimple:0.6,stem:0,blush:1},'#f2b34a','#9ab04a',{count:32,blush:'#d8402a'})}),
  // plum: twiggy crown; small oval dark purple plums on spurs, several together
  plum:T({crown:'vase',trunk:0.08,seed:319,height:4,spread:4,leaf:LF('oval',0.133,'#3f7a30','#5a8f3a',{wide:0.6,density:9}),bear:'spurs',fruit:F(0.05,{width:0.92,height:1.05,ribs:1,ribDepth:0.03,dimple:0.4,stem:0.3},'#5a1f4a','#8aa040',{count:48,per:3})}),
  // apricot: rounded crown, round heart-based leaves; small orange fruit with a blush, on spurs
  apricot:T({crown:'vase',trunk:0.09,seed:320,height:4,spread:4.5,leaf:LF('round',0.152,'#3f7f2f','#5a9a3a',{wide:0.85,density:8}),bear:'spurs',fruit:F(0.045,{ribs:1,ribDepth:0.04,dimple:0.5,stem:0.05,blush:0.8},'#f2a030','#9ab04a',{count:46,per:2,blush:'#e0602a'})}),
  // sweet cherry: tall upright tree; dark red cherries on long stems, in bunches from spurs
  cherry:T({crown:'upright',trunk:0.12,seed:321,height:5,spread:4,bark:'#5a3a32',leaf:LF('oval',0.228,'#3f7a30','#5a9a40',{wide:0.5,density:7}),bear:'spurs',fruit:F(0.024,{fullness:0.7,dimple:0.6,stem:1.8,stemThick:0.6},'#7a0f1e','#c8c050',{count:90,per:4})}),
  // persimmon: rounded tree, big glossy leaves; flattened round orange fruit with a large four-part calyx, along the new shoots
  persimmon:T({crown:'dome',trunk:0.1,seed:322,height:5,spread:4,leaf:LF('oval',0.385,'#2f6a2c','#4a8a38',{wide:0.6,density:9}),bear:'along',fruit:F(0.08,{height:0.75,fullness:0.65,ribs:4,ribDepth:0.03,dimple:0.3,stem:0.05,calyx:4},'#f07a1a','#9ab04a',{count:30})}),
  // quince: low crooked tree, downy leaves; big lumpy golden fruit at the tips of short shoots
  quince:T({crown:'spread',trunk:0.08,seed:323,height:4,spread:4,leaf:LF('oval',0.171,'#5a7f4a','#8aa070',{wide:0.7,density:7}),bear:'tips',fruit:F(0.1,{width:0.88,fullness:0.75,taperTop:0.4,warts:0.06,dimple:0.6,stem:0.05,calyx:5,calyxEnd:'flower',calyxColor:'#6a5a3a'},'#e8c830','#9ab050',{count:22})}),
  // almond: like a peach tree; flattened, velvety green hulls on spurs
  almond:T({crown:'vase',trunk:0.1,seed:324,height:5,spread:5,leaf:LF('lanceolate',0.19,'#4a7f3a','#6a9a4a',{wide:0.28,density:9}),bear:'spurs',fruit:F(0.04,{width:0.75,height:1.3,fullness:0.85,flat:0.7,ribs:1,ribDepth:0.05,dimple:0,stem:0.05},'#8aa05a','#7a9a4a',{count:56,per:2})}),
  // walnut, pecan: big trees with long compound leaves; green husks at the branch ends (pecans in clusters)
  walnut:T({crown:'spread',seed:325,height:15,spread:12,trunk:0.3,leaf:LF('oval',0.42,'#3f6f2c','#5a8a3a',{wide:0.5,density:12}),bear:'tips',fruit:F(0.05,{fullness:0.7,dimple:0.1,stem:0.05},'#5f8a3a','#5f8a3a',{count:50,per:2})}),
  pecan:T({crown:'spread',seed:326,height:20,spread:15,trunk:0.35,leaf:LF('lanceolate',0.45,'#3f6f2c','#5a8a3a',{wide:0.38,density:12}),bear:'tips',fruit:F(0.035,{width:0.7,height:1.4,fullness:0.9,ribs:4,ribDepth:0.06,dimple:0,stem:0},'#5f8a3a','#5f8a3a',{count:70,per:4})}),
  // chestnut: big tree, long saw-toothed leaves; spiny round burrs at the branch ends
  chestnut:T({crown:'spread',seed:327,height:15,spread:12,trunk:0.3,leaf:LF('lanceolate',0.6,'#3f7a2c','#5a9a3a',{wide:0.32,density:12,wave:0.6}),bear:'tips',fruit:F(0.07,{dimple:0,stem:0,warts:0.55},'#a8b84a','#8aa840',{count:48,per:2})}),
  // hazelnut: a many-stemmed shrub; round toothed leaves; nuts in frilly husks, in small groups along the branches
  hazelnut:T({crown:'shrub',seed:328,height:4,spread:4,trunk:0.035,leaf:LF('heart',0.19,'#3f7a30','#5a9a3a',{wide:0.85,density:7}),bear:'along',fruit:F(0.02,{width:0.9,height:1.15,dimple:0,stem:0,calyx:5},'#b0a050','#8aa040',{count:60,per:3})}),
  // blueberry: a twiggy shrub; clusters of round blue berries with a dusty bloom at the shoot tips
  blueberry:T({crown:'shrub',seed:329,height:1.5,spread:1.2,trunk:0.015,leaf:LF('oval',0.095,'#3f6a3a','#5a8050',{wide:0.5,density:9}),bear:'tips',fruit:F(0.012,{height:0.85,dimple:1.2,stem:0},'#3f4f8a','#a8c07a',{count:100,per:7})}),
  // raspberry: upright canes, leaves of three to five leaflets; red berries of tiny drupelets in small groups along the canes
  raspberry:T({crown:'canes',tropism:0.6,stemAngle:8,stems:6,seed:330,height:1.6,spread:0.6,trunk:0.008,bark:'#7a5a3a',leaf:LF('compound',0.304,'#3f7a30','#5a9a40',{leaflet:'oval',wide:0.55,density:2}),bear:'along',fruit:F(0.018,{height:1.1,warts:0.35,dimple:0,stem:0},'#c81e3a','#c8c070',{count:60,per:3})}),
  // blackberry (thornless garden kinds): long arching canes; glossy black berries in groups along the canes
  blackberry:T({crown:'canes',droop:0.5,tropism:-0.1,stemAngle:35,seed:331,height:1.8,spread:2,trunk:0.01,bark:'#5a4a3a',leaf:LF('compound',0.323,'#2f6a2c','#4a8a38',{leaflet:'oval',wide:0.55,density:3}),bear:'along',fruit:F(0.022,{width:0.85,height:1.3,warts:0.35,dimple:0,stem:0},'#1a0a1e','#b8303a',{count:70,per:4})}),
  // currant: a many-stemmed shrub; lobed leaves; strings of small round berries hanging along the branches
  currant:T({crown:'shrub',seed:332,height:1.5,spread:1.2,trunk:0.015,leaf:LF('palmate',0.133,'#3f7a30','#5a9a40',{lobes:5,sinus:0.35,density:6}),bear:'chains',fruit:F(0.01,{dimple:0.3,stem:0},'#1a1020','#8aa050',{count:120,per:8,stalk:0.08})}),
  // climbers on their own posts and wires
  grape:{v:2,kind:'climber',train:'cordon',seed:333,height:1.4,arm:1.5,cane:0.8,stem:0.04,bark:'#6a5038',leaf:LF('palmate',0.2,'#4a7f34','#62983f',{lobes:5,sinus:0.3,density:4,fold:0.2}),fruit:{kind:'bunch',count:10,size:0.016,per:34,length:0.17,colorRipe:'#4a2050',colorUnripe:'#8ab050'}},
  passionfruit:{v:2,kind:'climber',train:'curtain',seed:334,height:1.8,arm:2,cane:0.9,stem:0.022,bark:'#5a6a3a',leaf:LF('palmate',0.18,'#2f6e2a','#4a8a38',{lobes:3,sinus:0.6,density:4,fold:0.25}),fruit:F(0.065,{height:1.05,dimple:0.3,stem:0.4},'#4a1f3a','#6a9a3a',{count:14})},
  kiwifruit:{v:2,kind:'climber',train:'canopy',seed:335,height:1.8,arm:2.2,stem:0.05,bark:'#6a5038',leaf:LF('round',0.2,'#4f8a3a','#6aa04a',{wide:0.95,density:2}),fruit:F(0.05,{width:0.8,height:1.2,fullness:0.85,dimple:0.4,stem:0.2,warts:0.02},'#8a6a3f','#8a7a4a',{count:36,per:2})},
  // banana: a clump of soft pseudostems; one bunch hangs from the top with the purple bell at its end
  banana:{v:2,kind:'banana',seed:336,height:4,spread:3.5,trunk:0.13,suckers:2,leaves:8,bark:'#6a5a3a',leaf:LF('paddle',1.7,'#4f9a3a','#6fae4a',{wide:0.34,density:1,fold:0.15,droop:0.5,wave:0.3}),fruit:{count:1,size:0.2,per:12,hands:6,colorRipe:'#f2d23a',colorUnripe:'#5f9a3a'}},
  // pawpaw: one trunk, a crown of huge lobed leaves; fruit packed round the trunk below the leaves
  papaya:{v:2,kind:'palm',seed:337,height:4,spread:2.6,trunk:0.13,leaves:14,petiole:0.75,bark:'#8a8a6a',leaf:LF('palmate',0.9,'#4a8a34','#68a245',{lobes:7,sinus:0.6,density:1,fold:0.2}),fruit:F(0.12,{width:0.8,height:1.45,fullness:0.8,taperTop:0.25,dimple:0,stem:0.05},'#f0a030','#4f8a3a',{count:10})},
  // cannabis: one main stem with pairs of side branches, longest near the ground (a Christmas-tree shape); hand-like leaves of 5 to 9
  // toothed leaflets; flower heads stand up at the top of the main stem and at each branch tip (legal to grow only in some places)
  cannabis:T({crown:'upright',fit:false,segs:16,seed:339,height:1.8,spread:1.1,trunk:0.025,trunkFrac:0.95,branchFrom:0.1,cone:true,leader:true,leafAlong:true,levels:2,kids:[0,16],angle:58,lenRatio:0.6,tropism:0.3,twist:0.08,droop:0,bark:'#7a8a4a',
    leaf:{shape:'fan',leaflets:7,wide:0.2,size:0.24,density:7,color:'#3f7f2f',color2:'#5a9a3a',fold:0.25,droop:0.3,wave:0.1},bear:'tips',fruit:F(0.06,{width:0.55,height:2.4,fullness:0.9,warts:0.4,dimple:0,stem:0,blush:0.22},'#b4d08a','#8ab860',{up:true,count:17,blush:'#d88a3a'})}),
  // pineapple: a rosette of stiff spiny leaves with the fruit on a short stalk in the middle
  pineapple:{v:2,kind:'leafy',form:'pine',seed:338,height:0.9,spread:1,leaves:22,leaf:{density:1,shape:'strap',wide:0.1,size:0.8,color:'#5a7a55',color2:'#7a8f6a',fold:0.55,droop:0.2},fruit:F(0.12,{width:0.85,height:1.6,fullness:0.85,scales:9,dimple:0,stem:0,crown:12},'#d8a030','#6a8a3a',{count:1,blush:'#c8b040'})},
};

/* spec.fit: the branches are stretched so a grown tree really is spec.height tall (leaf, fruit and trunk sizes stay real),
   worked out once per recipe from a quick bare-branch build */
const FIT=new WeakMap();
function fitScale(spec){ let f=FIT.get(spec); if(f) return f;
  const g=generate({...spec,fit:false},1,{level:'lod1',skeleton:true}); g.computeBoundingBox(); const b=g.boundingBox;
  const sy=Math.min(4,Math.max(0.25,spec.height/Math.max(0.05,b.max.y))), w=((b.max.x-b.min.x)+(b.max.z-b.min.z))/2;
  // the branch frame is stretched up and out separately, so the grown tree is spec.height tall and about spec.spread wide (leaves and fruit keep their size)
  const sx=spec.spread?Math.min(sy*1.8,Math.max(sy/1.8,(spec.spread*0.82)/Math.max(0.05,w))):sy;
  f={x:sx,y:sy}; FIT.set(spec,f); return f; }
export function generate(spec, stage=1, opts={}){
  const Q=PROFILES[opts.level]||PROFILES.low, R=rng(spec.seed||1), M=new Mesh(Q), st=Math.max(0.05,Math.min(1,stage));
  const L0=spec.leaf, lc=hex(L0.color), lc2=hex(L0.color2), bark=hex(spec.bark||'#6b4a2b'), green=hex('#4a7a35');
  M.cure=opts.cure||0;
  const leafQ = Q.dens*(opts.quality===undefined?1:opts.quality);
  const hero = spec.kind!=='tree';
  const lo={shape:L0.shape,wide:L0.wide,fold:L0.fold,droop:L0.droop,wave:L0.wave,veins:L0.veins,lobes:L0.lobes,sinus:L0.sinus,detail:hero?1:0};
  if(L0.midrib) lo.midrib=hex(L0.midrib);
  if(L0.pattern&&L0.pattern.kind&&(L0.pattern.amount===undefined||L0.pattern.amount>0)) lo.pat={kind:L0.pattern.kind,rgb:hex(L0.pattern.color||'#f0ecc8'),amount:L0.pattern.amount===undefined?0.85:L0.pattern.amount};
  let leafR=R; const col=()=>mix(lc,lc2,leafR());   // trees draw leaves from their own random stream, so the branches are the same at every detail level
  const big=Q.big||1;   // fewer leaves at low detail: make each one a little bigger so the crown does not look bare
  const place=(pos,dir,size0,extra)=>{ if(opts.skeleton) return; const size=size0*big;
    if(L0.shape==='fan'){             // palmately compound leaf (cannabis): a stalk, then 5 to 9 narrow toothed leaflets spread like fingers
      const f=dir.clone().normalize(), {s,n}=frame(f), base=pos.clone().addScaledVector(f,size*0.35); M.tube([pos.clone(),base],0.004,0.003,green,3);
      const k=L0.leaflets||7; for(let i=0;i<k;i++){ const a=(i/(k-1)-0.5)*Math.PI*1.25, ld=f.clone().multiplyScalar(Math.cos(a)).addScaledVector(s,Math.sin(a)).addScaledVector(n,-0.15).normalize();
        M.leaf(base,ld,size*(0.75-0.45*Math.abs(i/(k-1)-0.5)*2)*0.9,col(),{...lo,shape:'serrate',wide:L0.wide||0.22}); }
      return; }
    if(L0.shape==='compound'){        // pinnate leaf: rachis + leaflet pairs
      const f=dir.clone().normalize(), {s,n}=frame(f), pts=[pos.clone(),pos.clone().addScaledVector(f,size*0.5).addScaledVector(n,-size*0.08),pos.clone().addScaledVector(f,size).addScaledVector(n,-size*0.3)];
      M.tube(pts,0.004,0.002,green,3);
      [0.3,0.55,0.78].forEach((t,i)=>{ const q=pts[1].clone().lerp(pts[0],1-t/0.5>0?1-t/0.5:0); const base=pos.clone().addScaledVector(f,size*t).addScaledVector(n,-size*0.3*t*t);
        for(const sd of [1,-1]){ const ld=f.clone().multiplyScalar(0.55).addScaledVector(s,sd*0.85).addScaledVector(n,-0.1).normalize(); M.leaf(base,ld,size*(0.42-0.08*i),col(),{...lo,shape:L0.leaflet||'oval',detail:1,wide:L0.wide}); } });
      M.leaf(pts[2],f.clone().addScaledVector(n,-0.2),size*0.36,col(),{...lo,shape:L0.leaflet||'oval',detail:1,wide:L0.wide});
    } else M.leaf(pos,dir,size,col(),lo);
  };
  const fruitSpec=spec.fruit||{count:0}, ripe=Math.max(0,(st-0.6)/0.4);
  const fruitAt=[];

  if(spec.kind==='tree'){
    const H=spec.height*(0.15+0.85*st), tw=spec.trunk*(0.2+0.8*st), fs_=spec.fit&&!opts.skeleton?fitScale(spec):{x:1,y:1};
    const branch=(p,d,len,rad,lvl)=>{
      const pts=[p.clone()]; const n=lvl===0&&spec.segs?spec.segs:6; let cur=p.clone(), dd=d.clone();
      for(let k=1;k<=n;k++){
        dd.x+=(R()-0.5)*spec.twist*0.4; dd.z+=(R()-0.5)*spec.twist*0.4; dd.y+=spec.tropism*0.1-spec.droop*0.05*(lvl>0?1:0); dd.normalize();
        cur=cur.clone().add(V(dd.x*fs_.x,dd.y*(dd.y>0?fs_.y:Math.min(1,fs_.x)),dd.z*fs_.x).multiplyScalar(len/n)); pts.push(cur);   // stretched up by the fit, never a hanging branch down
      }
      M.tube(pts,rad,rad*spec.taper,bark,lvl<2?8:5);
      if(lvl>=spec.levels-1){
        const cnt=Math.max(1,Math.round(L0.density*leafQ));
        for(let j=0;j<cnt;j++){ const q=pts[spec.leafAlong?1+(j%(pts.length-1)):Math.max(1,pts.length-1-(j%3))]; const ld=V(leafR()-0.5,leafR()*0.6+0.1-spec.droop*0.6,leafR()-0.5).normalize(); place(q,ld,L0.size*(0.4+0.8*st)); }
        tips.push({p:pts[pts.length-1].clone(),d:dd.clone()}); along.push({p:pts[2].clone(),d:dd.clone()},{p:pts[4].clone(),d:dd.clone()});
        return; }
      if(lvl===spec.levels-2) along.push({p:pts[3].clone(),d:dd.clone()},{p:pts[5].clone(),d:dd.clone()});
      const kids=spec.kids[lvl+1]||3;
      for(let k=0;k<kids;k++){
        const bf=spec.branchFrom===undefined?0.45:spec.branchFrom, t=bf+(1-bf)*(k+R()*0.5)/kids, idx=Math.min(pts.length-1,Math.floor(t*(pts.length-1))), q=pts[idx];
        const ang=spec.angle*Math.PI/180*(0.7+R()*0.6), az=(k/kids)*Math.PI*2+R();
        const a=Math.abs(dd.y)<0.9?V(0,1,0):V(1,0,0), u=a.clone().cross(dd).normalize(), w=dd.clone().cross(u);
        const nd=dd.clone().multiplyScalar(Math.cos(ang)).addScaledVector(u,Math.sin(ang)*Math.cos(az)).addScaledVector(w,Math.sin(ang)*Math.sin(az));
        nd.y-=spec.droop*0.4; nd.normalize();
        branch(q,nd,len*spec.lenRatio*(0.8+R()*0.4)*(spec.cone&&lvl===0?Math.max(0.25,1.4-t):1),rad*spec.taper*0.8,lvl+1);   // cone: lower branches longer (a Christmas-tree shape)
      }
      if(lvl===0) trunkTop={p:pts[pts.length-1].clone(),d:dd.clone()};
      if(lvl>0||spec.leader){ const cnt=Math.round(L0.density*0.5*leafQ); for(let j=0;j<cnt;j++){ place(pts[pts.length-1],V(leafR()-0.5,leafR()*0.5,leafR()-0.5).normalize(),L0.size*0.8*st);} }
    };
    const tips=[], along=[]; let trunkTop=null;
    leafR=rng((spec.seed||1)*7+3);
    const nS=spec.stems||1;
    if(nS>1){ for(let k=0;k<nS;k++){ const az=k/nS*6.283+R()*0.5, lean=(spec.stemAngle||20)*Math.PI/180*(0.6+0.8*R());   // shrubs and canes: several stems from the ground
        branch(V(Math.cos(az)*0.03,0,Math.sin(az)*0.03),V(Math.cos(az)*Math.sin(lean),Math.cos(lean),Math.sin(az)*Math.sin(lean)),H*(spec.trunkFrac||0.55)*(0.8+0.4*R()),tw*(0.7+0.3*R()),0); } }
    else branch(V(0,0,0),V(0,1,0),H*(spec.trunkFrac||0.55),tw,0);
    if(spec.leader&&trunkTop) tips.unshift(trunkTop);   // the main stem ends in the biggest flower head
    if(fruitSpec.count&&!opts.skeleton) bear(spec,fruitSpec,tips,along,fruitAt,M,R,st);
  } else if(spec.kind==='palm'){   // pawpaw: one straight unbranched trunk, a crown of big deeply lobed leaves on long stalks, fruit packed round the trunk under the crown
    const H=spec.height*(0.15+0.85*st), tw=spec.trunk*(0.3+0.7*st), lean=V((R()-0.5)*0.08,1,(R()-0.5)*0.08).normalize(), top=lean.clone().multiplyScalar(H);
    const tp=[0,0.25,0.5,0.75,1].map(t=>lean.clone().multiplyScalar(H*t)); M.tube(tp,tw,tw*0.6,bark,8);
    for(let k=0;k<6;k++){ const y=H*(0.3+0.1*k); M.tube([lean.clone().multiplyScalar(y),lean.clone().multiplyScalar(y+0.02)],tw*(1-0.4*y/H)*1.08,tw*(1-0.4*y/H)*1.08,mix(bark,[0.85,0.8,0.7],0.35),8); }   // leaf scars
    const nl=Math.max(6,Math.round((spec.leaves||14)*Math.min(1.2,Q.dens+0.3))), P=(spec.petiole||0.7)*(0.4+0.6*st);
    for(let k=0;k<nl;k++){ const t=k/(nl-1||1), az=k*2.39996, el=1.15-1.25*t, d=V(Math.cos(az)*Math.cos(el),Math.sin(el),Math.sin(az)*Math.cos(el)), end=top.clone().addScaledVector(d,P);
      M.tube([top.clone(),top.clone().addScaledVector(d,P*0.5).add(V(0,P*0.06,0)),end],0.012,0.008,mix(green,[0.8,0.8,0.5],0.2),4);
      M.leaf(end,V(d.x,Math.max(-0.4,d.y*0.4-0.05),d.z),L0.size*(0.4+0.6*st)*(t>0.1?1:0.6),col(),{...lo,detail:1}); }
    if(fruitSpec.count) for(let f=0;f<fruitSpec.count;f++){ const ring=Math.floor(f/5), az=f*1.3+ring*0.6, y=H-0.08-ring*fruitSpec.size*fruitSpec.shape.height*0.9, out=V(Math.cos(az),0,Math.sin(az)), c=lean.clone().multiplyScalar(y);
      fruitAt.push(c.addScaledVector(out,tw*0.8+fruitSpec.size*fruitSpec.shape.width*0.45)); }
  } else if(spec.kind==='banana'){   // a clump: the main pseudostem with one or two younger suckers; huge paddle leaves arch from the top; one hanging bunch
    const H=spec.height*(0.15+0.85*st);
    const stems=[[0,0,1]].concat([...Array(spec.suckers===undefined?2:spec.suckers)].map((_,i)=>{ const a=i*2.6+1; return [Math.cos(a)*0.35,Math.sin(a)*0.35,0.45+0.2*i]; }));
    let mainTop=null;
    stems.forEach(([x,z,sc],si)=>{ const h=H*0.62*sc, r=(spec.trunk||0.12)*(0.4+0.6*st)*(0.6+0.4*sc), base=V(x,0,z), top=V(x+(R()-0.5)*0.05,h,z+(R()-0.5)*0.05);
      M.tube([base,base.clone().lerp(top,0.5),top],r,r*0.75,mix(bark,green,0.45),8); if(si===0) mainTop=top;
      const nl=Math.max(4,Math.round((spec.leaves||8)*(0.6+0.4*sc)*Math.min(1.2,Q.dens+0.3)));
      for(let k=0;k<nl;k++){ const t=k/(nl-1||1), az=k*2.39996+si, el=1.3-1.0*t, d=V(Math.cos(az)*Math.cos(el),Math.sin(el),Math.sin(az)*Math.cos(el)), pe=top.clone().addScaledVector(d,0.35*sc);
        M.tube([top.clone(),pe],0.025*sc,0.018*sc,green,4); M.leaf(pe,d,L0.size*(0.35+0.65*st)*sc*(0.8+0.2*(1-t)),col(),{...lo,detail:1,droop:(L0.droop||0.5)+0.3*t}); } });
    if(fruitSpec.count && ripe>0 && mainTop) M.bananas(mainTop,fruitSpec,Math.min(1,ripe),R);
  } else if(spec.kind==='climber'){ climber(M,spec,st,R,Q,col,lo,green,bark,fruitSpec,fruitAt,ripe);
  } else if(spec.kind==='vine'){
    const Lv=spec.length*(0.1+0.9*st);
    const run=(p,dir,len,r)=>{
      const pts=[p.clone()]; let cur=p.clone(); const d=dir.clone(); const n=Math.max(4,Math.round(len*5));
      for(let k=1;k<=n;k++){ d.x+=(R()-0.5)*0.5; d.z+=(R()-0.5)*0.5; d.y=0; d.normalize(); cur=cur.clone().addScaledVector(d,len/n); cur.y=0.03+0.015*Math.sin(k); pts.push(cur);
        if(k%2===0){ const side=(k%4===0?1:-1); const pd=V(-d.z*side,0,d.x*side).normalize();
          const top=cur.clone().addScaledVector(pd,0.12).setY(0.28+R()*0.1);
          M.tube([cur.clone(),cur.clone().addScaledVector(pd,0.05).setY(0.16),top],0.011,0.008,green,4);
          const dir2=V(pd.x,0.18,pd.z).normalize().applyAxisAngle(UP,(R()-0.5)*0.8);
          M.leaf(top,dir2,L0.size*(0.4+0.7*st),col(),{...lo,detail:1}); }
        if(k%5===0){ const cd=V(-d.z,0,d.x); M.tube([cur.clone(),cur.clone().addScaledVector(cd,0.12).setY(0.1),cur.clone().addScaledVector(cd,0.1).addScaledVector(d,0.1).setY(0.08)],0.003,0.002,green,3); } // tendril
      }
      M.tube(pts,r,r*0.5,green,5); return pts;
    };
    const main=run(V(0,0.03,0),V(1,0,0.2),Lv,spec.stem);
    for(let s=0;s<spec.sideVines;s++){ const q=main[Math.floor((s+1)/(spec.sideVines+1)*main.length)]; const side=s%2?1:-1; run(q,V(0.2,0,side).normalize(),Lv*0.45,spec.stem*0.7); }
    for(let f=0;f<fruitSpec.count;f++) fruitAt.push(main[Math.min(main.length-1,Math.floor((0.25+0.2*f)*main.length))].clone().add(V((R()-0.5)*0.3,0,(R()-0.5)*0.5)).setY(0));
  } else if(spec.kind==='rosette'){      // bush squash: a ring of big long-stalked leaves, fruit on the ground between
    const H=spec.height*(0.2+0.8*st), nl=spec.leaves||9;
    for(let k=0;k<nl;k++){ const az=k*2.4+R()*0.3, up=0.45+0.55*(k/nl), reach=spec.spread*0.5*(0.35+0.65*st)*(0.6+0.4*(1-k/nl)), dir=V(Math.cos(az),0,Math.sin(az));
      const top=V(dir.x*reach*0.55,H*up,dir.z*reach*0.55);
      M.tube([V(dir.x*0.02,0,dir.z*0.02),V(dir.x*reach*0.15,H*up*0.55,dir.z*reach*0.15),top],spec.stem,spec.stem*0.7,green,5);
      M.leaf(top,V(dir.x,0.12,dir.z),L0.size*(0.35+0.65*st),col(),{...lo,detail:1}); }
    for(let f=0;f<fruitSpec.count;f++){ const a=f/Math.max(1,fruitSpec.count)*6.283+0.6, r=0.12+0.1*(f%2); fruitAt.push(V(Math.cos(a)*r,0,Math.sin(a)*r)); }
  } else if(spec.kind==='leafy'){ leafy(M,spec,st,R,Q,col,lo,green,fruitAt);
  } else {
    const H=spec.height*(0.1+0.9*st), n=spec.joints, pts=[]; let cur=V(0,0,0);
    for(let k=0;k<=n;k++){ cur=V((R()-0.5)*0.03*k, H*k/n, (R()-0.5)*0.03*k); pts.push(cur.clone()); }
    M.tube(pts,spec.stem,spec.stem*0.5,green,6);
    for(let k=1;k<=n;k++){ const az=k*2.4+R()*0.4, d=V(Math.cos(az),spec.kind==='stalk'?0.75-k/n*0.45:0.35,Math.sin(az)).normalize();
      const cnt=Math.max(1,Math.round(L0.density*leafQ));
      for(let j=0;j<cnt;j++){ const a=d.clone().applyAxisAngle(UP,j*2.4); const sz=L0.size*(1-0.35*k/n)*(0.3+0.7*st);
        if(spec.kind==='stalk'&&L0.shape==='heart'){ const lp=pts[k].clone().addScaledVector(a,sz*0.35).add(V(0,sz*0.08,0)); M.tube([pts[k].clone(),lp],0.008,0.005,green,3); place(lp,a,sz); } else place(pts[k],a,sz); }
      if(spec.kind==='bush' && fruitSpec.count && k>3 && k%3===0){ for(let f=0;f<3;f++) fruitAt.push(pts[k].clone().add(V(Math.cos(az+f)*0.09,-0.1-0.03*f,Math.sin(az+f)*0.09))); }
    }
    if(spec.kind==='stalk' && fruitSpec.shape.kind==='head'){ fruitAt.length=0; fruitAt.push(pts[n].clone().add(V(0.1,0.02,0))); }
    else if(spec.kind==='stalk') for(let f=0;f<fruitSpec.count;f++){ const k=Math.max(2,spec.joints-4-f*2); fruitAt.push(pts[k].clone().add(V(0.06,0.0,0))); }
  }
  if(fruitSpec.count && ripe>0){ let c=0; for(const p of fruitAt){ if(c++>=fruitSpec.count) break;
      if(fruitSpec.kind==='bunch'){ M.bunch(p,fruitSpec,Math.min(1,ripe),R); continue; }
      const down = ['tree','bush','palm','climber'].includes(spec.kind) && !fruitSpec.up;
      if(down){ M.fruit(p.clone().add(V(0,-fruitSpec.size*fruitSpec.shape.height*(0.3+0.7*Math.min(1,ripe)),0)),fruitSpec,Math.min(1,ripe),R); }
      else M.fruit(p,fruitSpec,Math.min(1,ripe),R); } }
  return M.geometry();
}
/* Where fruit grows on a tree or shrub (spec.bear), checked against growing guides (reference only):
     tips    at the ends of shoots (citrus inside the canopy, pomegranate, quince, walnut, pecan, chestnut)
     spurs   on short spurs along older branches (apple, pear, plum, apricot, cherry, almond): clusters hang close to the wood
     along   singly or in small groups along this year's shoots (peach, fig at the leaf bases, mulberry, olive, coffee, hazelnut)
     stalks  hanging on long stalks from the branch ends (mango in loose groups, avocado)
     chains  strings hanging from the branches (macadamia racemes, currant strings)
   fruit.per is how many fruit sit together at one place; fruit.stalk is the hanging stalk length in metres. */
function bear(spec,fs,tips,along,fruitAt,M,R,st){
  const mode=spec.bear||'tips', per=Math.max(1,fs.per||1), groups=Math.max(1,Math.round(fs.count/per)), pool=(mode==='spurs'||mode==='along')?(along.length?along:tips):tips;
  if(!pool.length) return;
  const order=pool.map((x,i)=>[spec.leader&&i===0&&pool===tips?-1:R(),i]).sort((a,b)=>a[0]-b[0]).map(x=>pool[x[1]]), stalkC=hex('#5a6a2a'), sz=fs.size*(fs.shape?fs.shape.height:1);
  for(let g=0;g<groups;g++){ const a=order[g%order.length], p=a.p.clone(), side=V(-a.d.z,0,a.d.x).normalize();
    if(mode==='tips'&&!fs.up) p.lerp(V(0,p.y,0),0.06);   // pulled a little into the leaves
    if(mode==='stalks'){ const L=(fs.stalk||0.15)*(0.4+0.6*st), end=p.clone().add(V((R()-0.5)*0.06,-L,(R()-0.5)*0.06)); M.tube([p.clone(),p.clone().lerp(end,0.5).addScaledVector(side,0.02),end],0.005,0.004,stalkC,3);
      for(let k=0;k<per;k++) fruitAt.push(end.clone().addScaledVector(side,(k-(per-1)/2)*fs.size*0.9).add(V(0,-k*0.01,0))); continue; }
    if(mode==='chains'){ const L=(fs.stalk||0.2)*(0.4+0.6*st), end=p.clone().add(V((R()-0.5)*0.04,-L,(R()-0.5)*0.04)); M.tube([p.clone(),end],0.003,0.002,stalkC,3);
      for(let k=0;k<per;k++){ const t=0.3+0.7*k/Math.max(1,per-1), q=p.clone().lerp(end,t), az=k*2.4; fruitAt.push(q.add(V(Math.cos(az)*fs.size*0.6,sz*0.5,Math.sin(az)*fs.size*0.6))); } continue; }
    for(let k=0;k<per;k++){ const az=k*2.39996+R(), r=per>1?fs.size*0.75*Math.sqrt(k+0.5):0; fruitAt.push(p.clone().add(V(Math.cos(az)*r,-0.01-(mode==='spurs'?0.01:0),Math.sin(az)*r))); } }
  fruitAt.length=Math.min(fruitAt.length,fs.count);
}
/* Climbers on their own support: posts and a wire (spec.train):
     cordon   grape: a trunk to the wire, two arms along it, upright canes with leaves, bunches hanging under the arms
     curtain  passionfruit: a stem to the wire, runners both ways, a curtain of hanging shoots with leaves, fruit hanging in it
     canopy   kiwifruit: a trunk to the top, arms spread flat both ways, a flat roof of leaves, fruit hanging underneath */
function climber(M,spec,st,R,Q,col,lo,green,bark,fs,fruitAt,ripe){
  const H=spec.height||1.8, arm=(spec.arm||1.5)*(0.25+0.75*st), train=spec.train||'cordon', L0=spec.leaf, wood=hex(spec.post||'#8a7a64'), wire=hex('#9aa3a6');
  if(spec.support!==false){ const pw=spec.arm||1.5;
    if(train==='canopy'){ for(const [x,z] of [[-pw,0],[pw,0]]){ M.tube([V(x,0,z),V(x,H+0.05,z)],0.05,0.05,wood,5); M.tube([V(x,H,-pw*0.5),V(x,H,pw*0.5)],0.03,0.03,wood,4); }
      for(const z of [-pw*0.45,0,pw*0.45]) M.tube([V(-pw,H+0.02,z),V(pw,H+0.02,z)],0.004,0.004,wire,3); }
    else { for(const x of [-pw-0.1,pw+0.1]) M.tube([V(x,0,0),V(x,H+(train==='cordon'?0.6:0.1),0)],0.045,0.045,wood,5);
      for(const y of train==='cordon'?[H,H+0.3,H+0.55]:[H]) M.tube([V(-pw-0.1,y,0),V(pw+0.1,y,0)],0.003,0.003,wire,3); } }
  const st0=spec.stem||0.035, trunkTop=V((R()-0.5)*0.05,H*0.97,0);
  M.tube([V(0,0,0),V(0.03,H*0.35,0.02),V(-0.02,H*0.7,-0.01),trunkTop],st0,st0*0.75,bark,6);
  const leafAt=(p,d,s)=>M.leaf(p,d,s,col(),{...lo,detail:1}), Ls=L0.size*(0.45+0.55*st), nPer=Math.max(1,Math.round(L0.density*Math.min(1.3,Q.dens+0.3)));
  if(train==='cordon'){
    for(const sd of [-1,1]){ const end=V(sd*arm,H,0); M.tube([trunkTop,V(sd*arm*0.3,H+0.01,0),V(sd*arm*0.7,H-0.01,0),end],st0*0.7,st0*0.4,bark,5);
      const n=Math.max(2,Math.round(arm/0.22));
      for(let i=1;i<=n;i++){ const x=sd*arm*i/n, b=V(x,H,0), ch=(spec.cane||0.8)*(0.3+0.7*st), tip=b.clone().add(V((R()-0.5)*0.15,ch,(R()-0.5)*0.2));
        M.tube([b,b.clone().lerp(tip,0.5).add(V(0,0,(R()-0.5)*0.08)),tip],0.008,0.004,mix(green,bark,0.4),4);
        const nl=Math.max(2,Math.round(4*nPer/2)); for(let j=0;j<nl;j++){ const q=b.clone().lerp(tip,(j+0.6)/nl), az=j*2.6+i; leafAt(q,V(Math.cos(az),0.25,Math.sin(az)).normalize(),Ls); }
        if(i%2===0 && fs.count && fruitAt.length<fs.count) fruitAt.push(b.clone().add(V((R()-0.5)*0.05,-0.02,(R()-0.5)*0.12))); } } }
  else if(train==='curtain'){
    for(const sd of [-1,1]){ const run=[trunkTop.clone()]; for(let i=1;i<=6;i++) run.push(V(sd*arm*i/6,H+0.03*Math.sin(i*1.7),(R()-0.5)*0.06)); M.tube(run,st0*0.5,st0*0.3,green,4);
      const n=Math.max(2,Math.round(arm/0.25));
      for(let i=1;i<=n;i++){ const b=V(sd*arm*i/n,H,(R()-0.5)*0.08), drop=(spec.cane||0.9)*(0.3+0.7*st)*(0.6+0.4*R()), d0=V((R()-0.5)*0.2,-drop,(R()-0.5)*0.3+(i%2?0.12:-0.12)), tip=b.clone().add(d0);
        M.tube([b,b.clone().add(V(0,0.06,d0.z*0.3)),b.clone().lerp(tip,0.6),tip],0.006,0.003,green,3);
        const nl=Math.max(2,Math.round(3*nPer/2)); for(let j=0;j<nl;j++){ const q=b.clone().lerp(tip,(j+0.3)/nl), az=j*2.4+i; leafAt(q,V(Math.cos(az),-0.2,Math.sin(az)).normalize(),Ls); }
        if(fs.count && fruitAt.length<fs.count && R()<0.7) fruitAt.push(b.clone().lerp(tip,0.35+0.4*R()).add(V(0,0,(R()-0.5)*0.1))); } } }
  else {   // canopy
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){ const end=V(dx*arm,H,dz*arm*0.5); M.tube([trunkTop,trunkTop.clone().lerp(end,0.5).add(V(0,0.03,0)),end],st0*0.6,st0*0.35,bark,5); }
    const n=Math.max(8,Math.round(arm*arm*40*Math.min(1.2,Q.dens+0.3)));
    for(let i=0;i<n;i++){ const x=(R()*2-1)*arm, z=(R()*2-1)*arm*0.5, p=V(x,H+0.04+R()*0.08,z); leafAt(p,V(R()-0.5,0.35,R()-0.5).normalize(),Ls);
      if(fs.count && fruitAt.length<fs.count && i%2===0) for(let k=0;k<(fs.per||1)&&fruitAt.length<fs.count;k++) fruitAt.push(V(x+k*fs.size*0.9,H-0.01,z)); } }
}
/* Leafy vegetables and herbs (form): loose = lettuce, head = cabbage, curd = cauliflower / broccoli, tall = kale, stalks = chard and beetroot,
   strap = onion / garlic / leek, fern = carrot, mound = herbs, low = strawberry.  Checked against growing guides and photos (reference only):
   cabbage wrapper leaves around a dense head on a short stout stem, waxy blue-green or purple; chard glossy blades on white, yellow or red
   stalks; leeks fan their flat leaves in two directions above a white shank. */
function leafy(M,spec,st,R,Q,col,lo,green,fruitAt){
  const L0=spec.leaf, H=spec.height*(0.2+0.8*st), RAD=spec.spread*0.5*(0.35+0.65*st), form=spec.form||'loose';
  const nl=Math.max(form==='strap'?4:5, Math.round((spec.leaves||12)*Math.min(1.3,Math.max(0.55,Q.dens))*(0.5+0.5*st)));
  const opt={...lo,detail:L0.size>0.09?1:0,ruffle:L0.ruffle||0}, sc=(spec.stalkColors||[spec.stalk||'#c9d98a']).map(hex), hd=spec.head;
  const leafAt=(p,dir,size,c,o={})=>M.leaf(p,dir,size,c||col(),{...opt,...o});
  const dirOf=(az,el)=>V(Math.cos(az)*Math.cos(el),Math.sin(el),Math.sin(az)*Math.cos(el));
  const headR=hd?RAD*(hd.size||0.45)*(0.3+0.7*st):0;
  if(form==='loose'||form==='head'||form==='curd'){
    // outer leaves splay low and wide, inner ones stand up and stay small; a head sits in the middle
    for(let k=0;k<nl;k++){ const t=k/(nl-1||1), az=k*2.39996+R()*0.25, inner=1-t, el=(form==='loose'?0.75:form==='head'?0.22:0.55)+inner*(form==='loose'?0.7:0.55);
      const sz=L0.size*(0.35+0.65*st)*(form==='loose'?0.7+0.3*t:0.75+0.25*t), base=V(Math.cos(az)*0.015,0.01+(form==='curd'?H*0.08:0),Math.sin(az)*0.015);
      leafAt(base,dirOf(az,el),sz,null,{fold:(L0.fold||0.3)+inner*0.25}); }
    if(hd && form!=='loose'){ const hc=V(0,headR*(form==='curd'?0.55:0.85)+(form==='curd'?H*0.22:0.02),0);
      M.ball(hc,headR,headR*(form==='curd'?0.62:0.9),hex(hd.color),hex(hd.color2||hd.color),{bumps:hd.bumps||0,freq:hd.freq||9,veins:hd.veins||0,half:form==='curd'});
      if(form==='head') for(let k=0;k<3;k++){ const az=k*2.1+0.4; leafAt(V(Math.cos(az)*headR*0.7,0.02,Math.sin(az)*headR*0.7),dirOf(az+Math.PI,1.15),headR*1.9,mix(hex(hd.color),hex(L0.color),0.5),{fold:0.9,droop:-0.15}); } }
  } else if(form==='tall'){   // kale: a short stem, long frilly leaves arching out, a tuft of young leaves on top
    const sh=H*0.35; M.tube([V(0,0,0),V(0,sh,0)],0.018,0.014,green,6);
    for(let k=0;k<nl;k++){ const t=k/(nl-1||1), az=k*2.39996, y=sh*(0.35+0.65*t), el=0.55+0.6*t; leafAt(V(0,y,0),dirOf(az,el),L0.size*(0.4+0.6*st)*(1-0.4*t)); }
  } else if(form==='stalks'){   // chard and beetroot: upright leaves on coloured stalks
    for(let k=0;k<nl;k++){ const t=k/(nl-1||1), az=k*2.39996+R()*0.2, el=0.95+0.35*(1-t)-0.25*t, d=dirOf(az,el), L=H*(spec.stalkFrac||0.4)*(0.6+0.4*(1-t)), c=sc[k%sc.length];
      const top=d.clone().multiplyScalar(L); M.tube([V(0,0,0),top.clone().multiplyScalar(0.5).add(V(0,L*0.05,0)),top],spec.stem||0.012,(spec.stem||0.012)*0.7,c,5);
      leafAt(top,dirOf(az,el-0.08),L0.size*(0.4+0.6*st)*(0.7+0.3*(1-t)),null,{midrib:c,droop:0.1}); }
    if(hd) M.ball(V(0,headR*0.35,0),headR,headR*0.9,hex(hd.color),hex(hd.color2||hd.color),{half:true});
  } else if(form==='strap'){   // onion, garlic, leek: upright strap leaves (a flat fan for leeks) above a bulb or a white shank
    const fan=spec.fan, shank=spec.shank?H*spec.shank:0;
    if(shank) M.tube([V(0,0,0),V(0,shank,0)],RAD*0.16,RAD*0.14,hex(spec.stalk||'#e8ecd8'),8);
    for(let k=0;k<nl;k++){ const t=k/(nl-1||1), az=fan?(k%2?Math.PI:0)+(R()-0.5)*0.25:k*2.39996, el=1.45-(fan?0.55:0.25)*t-R()*0.12;
      leafAt(V(0,shank*(fan?0.6+0.4*t:1),0),dirOf(az,el),(H-shank)*(0.75+0.35*(1-t))*(fan?1:1.05),null,{wide:L0.wide,fold:0.45,droop:0.15+0.25*t}); }
    if(hd) M.ball(V(0,headR*0.6,0),headR,headR*0.8,hex(hd.color),hex(hd.color2||hd.color),{veins:hd.veins||0});
  } else if(form==='pine'){   // pineapple: a rosette of stiff, spiny grey-green leaves; the fruit sits on a short stalk in the middle
    for(let k=0;k<nl;k++){ const t=k/(nl-1||1), az=k*2.39996+R()*0.2, el=0.35+0.9*t; leafAt(V(0,0.02,0),dirOf(az,el),H*(0.72-0.2*t),null,{wide:L0.wide,fold:0.55,droop:0.25*(1-t)}); }
    const fs=spec.fruit; if(fs&&fs.count){ const sh=H*0.45; M.tube([V(0,0,0),V(0,sh,0)],0.018,0.016,green,5); fruitAt.push(V(0,sh,0)); }
  } else if(form==='fern'){   // carrot: fine feathery fronds on thin stalks
    for(let k=0;k<nl;k++){ const az=k*2.39996, el=1.05-0.3*(k%3)/2, d=dirOf(az,el), L=H*0.9, top=d.clone().multiplyScalar(L);
      M.tube([V(0,0,0),top],0.004,0.002,green,3); const n=Math.max(3,Math.round(6*Math.min(1,Q.leaf+0.2)));
      for(let j=1;j<=n;j++){ const p=d.clone().multiplyScalar(L*(0.35+0.65*j/n)); for(const sd of [1,-1]) leafAt(p,dirOf(az+sd*1.2,el-0.4),L0.size*(1.1-0.5*j/n)*(0.4+0.6*st),null,{wide:0.5,fold:0.1}); } }
    if(hd) M.ball(V(0,0.005,0),headR,headR*0.6,hex(hd.color),hex(hd.color2||hd.color),{half:true});
  } else if(form==='low'){   // strawberry: trifoliate leaves on long stalks, berries on the ground around
    for(let k=0;k<nl;k++){ const az=k*2.39996+R()*0.3, f=(k*0.618)%1, el=0.55+0.7*f, d=dirOf(az,el), L=H*(0.5+0.5*(1-f)), top=d.clone().multiplyScalar(L);   // inner leaves stand up on shorter stalks, so the middle is not empty
      M.tube([V(0,0,0),top.clone().multiplyScalar(0.5).add(V(0,L*0.15,0)),top],0.004,0.003,green,3);
      for(const da of [-0.7,0,0.7]) leafAt(top,dirOf(az+da,0.25),L0.size*(0.5+0.5*st)); }
    const fs=spec.fruit; if(fs&&fs.count) for(let f=0;f<fs.count;f++){ const a=f/fs.count*6.283+0.3, r=RAD*0.75; fruitAt.push(V(Math.cos(a)*r,0.0,Math.sin(a)*r)); }
  } else {   // mound: herbs, a dome of small leaves on short stems
    const stems=Math.max(4,Math.round(nl/2)), pairs=Math.max(3,Math.round(6*Math.min(1,Q.dens)));
    for(let s=0;s<stems;s++){ const az=s*2.39996, el=0.75+0.6*(s%3)/2+R()*0.15, d=dirOf(az,el), len=H*(0.75+0.3*R()), top=d.clone().multiplyScalar(len); M.tube([V(0,0,0),top],0.005,0.003,green,3);
      for(let j=1;j<=pairs;j++){ const p=d.clone().multiplyScalar(len*(0.25+0.75*j/pairs)); for(const sd of [1,-1]) leafAt(p,dirOf(az+sd*1.4+j*0.9,0.45),L0.size*(0.6+0.4*st)*(1.25-j/pairs*0.4)); } leafAt(top,dirOf(az,1.2),L0.size*0.8); }
  }
}
export function stats(g){ return {tris:g.index.count/3, verts:g.attributes.position.count}; }
// one fruit on its own at full ripeness (for the close-up row)
export function fruitGeometry(spec, ripe=1, level='low'){ const M=new Mesh(PROFILES[level]||PROFILES.low), R=rng((spec.seed||1)+99); M.fruit(V(0,0,0),spec.fruit,ripe,R); return M.geometry(); }

// Rough size of a grown plant: height h and canopy radius r in metres (used to pick how much detail to draw).
export function extent(spec, stage=1){
  const st=Math.max(0.05,Math.min(1,stage));
  if(spec.kind==='tree'){ const h=spec.height*(0.15+0.85*st); return {h, r:(spec.spread||spec.height*0.9)*0.5*(0.2+0.8*st)}; }
  if(spec.kind==='vine'){ return {h:0.5, r:spec.length*(0.1+0.9*st)*0.55}; }
  if(spec.kind==='palm'||spec.kind==='banana'){ return {h:spec.height*(0.15+0.85*st), r:(spec.spread||spec.height*0.6)*0.5*(0.3+0.7*st)}; }
  if(spec.kind==='climber'){ return {h:(spec.height||1.8)+(spec.train==='cordon'?(spec.cane||0.8)*st:0.1), r:(spec.arm||1.5)*(0.25+0.75*st)+0.1}; }
  if(spec.kind==='rosette'||spec.kind==='leafy'){ return {h:spec.height*(0.2+0.8*st), r:spec.spread*0.5*(0.35+0.65*st)}; }
  const h=spec.height*(0.1+0.9*st); return {h, r:Math.max(0.25,h*(spec.kind==='stalk'?0.18:0.3))};
}
// Very cheap stand-in for far-away plants: a trunk and one blob (tree), a low mound (vine, rosette) or a leafy blob (bush, stalk).
// Under 60 triangles. Same colours as the real plant so a field does not change colour as you zoom.
export function proxyGeometry(spec, stage=1){
  const M=new Mesh(PROFILES.lod1), e=extent(spec,stage), lc=mix(hex(spec.leaf.color),hex(spec.leaf.color2),0.5), bark=hex(spec.bark||'#6b4a2b');
  const blob=(cy,ry,rx,rz=rx)=>{ const S=7,T=4,rows=[]; const top=M.vert(V(0,cy+ry,0),mix(lc,[1,1,0.7],0.2));
    for(let t=1;t<=T;t++){ const a=t/T*Math.PI*0.95, row=[]; for(let s=0;s<S;s++){ const b=s/S*Math.PI*2; row.push(M.vert(V(Math.cos(b)*Math.sin(a)*rx,cy+Math.cos(a)*ry,Math.sin(b)*Math.sin(a)*rz),mix(lc,[0.05,0.15,0.05],t/T*0.45))); } rows.push(row); }
    for(let s=0;s<S;s++) M.tri(top,rows[0][(s+1)%S],rows[0][s]);
    for(let t=0;t<T-1;t++) for(let s=0;s<S;s++){ const n=(s+1)%S; M.tri(rows[t][s],rows[t][n],rows[t+1][s]); M.tri(rows[t][n],rows[t+1][n],rows[t+1][s]); } };
  if(spec.kind==='tree'){ const th=e.h*(spec.trunkFrac||0.4); M.tube([V(0,0,0),V(0,th,0)],spec.trunk*(0.2+0.8*Math.max(0.05,stage)),spec.trunk*0.5*(0.2+0.8*Math.max(0.05,stage)),bark,4); blob(th+(e.h-th)*0.5,(e.h-th)*0.55,e.r); }
  else if(spec.kind==='palm'){ const th=e.h*0.85; M.tube([V(0,0,0),V(0,th,0)],spec.trunk*0.8,spec.trunk*0.5,bark,4); blob(th,e.h*0.25,e.r); }
  else if(spec.kind==='banana'){ M.tube([V(0,0,0),V(0,e.h*0.6,0)],(spec.trunk||0.12),(spec.trunk||0.12)*0.8,mix(bark,lc,0.5),4); blob(e.h*0.68,e.h*0.33,e.r); }
  else if(spec.kind==='climber'){ const H=spec.height||1.8; M.tube([V(0,0,0),V(0,H,0)],0.04,0.03,bark,4); blob(H+(e.h-H)*0.4,Math.max(0.3,(e.h-H)*0.6+0.25),e.r,spec.train==='canopy'?e.r:Math.min(e.r,0.45)); }   // a trained vine is a thin wall along its wire, not a ball
  else if(spec.kind==='leafy') leafyProxy(M,spec,e,lc);
  else if(spec.kind==='vine'||spec.kind==='rosette') blob(e.h*0.35,e.h*0.5,e.r);
  else blob(e.h*0.5,e.h*0.5,e.r);
  return M.geometry();
}

// far-away leafy plants: a jagged leafy mound (head colour in the middle for cabbages and cauliflowers), or a tuft of blades for onions and leeks
function leafyProxy(M,spec,e,lc){
  const form=spec.form||'loose', dark=mix(lc,[0.05,0.12,0.05],0.35), hc=spec.head&&(form==='head'||form==='curd')?hex(spec.head.color):mix(lc,[1,1,0.8],0.15);
  if(form==='strap'||form==='fern'){ const n=form==='fern'?6:5;
    for(let k=0;k<n;k++){ const a=k/n*6.283, lean=form==='fern'?0.45:0.2, tip=V(Math.cos(a)*e.r*lean,e.h,Math.sin(a)*e.r*lean), w=e.r*(form==='fern'?0.35:0.18), s=V(-Math.sin(a)*w,0,Math.cos(a)*w);
      const b0=M.vert(s.clone(),dark), b1=M.vert(s.clone().negate(),dark), t=M.vert(tip,mix(lc,[1,1,0.8],0.2)); M.tri(b0,b1,t); M.tri(b1,b0,t); }
    if(spec.head) { const c=M.vert(V(0,e.h*0.12,0),hex(spec.head.color)); const K=5; const ring=[...Array(K)].map((_,i)=>M.vert(V(Math.cos(i/K*6.283)*e.r*0.25,0,Math.sin(i/K*6.283)*e.r*0.25),hex(spec.head.color2||spec.head.color))); for(let i=0;i<K;i++) M.tri(c,ring[(i+1)%K],ring[i]); }
    return; }
  const K=8, top=M.vert(V(0,e.h,0),hc), mid=[], low=[];
  for(let i=0;i<2*K;i++){ const a=i/(2*K)*6.283, rr=e.r*(i%2?0.62:1), y=e.h*(i%2?0.55:0.3); mid.push(M.vert(V(Math.cos(a)*rr,y,Math.sin(a)*rr),i%2?lc:mix(lc,[1,1,0.8],0.1))); }
  for(let i=0;i<K;i++){ const a=(i+0.5)/K*6.283; low.push(M.vert(V(Math.cos(a)*e.r*0.55,0,Math.sin(a)*e.r*0.55),dark)); }
  for(let i=0;i<2*K;i++) M.tri(top,mid[(i+1)%(2*K)],mid[i]);
  for(let i=0;i<K;i++){ const m0=mid[2*i], m1=mid[2*i+1], m2=mid[(2*i+2)%(2*K)]; M.tri(m0,m1,low[i]); M.tri(m1,m2,low[i]); M.tri(m0,low[i],low[(i+K-1)%K]); }
}
// ---- save / load a plant recipe (a spec) as plain JSON text ----
const KINDS=['tree','vine','bush','stalk','rosette','leafy','palm','banana','climber'];
const num=(v,lo,hi,d)=>{ v=+v; return Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):d; };
export function specToJSON(spec){ return JSON.stringify({format:'lt-plant',version:SPEC_VERSION,spec},null,1); }
// Throws Error with a plain sentence if the text is not a plant recipe. Numbers are kept inside sensible limits.
export function specFromJSON(text){
  let o; try{ o=JSON.parse(text); }catch(e){ throw new Error('This is not a plant file.'); }
  if(!o||o.format!=='lt-plant'||!o.spec) throw new Error('This is not a plant file.');
  if(+o.version>SPEC_VERSION) throw new Error('This plant was saved by a newer version of the planner. Update the page and try again.');
  const s=o.spec; if(!KINDS.includes(s.kind)) throw new Error('Unknown plant type: '+String(s.kind).slice(0,30));
  if(!s.leaf||typeof s.leaf!=='object') throw new Error('The plant has no leaf description.');
  const c=JSON.parse(JSON.stringify(s));
  c.v=SPEC_VERSION; c.seed=num(c.seed,1,2147483647,1)|0;
  if(c.height!==undefined) c.height=num(c.height,0.05,40,2);
  if(c.length!==undefined) c.length=num(c.length,0.2,30,4);
  if(c.spread!==undefined) c.spread=num(c.spread,0.1,40,2);
  if(c.trunk!==undefined) c.trunk=num(c.trunk,0.005,2,0.1);
  if(c.levels!==undefined) c.levels=num(c.levels,1,5,4)|0;
  if(c.kind==='tree'){ if(!Array.isArray(c.kids)) c.kids=[0,4,4,3]; c.kids=c.kids.slice(0,6).map((k,i)=>num(k,0,i<=1?20:8,3)|0); if(c.segs!==undefined) c.segs=num(c.segs,4,30,6)|0; }
  c.leaf.size=num(c.leaf.size,0.01,3,0.3); c.leaf.density=num(c.leaf.density,1,20,4);
  if(c.kind==='leafy'){ const FORMS=['loose','head','curd','tall','stalks','strap','fern','mound','low','pine']; if(!FORMS.includes(c.form)) c.form='loose'; c.leaves=num(c.leaves,3,40,12)|0;
    const hx=v=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v); if(c.stalkColors) c.stalkColors=(Array.isArray(c.stalkColors)?c.stalkColors:[]).filter(hx).slice(0,8); if(c.stalkColors&&!c.stalkColors.length) delete c.stalkColors; if(c.stalk!==undefined&&!hx(c.stalk)) delete c.stalk;
    if(c.head){ if(!hx(c.head.color)) c.head.color='#a8c99a'; c.head.size=num(c.head.size,0.05,1,0.4); } if(c.shank!==undefined) c.shank=num(c.shank,0,0.8,0.3); }
  if(c.fruit&&c.fruit.count){ c.fruit.count=num(c.fruit.count,0,200,0)|0; c.fruit.size=num(c.fruit.size,0.005,1.5,0.1); if(!c.fruit.shape&&c.fruit.kind!=='bunch'&&c.kind!=='banana') c.fruit.shape={width:1,height:1}; }
  else c.fruit={count:0};
  // colours are always #rrggbb, and a leaf pattern is one of the known kinds
  { const hx=v=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v), fix=(o,k,d)=>{ if(o&&o[k]!==undefined&&!hx(o[k])){ if(d) o[k]=d; else delete o[k]; } };
    fix(c.leaf,'color','#4d8a35'); fix(c.leaf,'color2','#6aa845'); fix(c.leaf,'midrib'); fix(c,'bark'); fix(c,'stalk');
    if(c.leaf.pattern!==undefined){ const p=c.leaf.pattern; if(!p||typeof p!=='object'||!['edge','centre','ring','speckle','veins'].includes(p.kind)) delete c.leaf.pattern; else { if(!hx(p.color)) p.color='#f0ecc8'; p.amount=num(p.amount,0,1,0.85); c.leaf.pattern={kind:p.kind,color:p.color,amount:p.amount}; } }
    if(c.fruit){ for(const k of ['colorRipe','colorUnripe','colorSecondary','colorCured']) fix(c.fruit,k,k==='colorCured'?'':'#c0c0c0'); if(c.fruit.colorCured==='') delete c.fruit.colorCured; if(c.fruit.shape) fix(c.fruit.shape,'stemColor'); } }
  // a plant has to build without error before we accept it
  try{ generate(c,1); }catch(e){ throw new Error('The plant could not be built from this file.'); }
  return c;
}
