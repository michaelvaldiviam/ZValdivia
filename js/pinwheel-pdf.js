/**
 * pinwheel-pdf.js
 *
 * Genera PDF "Remolino" (Pinwheel Unfold) del zonoedro.
 *
 * CONCEPTO:
 * Una "sección" es una tira de caras que va desde el polo (nivel N-1) hacia
 * abajo siguiendo siempre la arista INFERIOR-DERECHA de cada cara:
 *
 *   face(N-1, s) → face(N-2, idxR(N-1,s)) → face(N-3, idxR(N-2,…)) → …
 *
 * La regla de índice siguiente:
 *   si k es impar  →  nextI = (i + 1) % N
 *   si k es par    →  nextI = i
 *
 * Las N secciones comparten el polo como centro y se encadenan en sentido
 * antihorario (arista superior-derecha de sección s = arista superior-izquierda
 * de sección s+1). El resultado es un patrón tipo remolino sin solapamientos.
 *
 * PÁGINAS DEL PDF:
 *   1    — Remolino completo (todas las secciones, proporcional)
 *   2…N+1— Una sección por página (escala máxima, para recortar/doblar)
 *   N+2  — Resumen de parámetros y leyenda de colores
 *
 * Requiere jsPDF cargado (window.jspdf).
 */

import { state, getColorForLevel } from './state.js';

// ─── Álgebra 3D ───────────────────────────────────────────────────────────────
function v3sub(a,b){return[a[0]-b[0],a[1]-b[1],a[2]-b[2]];}
function v3dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function v3cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function v3norm(v){const n=Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);return n>1e-12?[v[0]/n,v[1]/n,v[2]/n]:[0,0,1];}
function v3len(v){return Math.sqrt(v[0]*v[0]+v[1]*v[1]+v[2]*v[2]);}

// ─── Álgebra 2D ───────────────────────────────────────────────────────────────
function v2dist(a,b){const dx=a[0]-b[0],dy=a[1]-b[1];return Math.sqrt(dx*dx+dy*dy);}
function centroid2d(pts){const n=pts.length;return[pts.reduce((s,p)=>s+p[0],0)/n,pts.reduce((s,p)=>s+p[1],0)/n];}

// ─── Geometría del zonoedro ───────────────────────────────────────────────────
function getRingVertex(k,i){
  const{Dmax,N,h1}=state;
  const Rk=(Dmax/2)*Math.sin((k*Math.PI)/N);
  const rotOffset=(k%2===0)?(Math.PI/N):0;
  const theta=-Math.PI/2+rotOffset+i*(2*Math.PI/N);
  return[Rk*Math.cos(theta),Rk*Math.sin(theta),k*h1];
}

/**
 * Vértices 3D de face(k,i).
 * Rombos:     [vBottom, vRight, vTop, vLeft]
 * Triángulos: [vLeft, vRight, vTop]
 */
function buildFace3D(k,i){
  const{N,cutActive,cutLevel}=state;
  const startK=cutActive?cutLevel:1;
  const idxL=(k%2===1)?i:(i-1+N)%N;
  const idxR=(k%2===1)?(i+1)%N:i;
  const vL=getRingVertex(k,idxL), vR=getRingVertex(k,idxR);
  if(k===startK&&cutActive) return{verts:[vL,vR,getRingVertex(k+1,i)],isTriangle:true};
  return{verts:[getRingVertex(k-1,i),vR,getRingVertex(k+1,i),vL],isTriangle:false};
}

/**
 * Dado face(k, i), retorna el índice i del nivel k-1 que comparte la arista
 * inferior-derecha (vBottom → vRight) con la cara actual.
 */
function stripNextI(k,i){
  return (k%2===1) ? (i+1)%state.N : i;
}

// ─── Despliegue isométrico ─────────────────────────────────────────────────────
function findSharedEdge(vA,vB){
  const EPS=1e-4,ia=[],ib=[];
  for(let ai=0;ai<vA.length;ai++)
    for(let bi=0;bi<vB.length;bi++){
      const va=vA[ai],vb=vB[bi];
      if(Math.sqrt((va[0]-vb[0])**2+(va[1]-vb[1])**2+(va[2]-vb[2])**2)<EPS){
        ia.push(ai);ib.push(bi);
      }
    }
  return{ia,ib};
}

