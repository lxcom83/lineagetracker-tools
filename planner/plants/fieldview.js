// Draws a PlantField with three.js: one instanced mesh per plant type and detail level.
// Only what select() hands over is drawn; everything else has count 0, so it costs nothing.
import * as THREE from './vendor/three.module.js';
import {generate, proxyGeometry, extent} from './plants.js';

function markerGeometry(spec, stage){
  const e=extent(spec,stage), c=new THREE.Color(spec.leaf.color).lerp(new THREE.Color(spec.leaf.color2),0.5).multiplyScalar(0.8), S=8;
  const p=[0,0.04,0], col=[c.r,c.g,c.b], idx=[];
  for(let i=0;i<S;i++){ const a=i/S*Math.PI*2; p.push(Math.cos(a)*e.r,0.04,Math.sin(a)*e.r); col.push(c.r*0.9,c.g*0.9,c.b*0.9); idx.push(0,i+2>S?1:i+2,i+1); }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(p,3)); g.setAttribute('color',new THREE.Float32BufferAttribute(col,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(p.map((v,i)=>i%3===1?1:0),3)); g.setIndex(idx); return g;
}

export class FieldView {
  // specs: { speciesId: spec }
  constructor(scene, material, specs){ this.scene=scene; this.mat=material; this.specs=specs; this.group=new THREE.Group(); scene.add(this.group); this.meshes=new Map(); this.geo=new Map(); this.stage=1; this.level='low'; }
  setDetail(stage, level){ if(stage!==this.stage||level!==this.level){ this.stage=stage; this.level=level; this.clear(true); } }
  geometry(sp, L){
    const key=sp+':'+L; let g=this.geo.get(key); if(g) return g;
    const spec=this.specs[sp];
    if(L<2) g = generate(spec,this.stage,{level:L===0?this.level:'lod1'});
    else {   // the simple shapes are sized from the recipe; stretch them to the plant as actually grown, so nothing jumps in size when the detail changes
      g = L===2 ? proxyGeometry(spec,this.stage) : markerGeometry(spec,this.stage);
      const e=extent(spec,this.stage), m=this.size(sp), sx=e.r>0?m.r/e.r:1, sy=e.h>0?m.h/e.h:1;
      if(Math.abs(sx-1)>0.02||Math.abs(sy-1)>0.02) g.scale(sx, L===2?sy:1, sx);
    }
    this.geo.set(key,g); return g;
  }
  // size of the plant as drawn (from the reduced-detail copy): { r: half the widest spread, h: height }
  size(sp){
    const key=sp+':size:'+this.stage; let m=this.geo.get(key); if(m) return m;
    const g=this.geometry(sp,1); g.computeBoundingBox(); const b=g.boundingBox;
    m={ r:Math.max(0.01,Math.max(-b.min.x,b.max.x,-b.min.z,b.max.z)), h:Math.max(0.01,b.max.y), dispose(){} };
    this.geo.set(key,m); return m;
  }
  mesh(sp, L, n){
    const key=sp+':'+L; let m=this.meshes.get(key);
    if(!m || m.instanceMatrix.count<n){
      if(m){ this.group.remove(m); m.dispose(); }
      const cap=Math.max(64, 1<<Math.ceil(Math.log2(Math.max(1,n))));
      m=new THREE.InstancedMesh(this.geometry(sp,L),this.mat,cap); m.frustumCulled=false; m.castShadow=L<2&&this.shadows; m.receiveShadow=L<2&&this.shadows;
      this.group.add(m); this.meshes.set(key,m);
    }
    return m;
  }
  apply(sel){
    const used=new Set(), M=new THREE.Matrix4(), Q=new THREE.Quaternion(), P=new THREE.Vector3(), S=new THREE.Vector3(), Y=new THREE.Vector3(0,1,0);
    for(const g of sel.groups){
      const m=this.mesh(g.species,g.level,g.count); used.add(g.species+':'+g.level);
      for(let i=0;i<g.count;i++){ const d=g.data; Q.setFromAxisAngle(Y,d[i*5+3]); P.set(d[i*5],d[i*5+1],d[i*5+2]); const sc=d[i*5+4]; S.set(sc,sc,sc); M.compose(P,Q,S); m.setMatrixAt(i,M); }
      m.count=g.count; m.instanceMatrix.needsUpdate=true; }
    for(const [k,m] of this.meshes) if(!used.has(k)) m.count=0;
  }
  clear(geoToo){ for(const m of this.meshes.values()){ this.group.remove(m); m.dispose(); } this.meshes.clear(); if(geoToo){ for(const g of this.geo.values()) g.dispose(); this.geo.clear(); } }
  dispose(){ this.clear(true); this.scene.remove(this.group); }
}
