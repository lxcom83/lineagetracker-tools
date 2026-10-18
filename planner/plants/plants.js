// Lineage Tracker plant generator (lab). MIT, see LICENSE. Our own code.
// spec -> one merged BufferGeometry (vertex colours). Same spec + seed = same plant.
import * as THREE from './vendor/three.module.js';
export const SPEC_VERSION = 2;

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
  lobed:{a:0.85,b:0.8,serr:0,notch:0,lobes:6,lobeDepth:0.28}
};

class Mesh {
  constructor(){ this.p=[]; this.c=[]; this.i=[]; }
  vert(v,c){ this.p.push(v.x,v.y,v.z); this.c.push(c[0],c[1],c[2]); return this.p.length/3-1; }
  tri(a,b,c){ this.i.push(a,b,c); }
  tube(pts, r0, r1, col, seg=5){
    let prev=null;
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
  leaf(pos, dir, size, col, o={}){
    const sh=SHAPES[o.shape||'ovate'], f=dir.clone().normalize(), {s,n}=frame(f);
    if(o.shape==='palmate') return this.palmate(pos,f,s,n,size,col,o);
    const T=o.detail?10:4, S=o.detail?7:3, wide=o.wide||0.5, fold=o.fold===undefined?0.25:o.fold, droop=o.droop===undefined?0.25:o.droop, wave=o.wave||0, veins=o.veins||5;
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
        let off=n.clone().multiplyScalar(fold*size*w*au*1.2 + wave*size*0.03*Math.sin(t*11+u*2.5)*au);
        // heart-shaped base: pull the base corners back
        let tf=0; if(sh.notch) tf=sh.notch*size*0.45*Math.exp(-t*t/0.02)*au;
        const P=base.clone().addScaledVector(s,u*w*size*2).add(off).addScaledVector(f,-tf);
        let cc=mix(dark,col,sstep(0,0.22,t)); 
        cc=mix(cc,light,Math.max(0,1-au*7)*0.7);                                   // midrib
        cc=mix(cc,light,0.12*Math.max(0,Math.sin((t*veins*Math.PI*2)+au*5)) *(1-au)); // side veins
        cc=mix(cc,dark,sstep(0.75,1,au)*0.35);                                       // edge
        row.push(this.vert(P,cc));
      }
      rows.push(row);
    }
    for(let r=0;r<T;r++) for(let c=0;c<S;c++){ this.tri(rows[r][c],rows[r][c+1],rows[r+1][c]); this.tri(rows[r][c+1],rows[r+1][c+1],rows[r+1][c]); }
  }
  // round lobed leaf (pumpkin, squash, gourd): polar grid, 5 lobes, notched base
  palmate(pos,f,s,n,size,col,o){
    const K=o.detail?30:12, Rn=o.detail?5:2, lobes=o.lobes||5, sinus=o.sinus===undefined?0.3:o.sinus, cup=o.fold===undefined?0.3:o.fold, droop=o.droop===undefined?0.15:o.droop;
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
        ring.push(this.vert(P,cc)); }
      rings.push(ring); }
    for(let j=0;j<K;j++){ const nx=(j+1)%K; this.tri(cv,rings[0][nx],rings[0][j]); }
    for(let k=0;k<Rn-1;k++) for(let j=0;j<K;j++){ const nx=(j+1)%K; this.tri(rings[k][j],rings[k][nx],rings[k+1][j]); this.tri(rings[k][nx],rings[k+1][nx],rings[k+1][j]); }
  }
  fruit(pos, fs, ripe, R){
    const sh=fs.shape, sz=fs.size*(0.3+0.7*ripe);
    if(sh.kind==='head') return this.head(pos,fs,sz,R);
    const c1=hex(fs.colorUnripe||'#5f9a3a'), c2=hex(fs.colorRipe), c3=hex(fs.colorSecondary||fs.colorRipe);
    const base=mix(c1,c2,Math.min(1,ripe*1.15)), W=sh.ribs>0||sh.kernels?28:20, H=16, rows=[];
    const blushAng=R()*6.28, grooveShade=sh.grooveShade===undefined?0.3:sh.grooveShade;
    for(let y=0;y<=H;y++){ const v=y/H, th=v*Math.PI, row=[];
      for(let x=0;x<W;x++){ const ph=x/W*Math.PI*2;
        const prof=Math.pow(Math.max(0,Math.sin(th)),sh.fullness||0.75);                // fullness: <1 boxy, >1 pointed
        let rib=0; if(sh.ribs) rib=Math.cos(ph*sh.ribs);
        if(sh.kernels) rib=Math.cos(ph*sh.kernels)*Math.cos(th*10)*0.4;
        let rad=0.5*sh.width*prof*(1+sh.ribDepth*rib);
        rad*=1+(v<0.5?sh.taperTop*(v-0.5):sh.taperBottom*(0.5-v))*0.0;   // simple
        rad*=1-(v<0.5? sh.taperTop*(0.5-v) : sh.taperBottom*(v-0.5))*1.0;
        let yy=(Math.cos(th)*0.5)*sh.height;
        // dimples where stem and flower end sit
        yy-= (v<0.2? 1:0)*sh.dimple*0.07*Math.exp(-v*v/0.004)*sh.height;
        yy+= (v>0.8? 1:0)*sh.dimple*0.05*Math.exp(-(1-v)*(1-v)/0.004)*sh.height;
        const shade=1-grooveShade*(rib<0?-rib:0)*0.0 - grooveShade*0.4*Math.max(0,-rib);
        let cc=mix(base,[0.05,0.05,0.05],(1-shade)*0.9);
        if(sh.blush){ const b=sstep(-0.3,0.8,Math.cos(ph-blushAng)); cc=mix(cc,c3,b*sh.blush*Math.min(1,ripe*1.2)); }
        if(sh.stripes){ const st=sstep(0.3,0.5,Math.cos(ph*sh.stripes)); cc=mix(cc,c3,st*0.7); }
        const y0=(yy+0.5*sh.height)*sz;
        row.push(this.vert(pos.clone().add(V(Math.cos(ph)*rad*sz,y0,Math.sin(ph)*rad*sz)),cc)); }
      rows.push(row); }
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){ const n=(x+1)%W; this.tri(rows[y][x],rows[y][n],rows[y+1][x]); this.tri(rows[y][n],rows[y+1][n],rows[y+1][x]); }
    const top=pos.clone().add(V(0,sh.height*sz*(1-0.04*sh.dimple),0));
    const green=hex('#4a6a2a'), woody=hex(sh.stemColor||'#6b5a2a');
    if(sh.stem){ const L=sh.stem*sz, tp=[top.clone(),top.clone().add(V(0.15*L,L*0.6,0)),top.clone().add(V(0.5*L,L,0.1*L))]; this.tube(tp,sz*0.04*(sh.stemThick||1),sz*0.03*(sh.stemThick||1),woody,sh.stemRidges?5:6); }
    if(sh.husk){ for(let i=0;i<sh.husk;i++){ const a=i/sh.husk*6.283+R()*0.3, r0=sh.width*sz*0.28; this.leaf(pos.clone().add(V(Math.cos(a)*r0,sz*0.02,Math.sin(a)*r0)),V(Math.cos(a)*0.16,1,Math.sin(a)*0.16),sz*sh.height*1.15,mix(hex('#6a9a3a'),hex('#b8c878'),R()*0.5),{shape:'strap',wide:0.45,fold:1.0,droop:0.05,wave:0.2,detail:1,veins:10}); } }
    if(sh.calyx){ const k=sh.calyx; for(let i=0;i<k;i++){ const a=i/k*6.28; this.leaf(top.clone().add(V(0,-sz*0.02,0)),V(Math.cos(a),0.15,Math.sin(a)),sz*0.28,green,{shape:'lanceolate',wide:0.35,fold:0.1,droop:-0.1,detail:0}); } }
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
  geometry(){ const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3)); g.setIndex(this.i); g.computeVertexNormals(); return g; }
}