function faceNormal3d(verts){
  const e1=v3sub(verts[1],verts[0]),e2=v3sub(verts[verts.length-1],verts[0]);
  let n=v3norm(v3cross(e1,e2));
  if(v3len(n)<0.5)n=v3norm(v3cross(e1,v3sub(verts[2],verts[0])));
  return n;
}

/**
 * Despliega faceB en 2D dado que su arista (viB[0],viB[1]) coincide con los
 * puntos 2D e0_2d, e1_2d. La cara nueva se coloca en el lado opuesto a
 * parentCentroid2d (respecto de la arista compartida).
 */
function unfoldFace(faceBVerts,viB,e0_2d,e1_2d,parentCentroid2d){
  const e0_3d=faceBVerts[viB[0]], e1_3d=faceBVerts[viB[1]];
  const edge3d=v3sub(e1_3d,e0_3d);
  const eLen=v3len(edge3d); if(eLen<1e-10)return null;
  const eDir3d=edge3d.map(x=>x/eLen);
  const fN=faceNormal3d(faceBVerts);
  let pDir=v3norm(v3cross(fN,eDir3d));
  const n=faceBVerts.length;
  const centB=faceBVerts.reduce((a,v)=>[a[0]+v[0],a[1]+v[1],a[2]+v[2]],[0,0,0]).map(x=>x/n);
  if(v3dot(v3sub(centB,e0_3d),pDir)<0)pDir=pDir.map(x=>-x);
  const e2d=[e1_2d[0]-e0_2d[0],e1_2d[1]-e0_2d[1]];
  const e2dL=Math.sqrt(e2d[0]**2+e2d[1]**2);
  const eDir2d=e2d.map(x=>x/e2dL);
  const outCand=[-eDir2d[1],eDir2d[0]];
  const toCentP=[parentCentroid2d[0]-e0_2d[0],parentCentroid2d[1]-e0_2d[1]];
  const sideP=toCentP[0]*outCand[0]+toCentP[1]*outCand[1];
  const outDir2d=sideP>0?[-outCand[0],-outCand[1]]:outCand;
  const result=new Array(n).fill(null);
  result[viB[0]]=e0_2d; result[viB[1]]=e1_2d;
  for(let vi=0;vi<n;vi++){
    if(vi===viB[0]||vi===viB[1])continue;
    const r=v3sub(faceBVerts[vi],e0_3d);
    const along=v3dot(r,eDir3d), perp=v3dot(r,pDir);
    result[vi]=[e0_2d[0]+along*eDir2d[0]+perp*outDir2d[0],
                e0_2d[1]+along*eDir2d[1]+perp*outDir2d[1]];
  }
  return result;
}

// ─── Construcción del remolino completo ───────────────────────────────────────
/**
 * Retorna Map con clave "s,level" → {verts2d, k, i, s, isTriangle}
 * s = índice de sección (0..N-1), level = posición en la tira (0=top/polo, 1,2…)
 */
