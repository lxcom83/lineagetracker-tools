// Garden structures (lab sample). MIT, see LICENSE. Built from simple boxes and cylinders, flat colours.
import * as THREE from './vendor/three.module.js';
const mats={}; const M=(c,o={})=>{const k=c+JSON.stringify(o); return mats[k]||(mats[k]=new THREE.MeshStandardMaterial({color:c,roughness:0.9,...o}));};
function box(g,x,y,z,w,h,d,c,ry=0,o){ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),M(c,o)); m.position.set(x,y+h/2,z); m.rotation.y=ry; m.castShadow=m.receiveShadow=true; g.add(m); return m; }
function cyl(g,x,y,z,r,h,c,seg=16){ const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,seg),M(c)); m.position.set(x,y+h/2,z); m.castShadow=m.receiveShadow=true; g.add(m); }

// every structure takes a recipe-like spec and returns a Group
export const STRUCTS={
  fence:(s)=>{ const g=new THREE.Group(), L=s.length||6, H=s.height||1.4, n=Math.round(L/(s.postGap||1.5)); const col=s.color||'#8a6a45';
    for(let i=0;i<=n;i++) box(g,-L/2+i*L/n,0,0,0.1,H,0.1,col);
    for(const y of [0.25,0.7,1.15]) if(y<H) box(g,0,y,0.06,L,0.08,0.03,col);
    return g; },
  paling:(s)=>{ const g=new THREE.Group(), L=s.length||6, H=s.height||1.2, col=s.color||'#a88860'; const n=Math.round(L/0.12);
    for(let i=0;i<=n;i++) box(g,-L/2+i*L/n,0,0,0.09,H,0.02,col);
    for(let i=0;i<=Math.round(L/1.8);i++) box(g,-L/2+i*L/Math.round(L/1.8),0,-0.05,0.08,H+0.1,0.08,'#6b4f30');
    return g; },
  trellis:(s)=>{ const g=new THREE.Group(), W=s.width||2.4,H=s.height||1.8,gap=s.grid||0.2,col=s.color||'#7a5a38';
    box(g,-W/2,0,0,0.07,H+0.1,0.07,col); box(g,W/2,0,0,0.07,H+0.1,0.07,col);
    for(let y=0.15;y<H;y+=gap) box(g,0,y,0,W,0.025,0.025,col);
    for(let x=-W/2+gap;x<W/2;x+=gap) box(g,x,0.1,0,0.025,H-0.1,0.02,col);
    return g; },
  aframe:(s)=>{ const g=new THREE.Group(), W=s.width||2.0,H=s.height||1.7,D=s.depth||1.4,col=s.color||'#7a5a38', V=(x,y,z)=>new THREE.Vector3(x,y,z);
    const beam=(a,b,t=0.04)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(t,t,a.distanceTo(b)),M(col)); m.position.copy(a).add(b).multiplyScalar(0.5); m.lookAt(b); m.castShadow=m.receiveShadow=true; g.add(m); };
    for(const sd of [1,-1]){ for(const x of [-W/2,W/2]) beam(V(x,0,sd*D/2),V(x,H,0),0.05);
      for(let t=0.2;t<0.95;t+=0.2) beam(V(-W/2,H*t,sd*D/2*(1-t)),V(W/2,H*t,sd*D/2*(1-t)),0.025);
      for(let x=-W/2+0.25;x<W/2;x+=0.25) beam(V(x,0,sd*D/2),V(x,H,0),0.02); }
    beam(V(-W/2,H,0),V(W/2,H,0),0.05); return g; },
  raisedBed:(s)=>{ const g=new THREE.Group(), W=s.width||2.4,D=s.depth||1.2,H=s.height||0.4,col=s.color||'#9a7a4d';
    box(g,0,0,D/2,W+0.08,H,0.05,col); box(g,0,0,-D/2,W+0.08,H,0.05,col); box(g,W/2,0,0,0.05,H,D,col); box(g,-W/2,0,0,0.05,H,D,col);
    box(g,0,0.02,0,W-0.02,H-0.08,D-0.02,s.soil||'#3e2d1e'); return g; },
  path:(s)=>{ const g=new THREE.Group(), L=s.length||8, W=s.width||0.9, kind=s.kind||'pavers';
    if(kind==='strip'){ box(g,0,0,0,L,0.02,W,s.color||'#b9a98a'); return g; }
    const n=Math.round(L/0.5); for(let i=0;i<n;i++){ const j=(i*7%5-2)*0.012; box(g,-L/2+0.25+i*0.5,0,j,0.44,0.04,W*0.9,i%2?'#9b9488':'#aaa397',(i%3-1)*0.03); }
    return g; },
  tank:(s)=>{ const g=new THREE.Group(); cyl(g,0,0,0,s.radius||0.7,s.height||1.6,s.color||'#3c6a6e',24); cyl(g,0,s.height||1.6,0,(s.radius||0.7)*1.02,0.05,'#2a4a4d',24); return g; },
  compost:(s)=>{ const g=new THREE.Group(), W=s.width||1.0,col=s.color||'#8a6a45'; box(g,0,0,W/2,W,0.9,0.05,col); box(g,0,0,-W/2,W,0.9,0.05,col); box(g,W/2,0,0,0.05,0.9,W,col); box(g,-W/2,0,0,0.05,0.9,W,col); box(g,0,0.05,0,W-0.1,0.6,W-0.1,'#3b2c1c'); return g; },
  greenhouse:(s)=>{ const g=new THREE.Group(), W=s.width||3,L=s.length||4.5,H=s.height||2.2, col=s.frame||'#d8d8d4', wall=1.5, glass={transparent:true,opacity:0.22,roughness:0.1,side:THREE.DoubleSide,depthWrite:false};
    const V=(x,y,z)=>new THREE.Vector3(x,y,z);
    const beam=(a,b,t=0.05)=>{ const len=a.distanceTo(b), m=new THREE.Mesh(new THREE.BoxGeometry(t,t,len),M(col)); m.position.copy(a).add(b).multiplyScalar(0.5); m.lookAt(b); m.castShadow=true; g.add(m); };
    const quad=(p0,p1,p2,p3)=>{ const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute([...p0.toArray(),...p1.toArray(),...p2.toArray(),...p3.toArray()],3)); geo.setIndex([0,1,2,0,2,3]); geo.computeVertexNormals(); const m=new THREE.Mesh(geo,M('#bfe3ee',glass)); g.add(m); };
    const n=3, zs=[...Array(n+1).keys()].map(i=>-L/2+i*L/n);
    for(const z of zs){ beam(V(-W/2,0,z),V(-W/2,wall,z)); beam(V(W/2,0,z),V(W/2,wall,z)); beam(V(-W/2,wall,z),V(0,H,z)); beam(V(W/2,wall,z),V(0,H,z)); beam(V(-W/2,wall,z),V(W/2,wall,z),0.03); }
    beam(V(0,H,-L/2),V(0,H,L/2)); beam(V(-W/2,wall,-L/2),V(-W/2,wall,L/2)); beam(V(W/2,wall,-L/2),V(W/2,wall,L/2)); beam(V(-W/2,0,-L/2),V(W/2,0,-L/2),0.04); beam(V(-W/2,0,L/2),V(W/2,0,L/2),0.04);
    for(const x of [-W/2,W/2]) quad(V(x,0,-L/2),V(x,0,L/2),V(x,wall,L/2),V(x,wall,-L/2));
    for(const x of [-W/2,W/2]) quad(V(x,wall,-L/2),V(x,wall,L/2),V(0,H,L/2),V(0,H,-L/2));
    for(const z of [-L/2,L/2]) { quad(V(-W/2,0,z),V(W/2,0,z),V(W/2,wall,z),V(-W/2,wall,z)); const t=new THREE.BufferGeometry(); t.setAttribute('position',new THREE.Float32BufferAttribute([-W/2,wall,z,W/2,wall,z,0,H,z],3)); t.setIndex([0,1,2]); t.computeVertexNormals(); g.add(new THREE.Mesh(t,M('#bfe3ee',glass))); }
    return g; }
};
export function build(spec){ const f=STRUCTS[spec.type]; return f?f(spec):new THREE.Group(); }