const APPLE={count:14,size:0.075,shape:{width:1,height:0.88,fullness:0.7,ribs:5,ribDepth:0.02,taperTop:0,taperBottom:0.25,dimple:1.6,blush:1.0,stem:0.5,stemThick:0.7,calyx:5,stripes:0},colorUnripe:'#7fb049',colorRipe:'#d8c23a',colorSecondary:'#c42b2b'};
export const PRESETS = {
  appleTree:{v:2,kind:'tree',seed:11,height:4.5,trunk:0.14,levels:4,kids:[0,4,4,3],angle:48,lenRatio:0.62,taper:0.62,twist:0.35,tropism:0.25,droop:0.1,leaf:{shape:'oval',wide:0.62,size:0.2,density:7,color:'#4d8a35',color2:'#79b04a',fold:0.3,droop:0.3,wave:0.5},fruit:APPLE},
  oakTree:{v:2,kind:'tree',seed:5,height:6.5,trunk:0.28,levels:5,kids:[0,3,4,4,3],angle:60,lenRatio:0.7,taper:0.64,twist:0.7,tropism:-0.05,droop:0.05,leaf:{shape:'lobed',wide:0.55,size:0.26,density:7,color:'#3f7a2c',color2:'#6a9a3b',fold:0.35,droop:0.2,wave:0.7},fruit:{count:0}},
  willow:{v:2,kind:'tree',seed:21,height:5.5,trunk:0.2,levels:4,kids:[0,5,5,4],angle:38,lenRatio:0.7,taper:0.6,twist:0.3,tropism:0.1,droop:0.9,leaf:{shape:'lanceolate',wide:0.2,size:0.3,density:9,color:'#7fa83f',color2:'#a6c455',fold:0.2,droop:0.5,wave:0.2},fruit:{count:0}},
  pumpkinVine:{v:2,kind:'vine',seed:7,length:5,stem:0.03,sideVines:3,leaf:{shape:'palmate',lobes:5,sinus:0.32,size:0.55,density:1,color:'#3f7d2f',color2:'#5d9a3a',fold:0.35,droop:0.2},fruit:{count:3,size:0.34,shape:{width:1.2,height:0.85,fullness:0.5,ribs:10,ribDepth:0.11,grooveShade:0.7,taperTop:0,taperBottom:0,dimple:1.8,stem:0.5,stemThick:1.6,stemRidges:1,stemColor:'#7a6a3a',stripes:0},colorUnripe:'#5a8a3a',colorRipe:'#e8731a',colorSecondary:'#e8731a'}},
  blackPumpkin:{v:2,kind:'vine',seed:9,length:5.5,stem:0.03,sideVines:4,leaf:{shape:'palmate',lobes:5,sinus:0.4,size:0.5,density:1,color:'#2f6a2a',color2:'#4b8a38',fold:0.3,droop:0.25},fruit:{count:4,size:0.3,shape:{width:1.0,height:1.12,fullness:0.7,ribs:7,ribDepth:0.07,grooveShade:0.5,taperTop:0.35,taperBottom:0.05,dimple:1.2,stem:0.55,stemThick:1.4,stemRidges:1,stemColor:'#5a4a2a',stripes:0},colorUnripe:'#3e6a35',colorRipe:'#1c1f24',colorSecondary:'#2a3a30'}},
  tomato:{v:2,kind:'bush',seed:3,height:1.6,stem:0.018,joints:12,leaf:{shape:'compound',leaflet:'oval',wide:0.7,size:0.34,density:2,color:'#4a8a30',color2:'#6aa845',fold:0.3,droop:0.3,wave:0.9},fruit:{count:10,size:0.085,shape:{width:1.05,height:0.88,fullness:0.65,ribs:5,ribDepth:0.04,grooveShade:0.15,taperTop:0,taperBottom:0.08,dimple:0.8,blush:0.25,calyx:6,stem:0.5,stemThick:0.6,stemColor:'#4a6a2a'},colorUnripe:'#6aa83c',colorRipe:'#d6281d',colorSecondary:'#e8602a'}},
  corn:{v:2,kind:'stalk',seed:2,height:2.2,stem:0.035,joints:9,leaf:{shape:'strap',wide:0.14,size:1.0,density:1,color:'#5c9a38',color2:'#7ab648',fold:0.6,droop:0.7,wave:1.0,veins:12},fruit:{count:2,size:0.3,shape:{width:0.34,height:1.5,fullness:0.55,kernels:18,ribDepth:0.06,taperTop:0.75,taperBottom:0.1,dimple:0,husk:5,stem:0.1},colorUnripe:'#c8d878',colorRipe:'#f0c820',colorSecondary:'#f0c820'}},
  sunflower:{v:2,kind:'stalk',seed:4,height:2.4,stem:0.04,joints:11,leaf:{shape:'heart',wide:0.85,size:0.55,density:1,color:'#4b8a33',color2:'#6aa840',fold:0.25,droop:0.45,wave:0.5},fruit:{count:1,size:0.5,shape:{kind:'head',petals:22,width:1,height:0.1},colorUnripe:'#5a8a3a',colorRipe:'#f0b81a',colorSecondary:'#4a2a12'}}
};