function buildPinwheelNet(){
  const{N,cutActive,cutLevel}=state;
  const startK=cutActive?cutLevel:1;

  // placed: clave "k,i" → {verts2d,k,i,s}
  // (cada cara aparece exactamente en una sección)
  const placed=new Map();

  // ── Paso 1: colocar las N caras del nivel superior (k=N-1) ────────────────
  // Polo en origen, vLeft de face(N-1,0) a lo largo de +X
  const face0=buildFace3D(N-1,0);
  const poleV=face0.verts[2];              // índice 2 = vTop = polo
  const vLV  =face0.verts[3];             // índice 3 = vLeft
  const eDir=v3norm(v3sub(vLV,poleV));
  const fN0 =faceNormal3d(face0.verts);
  let pDir=v3norm(v3cross(fN0,eDir));
  const cent0=face0.verts.reduce((a,v)=>[a[0]+v[0],a[1]+v[1],a[2]+v[2]],[0,0,0]).map(x=>x/face0.verts.length);
  if(v3dot(v3sub(cent0,poleV),pDir)<0)pDir=pDir.map(x=>-x);
  const v0_2d=face0.verts.map(v=>{const r=v3sub(v,poleV);return[v3dot(r,eDir),v3dot(r,pDir)];});
  placed.set(`${N-1},0`,{verts2d:v0_2d,k:N-1,i:0,s:0,isTriangle:false});

  // Encadenar secciones 1..N-1 en el nivel superior (antihorario)
  // Usar centroide de la cara anterior como referencia: NUNCA está sobre la arista
  // compartida (que pasa por el polo), evitando el caso degenerado sideP=0.
  for(let s=1;s<N;s++){
    const fA=buildFace3D(N-1,s-1);
    const fB=buildFace3D(N-1,s);
    const{ia,ib}=findSharedEdge(fA.verts,fB.verts);
    if(ia.length<2)continue;
    const prev2d=placed.get(`${N-1},${s-1}`).verts2d;
    const v2d=unfoldFace(fB.verts,ib,prev2d[ia[0]],prev2d[ia[1]],centroid2d(prev2d));
    if(v2d)placed.set(`${N-1},${s}`,{verts2d:v2d,k:N-1,i:s,s,isTriangle:false});
  }

  // ── Paso 2: para cada sección, bajar siguiendo la arista inferior-derecha ──
  // Se usa [0,0] (polo) como referencia de "interior" en TODAS las decisiones
  // de despliegue. Así cada cara nueva siempre se abre en dirección opuesta al
  // polo, sin importar cuánto haya girado la tira (evita el cruce de brazos).
  for(let s=0;s<N;s++){
    let curK=N-1, curI=s;
    for(let k=N-2;k>=startK;k--){
      const nextI=stripNextI(curK,curI);
      const parentEntry=placed.get(`${curK},${curI}`);
      if(!parentEntry)break;
      const fParent=buildFace3D(curK,curI);
      const fChild=buildFace3D(k,nextI);
      const{ia,ib}=findSharedEdge(fParent.verts,fChild.verts);
      if(ia.length<2)break;
      const p2d=parentEntry.verts2d;
      // Centroide del padre: siempre fuera de la arista compartida → elección robusta
      const v2d=unfoldFace(fChild.verts,ib,p2d[ia[0]],p2d[ia[1]],centroid2d(p2d));
      if(v2d)placed.set(`${k},${nextI}`,{verts2d:v2d,k,i:nextI,s,isTriangle:fChild.isTriangle});
      curK=k; curI=nextI;
    }
  }

  return placed;
}

/**
 * Construye la tira de una sección de forma LINEAL (independiente del remolino).
 * Útil para páginas de recorte: la tira se desdobla siempre hacia la derecha.
 */
function buildLinearStrip(s){
  const{N,cutActive,cutLevel}=state;
  const startK=cutActive?cutLevel:1;
  const strip=[]; // [{verts2d, k, i, isTriangle}, …]

  // Cara superior (polo)
  const fTop=buildFace3D(N-1,s);
  const poleV=fTop.verts[2];
  const vLV  =fTop.verts[3];
  const eDir=v3norm(v3sub(vLV,poleV));
  const fN  =faceNormal3d(fTop.verts);
  let pDir=v3norm(v3cross(fN,eDir));
  const cent=fTop.verts.reduce((a,v)=>[a[0]+v[0],a[1]+v[1],a[2]+v[2]],[0,0,0]).map(x=>x/fTop.verts.length);
  if(v3dot(v3sub(cent,poleV),pDir)<0)pDir=pDir.map(x=>-x);
  const vTop2d=fTop.verts.map(v=>{const r=v3sub(v,poleV);return[v3dot(r,eDir),v3dot(r,pDir)];});
  strip.push({verts2d:vTop2d,k:N-1,i:s,isTriangle:false});

  // Bajar por arista inferior-derecha — siempre abrir alejándose del polo
  let curK=N-1, curI=s;
  for(let k=N-2;k>=startK;k--){
    const nextI=stripNextI(curK,curI);
    const fParent=buildFace3D(curK,curI);
    const fChild=buildFace3D(k,nextI);
    const{ia,ib}=findSharedEdge(fParent.verts,fChild.verts);
    if(ia.length<2)break;
    const p2d=strip[strip.length-1].verts2d;
    // Centroide de toda la tira acumulada como referencia "interior"
    const allPts=strip.flatMap(f=>f.verts2d);
    const ref=centroid2d(allPts);
    const v2d=unfoldFace(fChild.verts,ib,p2d[ia[0]],p2d[ia[1]],ref);
    if(v2d)strip.push({verts2d:v2d,k,i:nextI,isTriangle:fChild.isTriangle});
    curK=k; curI=nextI;
  }
  return strip;
}

// ─── Helpers de color ─────────────────────────────────────────────────────────
function intToRGB(c){
  if(typeof c==='string'){const h=c.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
  return[(c>>16)&0xff,(c>>8)&0xff,c&0xff];
}
function lighten([r,g,b],t=0.35){return[Math.round(r+(255-r)*t),Math.round(g+(255-g)*t),Math.round(b+(255-b)*t)];}

// ─── Clase exportadora ────────────────────────────────────────────────────────
export class PinwheelPDFReporter {

  static async generateReport(){
    const{jsPDF}=window.jspdf;
    if(!jsPDF)throw new Error('jsPDF no disponible');
    const{N,cutActive,cutLevel,colorByLevel}=state;
    const startK=cutActive?cutLevel:1;
    const totalLevels=N-1;
    const numFacesPerStrip=N-startK;

    // 1. Construir remolino
    const placed=buildPinwheelNet();

    // 2. Bounding box del remolino completo
    let mnX=Infinity,mxX=-Infinity,mnY=Infinity,mxY=-Infinity;
    for(const{verts2d}of placed.values()){
      for(const[x,y]of verts2d){
        if(x<mnX)mnX=x;if(x>mxX)mxX=x;
        if(y<mnY)mnY=y;if(y>mxY)mxY=y;
      }
    }
    const fw=mxX-mnX, fh=mxY-mnY;
    const fcx=(mnX+mxX)/2, fcy=(mnY+mxY)/2;

    // 3. Escala página 1 (A4 landscape 277×185 mm útiles)
    const PW=277,PH=185;
    const SCALE=Math.min(PW/(fw*1000*1.05),PH/(fh*1000*1.05));
    const CX=148.5, CY=PH/2+12;

    const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});

    // ── Página 1: remolino completo ────────────────────────────────────────
    this._drawPinwheelPage(doc,placed,SCALE,CX,CY,fcx,fcy,N,startK,totalLevels,colorByLevel);

    // ── Página 2: tira de la sección 1 (a escala máxima) ─────────────────
    doc.addPage();
    const strip0=buildLinearStrip(0);
    this._drawStripPage(doc,strip0,0,N,startK,totalLevels,colorByLevel);

    doc.save(`ZV_Remolino_N${N}_a${state.aDeg.toFixed(1)}.pdf`);
  }

  // ─── Página 1: remolino completo ──────────────────────────────────────────
  static _drawPinwheelPage(doc,placed,scale,cx,cy,fcx,fcy,N,startK,totalLevels,colorByLevel){
    const{N:stN,aDeg,cutActive,cutLevel}=state;
    const numStrips=N, facesPerStrip=N-startK;

    // Fondo
    doc.setFillColor(248,248,252);
    doc.rect(0,0,297,210,'F');

    // Título
    doc.setFontSize(13);doc.setFont(undefined,'bold');doc.setTextColor(30,30,30);
    doc.text('Remolino de Caras — Zonohedro Polar',cx,9,{align:'center'});
    doc.setFontSize(7.5);doc.setFont(undefined,'normal');doc.setTextColor(90);
    doc.text(
      `N=${stN}  α=${aDeg.toFixed(2)}°  ${numStrips} secciones · ${facesPerStrip} caras/sección`,
      cx,15,{align:'center'});

    // Dibujar de k menor a mayor (fondo primero, polo encima)
    const entries=[...placed.values()].sort((a,b)=>a.k-b.k);

    for(const{verts2d,k,s}of entries){
      const base=colorByLevel?intToRGB(getColorForLevel(k,totalLevels)):[180,180,180];
      const fill=base;
      const pts=verts2d.map(([x,y])=>[cx+(x-fcx)*1000*scale, cy-(y-fcy)*1000*scale]);
      this._drawPolygon(doc,pts,...fill);
    }

    // Etiquetas de sección (número de sección en la cara del polo)
    for(let s=0;s<N;s++){
      const e=placed.get(`${N-1},${s}`);
      if(!e)continue;
      const pts=e.verts2d.map(([x,y])=>[cx+(x-fcx)*1000*scale, cy-(y-fcy)*1000*scale]);
      const fcx2=pts.reduce((a,p)=>a+p[0],0)/pts.length;
      const fcy2=pts.reduce((a,p)=>a+p[1],0)/pts.length;
      doc.setFontSize(5);doc.setFont(undefined,'bold');doc.setTextColor(30,30,30);
      doc.text(`${s+1}`,fcx2,fcy2+1.5,{align:'center'});
    }

    // Punto central del polo
    const pX=cx+(0-fcx)*1000*scale, pY=cy-(0-fcy)*1000*scale;
    doc.setFillColor(20,20,20);
    doc.circle(pX,pY,0.8,'F');

    // Barra de escala
    this._drawScaleBar(doc,scale,8,200);

    // Nota

  }

  // ─── Páginas de tira individual ───────────────────────────────────────────
  static _drawStripPage(doc,strip,sectionIdx,N,startK,totalLevels,colorByLevel){
    const PW=297,PH=210,mt=18;
    const{N:stN,aDeg,cutActive,cutLevel}=state;

    if(!strip||strip.length===0)return;

    // Bounding box de la tira
    let mnX=Infinity,mxX=-Infinity,mnY=Infinity,mxY=-Infinity;
    for(const{verts2d}of strip){
      for(const[x,y]of verts2d){
        if(x<mnX)mnX=x;if(x>mxX)mxX=x;
        if(y<mnY)mnY=y;if(y>mxY)mxY=y;
      }
    }
    const sw=(mxX-mnX)*1000, sh=(mxY-mnY)*1000;
    const usW=PW-16, usH=PH-mt-16;
    const scale=Math.min(usW/sw, usH/sh)*0.90;
    const offX=(PW-sw*scale)/2 - mnX*1000*scale;
    // Y invertida: el polo (k alto) queda abajo, la base (K1) arriba
    const offY=mt+(usH-sh*scale)/2 + mxY*1000*scale;

    // Fondo suave
    doc.setFillColor(250,250,253);
    doc.rect(0,0,PW,PH,'F');

    // Título
    doc.setFontSize(11);doc.setFont(undefined,'bold');doc.setTextColor(30);
    doc.text(`Sección ${sectionIdx+1} de ${N}`,PW/2,9,{align:'center'});
    doc.setFontSize(7);doc.setFont(undefined,'normal');doc.setTextColor(90);
    const kTopLabel='K'+(N-startK);
    doc.text(
      `N=${stN}  α=${aDeg.toFixed(2)}°  Escala 1:${(1/scale).toFixed(0)}`,
      PW/2,15.5,{align:'center'});

    // Dibujar caras
    for(const{verts2d,k,isTriangle}of strip){
      const base=colorByLevel?intToRGB(getColorForLevel(k,totalLevels)):[185,185,185];
      const pts=verts2d.map(([x,y])=>[offX+x*1000*scale, PH-(offY-y*1000*scale)]);
      this._drawPolygon(doc,pts,...base);

      // Etiqueta de nivel
      const fx=pts.reduce((a,p)=>a+p[0],0)/pts.length;
      const fy=pts.reduce((a,p)=>a+p[1],0)/pts.length;
      const kLabel='K'+(k-startK+1);
      doc.setFontSize(6.5);doc.setFont(undefined,'bold');doc.setTextColor(30,30,30);
      doc.text(kLabel,fx,fy+2,{align:'center'});
    }

    // Dimensión de la arista superior (rombo del polo)
    const ff=strip[0];
    if(ff&&ff.verts2d.length>=2){
      const edgeMm=v2dist(ff.verts2d[0],ff.verts2d[1])*1000;
      doc.setFontSize(6.5);doc.setFont(undefined,'normal');doc.setTextColor(80);
      doc.text(
        `Arista: ${edgeMm.toFixed(0)} mm real  |  ${(edgeMm*scale).toFixed(1)} mm en papel  |  Escala 1:${(1/scale).toFixed(0)}`,
        PW/2,PH-5,{align:'center'});
    }

    this._drawScaleBar(doc,scale,8,PH-9);
  }

  // ─── Página de resumen ────────────────────────────────────────────────────
  static _drawSummaryPage(doc,N,startK,totalLevels,fanScale){
    const{N:stN,aDeg,Dmax,h1,Htotal,cutActive,cutLevel}=state;
    const PW=297; let y=14;

    doc.setFontSize(14);doc.setFont(undefined,'bold');doc.setTextColor(30);
    doc.text('Resumen — Remolino de Caras',PW/2,y,{align:'center'}); y+=9;

    doc.setLineWidth(0.3);doc.setDrawColor(180);
    doc.line(20,y,PW-20,y); y+=6;

    const params=[
      ['N (lados)',stN],
      ['Ángulo α',`${aDeg.toFixed(2)}°`],
      ['Dmax',`${(Dmax*1000).toFixed(0)} mm`],
      ['h₁ (paso por nivel)',`${(h1*1000).toFixed(1)} mm`],
      ['Altura total estructura',`${(Htotal*1000).toFixed(0)} mm`],
      ['Corte',cutActive?`k=${cutLevel}`:'Sin corte'],
      ['Secciones (tiras)',stN],
      ['Caras por sección',stN-startK],
      ['Total caras',stN*(stN-startK)],
      ['Escala remolino p.1',`1:${(1/fanScale).toFixed(0)}`],
    ];

    let py=y;
    params.forEach(([label,val],idx)=>{
      const col=idx%2; if(idx>0&&col===0)py+=7;
      doc.setFont(undefined,'bold');doc.setFontSize(9);doc.setTextColor(50);
      doc.text(`${label}:`,22+col*130,py);
      doc.setFont(undefined,'normal');doc.setTextColor(20);
      doc.text(String(val),22+col*130+58,py);
    });
    y=py+12;

    // Leyenda de colores
    doc.setFontSize(10);doc.setFont(undefined,'bold');doc.setTextColor(30);
    doc.text('Leyenda de colores por nivel k:',22,y); y+=7;

    const swatchCols=8;
    for(let k=startK;k<=stN-1;k++){
      const col=(k-startK)%swatchCols, row=Math.floor((k-startK)/swatchCols);
      const[r,g,b]=intToRGB(getColorForLevel(k,totalLevels));
      const sx=22+col*32, sy=y+row*8;
      doc.setFillColor(r,g,b);doc.setDrawColor(100);doc.setLineWidth(0.2);
      doc.rect(sx,sy,11,5,'FD');
      doc.setFontSize(6.5);doc.setFont(undefined,'normal');doc.setTextColor(40);
      doc.text(`k=${k}`,sx+12.5,sy+4);
    }
    y+=Math.ceil((stN-startK)/swatchCols)*8+9;

    doc.setLineWidth(0.2);doc.setDrawColor(200);doc.line(20,y,PW-20,y); y+=6;

    // Notas técnicas
    doc.setFontSize(7.5);doc.setFont(undefined,'italic');doc.setTextColor(100);
    const notas=[
      'Tira diagonal: cada sección sigue la arista inferior-derecha de cada rombo, rotando N veces en sentido antihorario.',
      `Cada cara aparece exactamente una vez. Sin superposición entre secciones.`,
      'Las distancias están exactamente conservadas — cada cara es una isometría de la cara 3D real.',
      'Las páginas de sección (2 en adelante) muestran la tira a escala máxima para facilitar el recorte.',
    ];
    for(const nota of notas){doc.text(nota,22,y);y+=5.5;}

    doc.setFontSize(7);doc.setFont(undefined,'normal');doc.setTextColor(160);
    doc.text(`${new Date().toLocaleDateString('es-ES')}  —  ZValdivia · Zonohedro Polar`,PW/2,202,{align:'center'});
  }

  // ─── Polígono con relleno y contorno blanco ───────────────────────────────
  static _drawPolygon(doc,pts,r,g,b){
    if(!pts||pts.length<3)return;
    const x0=pts[0][0],y0=pts[0][1];
    const lines=[];
    for(let i=1;i<pts.length;i++)lines.push([pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]]);
    lines.push([x0-pts[pts.length-1][0],y0-pts[pts.length-1][1]]);

    doc.setFillColor(r,g,b);
    doc.setDrawColor(40,40,40);
    doc.setLineWidth(0.08);
    doc.lines(lines,x0,y0,[1,1],'FD',true);
  }

  // ─── Barra de escala ──────────────────────────────────────────────────────
  static _drawScaleBar(doc,scaleMmPerM,sbX,sbY){
    const candidates=[0.05,0.1,0.2,0.25,0.5,1,2,2.5,5,10,20,50,100];
    let barM=0.05;
    for(const c of candidates.slice().reverse())if(c*1000*scaleMmPerM<=40){barM=c;break;}
    const barMM=barM*1000*scaleMmPerM;
    doc.setDrawColor(60);doc.setLineWidth(0.3);
    doc.line(sbX,sbY,sbX+barMM,sbY);
    doc.line(sbX,sbY-1,sbX,sbY+1);doc.line(sbX+barMM,sbY-1,sbX+barMM,sbY+1);
    doc.setFontSize(7);doc.setTextColor(60);
    doc.text(barM<1?`${Math.round(barM*1000)} mm`:`${barM.toFixed(barM<2?1:0)} m`,sbX+barMM/2,sbY-2,{align:'center'});
  }
  // ─── SVG a escala real ────────────────────────────────────────────────────
  static generateSVG(){
    const{N,cutActive,cutLevel,colorByLevel}=state;
    const startK=cutActive?cutLevel:1;
    const totalLevels=N-1;

    const placed=buildPinwheelNet();

    let mnX=Infinity,mxX=-Infinity,mnY=Infinity,mxY=-Infinity;
    for(const{verts2d}of placed.values()){
      for(const[x,y]of verts2d){
        if(x<mnX)mnX=x;if(x>mxX)mxX=x;
        if(y<mnY)mnY=y;if(y>mxY)mxY=y;
      }
    }
    const pad=50;
    const W=(mxX-mnX)*1000+pad*2;
    const H=(mxY-mnY)*1000+pad*2;
    const ox=-mnX*1000+pad;
    const oy=mxY*1000+pad;

    const entries=[...placed.values()].sort((a,b)=>a.k-b.k);

    const polygons=entries.map(({verts2d,k})=>{
      const pts=verts2d.map(([x,y])=>`${(ox+x*1000).toFixed(2)},${(oy-y*1000).toFixed(2)}`).join(' ');
      let fill='#b4b4b4';
      if(colorByLevel){
        const[r,g,b]=intToRGB(getColorForLevel(k,totalLevels));
        fill=`rgb(${r},${g},${b})`;
      }
      return `<polygon points="${pts}" fill="${fill}" stroke="#282828" stroke-width="0.3" stroke-linejoin="round"/>`;
    }).join('\n    ');

    const labels=[];
    for(let s=0;s<N;s++){
      const e=placed.get(`${N-1},${s}`);
      if(!e)continue;
      const cx2=e.verts2d.reduce((a,[x])=>a+x,0)/e.verts2d.length;
      const cy2=e.verts2d.reduce((a,[,y])=>a+y,0)/e.verts2d.length;
      labels.push(`<text x="${(ox+cx2*1000).toFixed(1)}" y="${(oy-cy2*1000+1.5).toFixed(1)}" text-anchor="middle" font-family="sans-serif" font-size="6" font-weight="bold" fill="#1e1e1e">${s+1}</text>`);
    }

    const poleDot=`<circle cx="${ox.toFixed(2)}" cy="${oy.toFixed(2)}" r="1.2" fill="#141414"/>`;

    const svgStr=`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" width="${W.toFixed(1)}mm" height="${H.toFixed(1)}mm">
  <rect width="${W.toFixed(1)}" height="${H.toFixed(1)}" fill="#f8f8fc"/>
  <g id="remolino">
    ${polygons}
  </g>
  <g id="labels">
    ${labels.join('\n    ')}
    ${poleDot}
  </g>
</svg>`;

    const blob=new Blob([svgStr],{type:'image/svg+xml'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`ZV_Remolino_N${N}_a${state.aDeg.toFixed(1)}.svg`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(url),2000);
  }

}