export function generate(spec, stage=1, opts={}){
  const R=rng(spec.seed||1), M=new Mesh(), st=Math.max(0.05,Math.min(1,stage));
  const L0=spec.leaf, lc=hex(L0.color), lc2=hex(L0.color2), bark=hex(spec.bark||'#6b4a2b'), green=hex('#4a7a35');
  const leafQ = opts.quality===undefined?1:opts.quality;
  const hero = spec.kind!=='tree';
  const lo={shape:L0.shape,wide:L0.wide,fold:L0.fold,droop:L0.droop,wave:L0.wave,veins:L0.veins,lobes:L0.lobes,sinus:L0.sinus,detail:hero?1:0};
  const col=()=>mix(lc,lc2,R());
  const place=(pos,dir,size,extra)=>{
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
    const H=spec.height*(0.15+0.85*st), tw=spec.trunk*(0.2+0.8*st);
    const branch=(p,d,len,rad,lvl)=>{
      const pts=[p.clone()]; const n=6; let cur=p.clone(), dd=d.clone();
      for(let k=1;k<=n;k++){
        dd.x+=(R()-0.5)*spec.twist*0.4; dd.z+=(R()-0.5)*spec.twist*0.4; dd.y+=spec.tropism*0.1-spec.droop*0.05*(lvl>0?1:0); dd.normalize();
        cur=cur.clone().addScaledVector(dd,len/n); pts.push(cur);
      }
      M.tube(pts,rad,rad*spec.taper,bark,lvl<2?8:5);
      if(lvl>=spec.levels-1){
        const cnt=Math.max(1,Math.round(L0.density*leafQ));
        for(let j=0;j<cnt;j++){ const q=pts[Math.max(1,pts.length-1-(j%3))]; const ld=V(R()-0.5,R()*0.6+0.1-spec.droop*0.6,R()-0.5).normalize(); place(q,ld,L0.size*(0.4+0.8*st)); }
        if(fruitSpec.count) fruitAt.push(pts[pts.length-1].clone());
        return; }
      const kids=spec.kids[lvl+1]||3;
      for(let k=0;k<kids;k++){
        const t=0.45+0.55*(k+R()*0.5)/kids, idx=Math.min(pts.length-1,Math.floor(t*(pts.length-1))), q=pts[idx];
        const ang=spec.angle*Math.PI/180*(0.7+R()*0.6), az=(k/kids)*Math.PI*2+R();
        const a=Math.abs(dd.y)<0.9?V(0,1,0):V(1,0,0), u=a.clone().cross(dd).normalize(), w=dd.clone().cross(u);
        const nd=dd.clone().multiplyScalar(Math.cos(ang)).addScaledVector(u,Math.sin(ang)*Math.cos(az)).addScaledVector(w,Math.sin(ang)*Math.sin(az));
        nd.y-=spec.droop*0.4; nd.normalize();
        branch(q,nd,len*spec.lenRatio*(0.8+R()*0.4),rad*spec.taper*0.8,lvl+1);
      }
      if(lvl>0){ const cnt=Math.round(L0.density*0.5*leafQ); for(let j=0;j<cnt;j++){ place(pts[pts.length-1],V(R()-0.5,R()*0.5,R()-0.5).normalize(),L0.size*0.8*st);} }
    };
    branch(V(0,0,0),V(0,1,0),H*0.55,tw,0);
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
      const down = spec.kind==='tree'||spec.kind==='bush';
      if(down){ M.fruit(p.clone().add(V(0,-fruitSpec.size*fruitSpec.shape.height*(0.3+0.7*Math.min(1,ripe)),0)),fruitSpec,Math.min(1,ripe),R); }
      else M.fruit(p,fruitSpec,Math.min(1,ripe),R); } }
  return M.geometry();
}
export function stats(g){ return {tris:g.index.count/3, verts:g.attributes.position.count}; }
// one fruit on its own at full ripeness (for the close-up row)
export function fruitGeometry(spec, ripe=1){ const M=new Mesh(), R=rng((spec.seed||1)+99); M.fruit(V(0,0,0),spec.fruit,ripe,R); return M.geometry(); }
