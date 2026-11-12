const scenes = [
  ['Helix Arena','Explora el centro de alto rendimiento. Acerca la cámara con la rueda o con +. Las cubiertas se separan progresivamente para ver cómo entrenan y se recuperan los atletas.',-.58,0],
  ['Red del campus','AtletaPro conecta los servicios del centro. Selecciona una zona para seguir sus enlaces desde el núcleo hasta los switches y puntos de acceso.',-.58,0],
];
const networkChapter = 1;
const zones = [
  ['Campus',0,0,1],
  ['Estadio',-16.7,-2.8,2.55],
  ['Gimnasio',8,-2.5,4.1],
  ['Piscinas',8,3,4.1],
  ['Tenis',16,1.7,3.4],
  ['Residencia',-16.35,10.45,5.1],
  ['Operaciones',0,11,3.3],
];
let zone = 0, targetZoom = 1, focusZ = 0, cutaway = false, failed = false;
let panX = 0, panY = 0, zoomAnchor = null;
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
// Use a depth buffer for the building geometry so walls and equipment
// remain correctly occluded while the camera moves.
const geometryCanvas=document.createElement('canvas');
geometryCanvas.className='geometry-canvas';
canvas.before(geometryCanvas);
const gl=geometryCanvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false});
let geometryProgram=null;
if(gl){
  const compile=(type,source)=>{
    const shader=gl.createShader(type);
    gl.shaderSource(shader,source);
    gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  geometryProgram=gl.createProgram();
  gl.attachShader(geometryProgram,compile(gl.VERTEX_SHADER,
    'attribute vec3 position; attribute vec4 color; varying vec4 tint; void main(){gl_Position=vec4(position,1.0);tint=color;}'));
  gl.attachShader(geometryProgram,compile(gl.FRAGMENT_SHADER,
    'precision mediump float; varying vec4 tint; void main(){gl_FragColor=tint;}'));
  gl.linkProgram(geometryProgram);
  if(!gl.getProgramParameter(geometryProgram,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(geometryProgram));
  gl.useProgram(geometryProgram);
}
const geometryBuffer=gl?gl.createBuffer():null;
const colorCache=new Map();
let gpuVertices=new Float32Array(16384);
let gpuCount=0;
let geometryOpacity='';
const positionAttrib=gl?gl.getAttribLocation(geometryProgram,'position'):-1;
const colorAttrib=gl?gl.getAttribLocation(geometryProgram,'color'):-1;
if(gl){
  gl.bindBuffer(gl.ARRAY_BUFFER,geometryBuffer);
  gl.enableVertexAttribArray(positionAttrib);
  gl.enableVertexAttribArray(colorAttrib);
  gl.vertexAttribPointer(positionAttrib,3,gl.FLOAT,false,28,0);
  gl.vertexAttribPointer(colorAttrib,4,gl.FLOAT,false,28,12);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0,0,0,0);
}
function decodeColor(hex){
  let base=colorCache.get(hex);
  if(!base){
    const value=hex.slice(1);
    base=[
      parseInt(value.slice(0,2),16)/255,
      parseInt(value.slice(2,4),16)/255,
      parseInt(value.slice(4,6),16)/255,
      value.length===8?parseInt(value.slice(6,8),16)/255:1,
    ];
    colorCache.set(hex,base);
  }
  return base;
}
function pushVertex(point,color,opacity){
  if(gpuCount+7>gpuVertices.length){
    const next=new Float32Array(gpuVertices.length*2);
    next.set(gpuVertices);
    gpuVertices=next;
  }
  const index=gpuCount;
  gpuVertices[index]=point[0]/width*2-1;
  gpuVertices[index+1]=1-point[1]/height*2;
  gpuVertices[index+2]=-point[2]/100;
  gpuVertices[index+3]=color[0];
  gpuVertices[index+4]=color[1];
  gpuVertices[index+5]=color[2];
  gpuVertices[index+6]=color[3]*opacity;
  gpuCount+=7;
}
function submitBatch(mode){
  if(!gpuCount) return;
  gl.bufferData(gl.ARRAY_BUFFER,gpuVertices.subarray(0,gpuCount),gl.DYNAMIC_DRAW);
  gl.drawArrays(mode,0,gpuCount/7);
  gpuCount=0;
}
function renderGeometry(){
  if(geometryCanvas.width!==canvas.width || geometryCanvas.height!==canvas.height){
    geometryCanvas.width=canvas.width;
    geometryCanvas.height=canvas.height;
  }
  const nextOpacity=chapter===networkChapter?'.24':'1';
  if(geometryOpacity!==nextOpacity){
    geometryOpacity=nextOpacity;
    geometryCanvas.style.opacity=nextOpacity;
  }
  gl.viewport(0,0,geometryCanvas.width,geometryCanvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const writeFaces=(edges,transparent)=>{
    gpuCount=0;
    for(const face of faces){
      if(face.opacity<=0) continue;
      if(edges){
        if(!face.edge) continue;
        const edge=decodeColor(face.edge);
        if(edge[3]*face.opacity<=0) continue;
        for(let i=0;i<face.points.length;i++){
          pushVertex(face.points[i],edge,face.opacity);
          pushVertex(face.points[(i+1)%face.points.length],edge,face.opacity);
        }
        continue;
      }
      const color=decodeColor(face.color);
      const alpha=color[3]*face.opacity;
      if(alpha<=0 || (transparent?alpha>.999:alpha<=.999)) continue;
      for(let i=1;i<face.points.length-1;i++){
        pushVertex(face.points[0],color,face.opacity);
        pushVertex(face.points[i],color,face.opacity);
        pushVertex(face.points[i+1],color,face.opacity);
      }
    }
  };
  gl.depthMask(true);
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(1,1);
  writeFaces(false,false);
  submitBatch(gl.TRIANGLES);
  gl.disable(gl.POLYGON_OFFSET_FILL);
  writeFaces(true,false);
  submitBatch(gl.LINES);
  gl.depthMask(false);
  writeFaces(false,true);
  submitBatch(gl.TRIANGLES);
  gl.depthMask(true);
}
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let chapter = 0, angle = -.65, lift = 0, focus = 0, drag = null, offset = 0;
let width, height, scale, faces, zoom = 1, tilt = .53;
let modelTransform=null, materialOpacity=1;
const networkToggle=document.querySelector('#network-toggle');
networkToggle.onclick=()=>{
  select(chapter===networkChapter?0:networkChapter);
  visit(0);
  tourStart=null;
};
function select(index) {
  chapter = index;
  document.body.classList.toggle('network', index === networkChapter);
  offset = 0;
  document.querySelector('#next-zone').hidden=index===networkChapter;
  networkToggle.textContent=index===networkChapter?'Volver al recorrido':'Mostrar red del campus';
  networkToggle.setAttribute('aria-pressed',index===networkChapter);
}
function visit(index){
  zone = index;
  offset = 0;
  targetZoom = zones[index][3];
  panX = panY = 0;
  zoomAnchor = null;
}
let tourZoomMultiplier=1;
function magnify(factor){
  if(!presenting && chapter===0 && !reduced) tourZoomMultiplier=Math.max(.5,Math.min(3,tourZoomMultiplier*factor));
  targetZoom = Math.max(.65,Math.min(7,targetZoom*factor));
}
canvas.addEventListener('wheel',event => {
  event.preventDefault();
  const bounds = canvas.getBoundingClientRect();
  zoomAnchor = [event.clientX-bounds.left-width*.5,event.clientY-bounds.top-height*.51];
  magnify(Math.exp(-event.deltaY*.0018));
},{passive:false});
const fullscreenButton = document.querySelector('#full');
document.addEventListener('fullscreenchange', () => {
  fullscreenButton.textContent = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
  fullscreenButton.setAttribute('aria-pressed', Boolean(document.fullscreenElement));
});
fullscreenButton.onclick = async () => {
  try {
    if(document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    document.querySelector('#full').textContent = 'Usa pantalla completa del navegador';
  }
};
window.addEventListener('keydown', event => {
  if(!['ArrowLeft','ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const direction=event.key === 'ArrowRight' ? 1 : -1;
  if(presenting) showStep(stageStep+direction);
  else select((chapter+direction+scenes.length)%scenes.length);
});
const activePointers = new Map();
let pinchDistance = null;
function pointerDistance(){
  const [a,b]=[...activePointers.values()];
  return Math.hypot(a[0]-b[0],a[1]-b[1]);
}
canvas.onpointerdown = event => {
  activePointers.set(event.pointerId,[event.clientX,event.clientY]);
  drag = [event.clientX,event.clientY];
  if(activePointers.size===2) pinchDistance=pointerDistance();
  canvas.setPointerCapture(event.pointerId);
};
canvas.onpointermove = event => {
  if(!activePointers.has(event.pointerId)) return;
  activePointers.set(event.pointerId,[event.clientX,event.clientY]);
  zoomAnchor = null;
  if(activePointers.size===2){
    const distance=pointerDistance();
    if(pinchDistance>0) magnify(distance/pinchDistance);
    pinchDistance=distance;
  } else if(drag){
    if(event.shiftKey){
      panX += event.clientX-drag[0];
      panY += event.clientY-drag[1];
    } else offset += (event.clientX-drag[0])*.008;
  }
  drag = [event.clientX,event.clientY];
};
function releasePointer(event){
  activePointers.delete(event.pointerId);
  pinchDistance=null;
  drag=activePointers.size ? [...activePointers.values()][0] : null;
}
canvas.onpointerup=releasePointer;
canvas.onpointercancel=releasePointer;
canvas.onlostpointercapture=releasePointer;
function project([x,y,z]) {
  x -= focus;
  z -= focusZ;
  const u = x*Math.cos(angle)-z*Math.sin(angle);
  const v = x*Math.sin(angle)+z*Math.cos(angle);
  const centerY=presenting && stageSteps[stageStep]?.closing ? .68 : .51;
  return [width*.50+u*scale+panX,height*centerY+(v*tilt-y*Math.sqrt(1-tilt*tilt))*scale+panY,v*Math.sqrt(1-tilt*tilt)+y*tilt,y];
}
function poly(vertices, color, edge, layer = 1) {
  const transformed=modelTransform ? vertices.map(([x,y,z])=>[x*.72,y,(z+7.2)*2.5+9]) : vertices;
  const points = transformed.map(project);
  faces.push({points,color,edge,layer,opacity:materialOpacity,depth:points.reduce((sum,p)=>sum+p[2],0)/points.length});
}
function floor(x,z,w,d,y,color,edge, layer = y < .16 ? 0 : 1) {
  poly([[x,y,z],[x+w,y,z],[x+w,y,z+d],[x,y,z+d]],color,edge,layer);
}
function box(x,z,w,d,y,h,colors) {
  const a=[x,y,z], b=[x+w,y,z], c=[x+w,y,z+d], d0=[x,y,z+d];
  const up=([x,y,z])=>[x,y+h,z];
  const corners=[a,b,c,d0];
  corners.forEach((p,i)=>{
    const q=corners[(i+1)%4];
    const side=[p,q,up(q),up(p)];
    const projected=side.map(point=>{
      const [x,y,z]=point;
      return project(modelTransform?[x*.72,y,(z+7.2)*2.5+9]:point);
    });
    const [first,second,third]=projected;
    const winding=(second[0]-first[0])*(third[1]-first[1])-(second[1]-first[1])*(third[0]-first[0]);
    if(winding>0) poly(side,colors[i%2+1]);
  });
  floor(x,z,w,d,y+h,colors[0],undefined,1);
}
function pitch(x,z,w,d,elevation=0){
  const mark = (x,z,w,d,y,color,edge) => floor(x,z,w,d,y+elevation,color,edge,0);
  for(let stripe=0;stripe<8;stripe++) mark(x+stripe*w/8,z,w/8,d,.05,stripe%2?'#618d71':'#6f9a7a');
  const white='#f3f8f0';
  const inset=.14, center=x+w/2, middle=z+d/2;
  mark(x+inset,z+inset,w-inset*2,d-inset*2,.065,'#ffffff00',white);
  mark(center-.022,z+inset,.044,d-inset*2,.068,white);
  for(const side of [0,1]){
    const edge=x+inset+side*(w-2*inset);
    for(const [depth,span] of [[w*.16,d*.60],[w*.058,d*.28]]){
      mark(side?edge-depth:edge,middle-span/2,depth,span,.07,'#ffffff00',white);
    }
    mark(edge+(side?-1:1)*w*.105-.026,middle-.026,.052,.052,.075,white);
  }
  const circle=Array.from({length:33},(_,i)=>[center+Math.cos(i*Math.PI/16)*d*.135,.071+elevation,middle+Math.sin(i*Math.PI/16)*d*.135]);
  poly(circle,'#ffffff00',white,0);
  mark(center-.032,middle-.032,.064,.064,.075,white);
  for(const goal of [x-.25,x+w]){
    box(goal,z+d*.42,.25,.045,0,.48,shell);
    box(goal,z+d*.58,.25,.045,0,.48,shell);
    box(goal,z+d*.42,.25,d*.16,.46,.035,shell);
  }
}
const shell=['#f8fbf8','#a6b8ae','#c7d4cb'];
const glass=['#91a99e','#426759','#658d7a'];
const dark=['#40594e','#233b31','#344e42'];
function line(points,color,size) {
  ctx.beginPath();
  points.map(project).forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
  ctx.strokeStyle=color;ctx.lineWidth=size;ctx.stroke();
}
const scoreboard=[-16.55,2.52,-9.3];
function stadium(t){
  floor(-22,-10.4,10.6,15.6,.045,'#a9b6ad');
  // Terreno de juego longitudinal con bandas, porterías y áreas.
  for(let stripe=0;stripe<10;stripe++){
    floor(-20.6,-8+stripe*1.02,7.7,1.02,.065,stripe%2?'#5b906c':'#73a27a');
  }
  const white='#f3f8f0';
  floor(-20.45,-7.85,7.4,9.9,.07,'#ffffff00',white);
  floor(-20.45,-2.93,7.4,.055,.072,white);
  for(const end of [-7.85,2.05]){
    const side=end<0?1:-1;
    floor(-18.8,side>0?end:end-1.45,4.15,1.45,.073,'#ffffff00',white);
    floor(-18,side>0?end:end-.56,2.55,.56,.075,'#ffffff00',white);
    box(-17.65,end,.07,.09,0,.45,shell);
    box(-15.85,end,.07,.09,0,.45,shell);
    box(-17.65,end,1.87,.08,.43,.07,shell);
  }
  poly(Array.from({length:32},(_,i)=>[-16.75+Math.cos(i*Math.PI/16)*.9,.075,-2.9+Math.sin(i*Math.PI/16)*.9]),'#ffffff00',white,0);
  for(let row=0;row<4;row++){
    const y=.25+row*.23;
    for(const x of [-21.05-row*.22,-12.63+row*.22]){
      box(x,-8.2,.22,10.55,0,y,shell);
      for(let seat=0;seat<25;seat++){
        if(seat%8===0) continue;
        const color=seat%3===0?'#c6e871':'#436d59';
        box(x+.025,-8+seat*.42,.16,.29,y,.13,[color,color,color]);
      }
    }
  }
  for(const x of [-21.7,-11.7]){
    for(const z of [-8.9,2.8]){
      box(x,z,.095,.095,0,2.65,dark);
      box(x-.15,z,.40,.16,2.52,.21,shell);
      // Conjunto de altavoces orientado hacia el graderío.
      box(x-.08,z+.17,.25,.23,1.62,.47,dark);
      for(let speaker=0;speaker<3;speaker++){
        box(x-.045,z+.40,.18,.03,1.68+speaker*.12,.072,['#202d2b','#121c1b','#182323']);
      }
    }
  }
  box(-18,-9.4,.13,.15,0,2.4,dark);
  box(-15.4,-9.4,.13,.15,0,2.4,dark);
  box(-18.25,-9.48,3.25,.23,2.04,.86,dark);
  for(let player=0;player<10;player++){
    const x=-19.7+(player%4)*1.72+Math.sin(t*1.45+player)*.34;
    const z=-6+player*.76+Math.cos(t*1.24+player)*.4;
    athlete(x,z,.075,player%2?'#d6ef88':'#356aa3',Math.sin(t*8+player)*.045);
  }
}

function athlete(x,z,y,shirt,stride=0){
  const kit=[shirt,shirt,shirt];
  const skin=['#efbe9c','#bc8262','#d89a78'];
  box(x-.09,z-.07+stride,.08,.09,y,.18,dark);
  box(x+.02,z-.07-stride,.08,.09,y,.18,dark);
  box(x-.12,z-.075,.24,.15,y+.17,.23,kit);
  box(x-.068,z-.055,.136,.12,y+.39,.13,skin);
}

const tourStops=[
  {zone:0,zoom:.76,rotation:-.95},
  {zone:1,zoom:2.35,rotation:-.66},
  {zone:2,zoom:3.65,rotation:.18},
  {zone:3,zoom:3.65,rotation:.38},
  {zone:4,zoom:3.0,rotation:-.28},
  {zone:6,zoom:4.1,rotation:-.42},
  {zone:5,zoom:4.4,rotation:-.23},
  {zone:0,zoom:.76,rotation:-.95},
];
const tourIntro=5000, tourTravel=1800, tourPause=1000;
const tourLeg=tourTravel+tourPause;
const tourDuration=tourIntro+(tourStops.length-1)*tourLeg;
let tourStart=null;
let tourLastTime=0;
let tourStep=0;
document.querySelector('#next-zone').onclick=()=>{
  if(presenting || chapter!==0) return;
  tourZoomMultiplier=1;
  const next=tourStep>=tourStops.length-1?1:tourStep+1;
  if(reduced){
    tourStep=next;
    visit(tourStops[next].zone);
    targetZoom=tourStops[next].zoom;
    offset=tourStops[next].rotation-scenes[0][2];
    tourLabel.textContent=zones[zone][0];
    return;
  }
  tourStart=tourLastTime-(tourIntro+(next-1)*tourLeg);
};

const tourLabel=document.querySelector('#tour-label');
function tourCamera(time){
  tourLastTime=time;
  tourStart ??= time;
  const clock=((time-tourStart)%tourDuration+tourDuration)%tourDuration;
  const moving=Math.max(0,clock-tourIntro);
  const segment=Math.min(tourStops.length-2,Math.floor(moving/tourLeg));
  const phase=clock<tourIntro?0:Math.min(1,(moving%tourLeg)/tourTravel);
  const weight=phase*phase*(3-2*phase);
  const from=tourStops[segment],to=tourStops[segment+1];
  const mix=(a,b)=>a+(b-a)*weight;
  tourStep=clock<tourIntro?0:segment+1;
  zone=phase<.45?from.zone:to.zone;
  targetZoom=Math.max(.65,Math.min(7,mix(from.zoom,to.zoom)*tourZoomMultiplier));
  panX=panY=0;
  zoomAnchor=null;
  tourLabel.textContent=zone===0?'Helix Arena · Centro de alto rendimiento':zones[zone][0];
  return {
    x:mix(zones[from.zone][1],zones[to.zone][1]),
    z:mix(zones[from.zone][2],zones[to.zone][2]),
    rotation:mix(from.rotation,to.rotation),
  };
}

function draw(time){
  if(!reduced && document.body.classList.contains('architecture-slide')) alignArchitectureEdges();
  const t=reduced?0:time/1000;
  const bounds=canvas.getBoundingClientRect();
  width=bounds.width; height=bounds.height;
  if(width<=0 || height<=0){requestAnimationFrame(draw);return;}
  const ratio=Math.min(devicePixelRatio,2);
  const pixelsWide=Math.round(width*ratio), pixelsHigh=Math.round(height*ratio);
  if(canvas.width!==pixelsWide || canvas.height!==pixelsHigh){canvas.width=pixelsWide;canvas.height=pixelsHigh;}
  ctx.setTransform(ratio,0,0,ratio,0,0);
  ctx.clearRect(0,0,width,height);
  const automatic=!presenting && chapter===0 && !reduced;
  const ease=reduced?1:automatic?.075:.045;
  const camera=automatic?tourCamera(time):null;
  tourLabel.hidden=presenting || chapter===networkChapter;
  const residenceView=zone===5 && chapter!==networkChapter;
  angle+=((camera?camera.rotation:presenting ? stageAngles[stageStep] : residenceView ? -.23 : scenes[chapter][2])+offset-angle)*ease;
  tilt+=((residenceView ? .83 : .53)-tilt)*ease;
  const previousZoom = zoom;
  zoom += (targetZoom-zoom)*ease;
  if(zoomAnchor){
    const factor=zoom/previousZoom;
    panX=zoomAnchor[0]+(panX-zoomAnchor[0])*factor;
    panY=zoomAnchor[1]+(panY-zoomAnchor[1])*factor;
  }
  const progress = Math.max(0,Math.min(1,(zoom-1.12)/1.7));
  const opening = progress*progress*(3-2*progress);
  lift+=((cutaway || chapter===networkChapter ? 9 : opening*9)-lift)*ease;
  focus+=((camera?camera.x:zones[zone][1])-focus)*ease;
  focusZ+=((camera?camera.z:zones[zone][2])-focusZ)*ease;
  scale=Math.min(width/(width<660?56:65),height/31)*zoom;
  faces=[];
  for(let i=-20;!gl && i<=20;i+=2){
    line([[i,-.75,-20],[i,-.75,20]],'#bac9bf66',1);
    line([[-20,-.75,i],[20,-.75,i]],'#bac9bf66',1);
  }
  box(-23,-13,45,29,-.7,.7,shell);
  for(const face of faces) face.layer=-1;
  floor(-22,6,43,2.6,.025,'#b0b9ae');
  floor(-22,-12,43,1.2,.025,'#adb8ad');
  floor(-12,-10,1.15,18,.03,'#ccd3c9');
  stadium(t);
  pitch(12,-9,8.6,6);
  for(let court=0;court<2;court++){
    const x=12+court*4.6;
    floor(x,-1.7,4.25,7.1,.05,'#a65f4d');
    floor(x+.40,-1.35,3.45,6.4,.06,'#739593','#ecf1e9');
    floor(x+.8,-1.35,2.65,6.4,.065,'#ffffff00','#f7faf4');
    floor(x+.8,.02,2.65,3.66,.07,'#ffffff00','#f7faf4');
    floor(x+2.1,.02,.05,3.66,.075,'#f7faf4');
    box(x+.35,1.83,3.55,.065,.08,.38,glass);
    box(x+.32,1.80,.10,.12,.08,.50,shell);
    box(x+3.88,1.80,.10,.12,.08,.50,shell);
    for(const side of [-1,1]){
      const playerX=x+2.1+Math.sin(t*2+side+court)*.85;
      const playerZ=1.84+side*(2.36+Math.cos(t*2+court)*.3);
      athlete(playerX,playerZ,.07,side>0?'#ddc046':'#295ba4',Math.sin(t*8)*.05);
      box(playerX+.13,playerZ,.20,.07,.31+Math.sin(t*4)*.08,.06,shell);
    }
    const phase=(t*.76+court*.3)%1;
    box(x+2.1+Math.sin(t*2)*.55,1.84+Math.cos(phase*Math.PI*2)*2.4,.085,.085,.20+Math.sin(phase*Math.PI)**2*.86,.08,['#f3ec63','#cac43c','#dfd84b']);
  }
  for(const x of [-21,-12.3,12,20.3]){
    for(const z of [-9,-3]){
      box(x,z,.10,.10,0,2.6,dark);
      box(x-.16,z-.07,.42,.19,2.58,.14,shell);
    }
  }
  // Graderíos y bancos junto a los campos.
  for(let row=0;row<4;row++){
    box(12,-10.4-row*.18,8.6,.18,0,.22+row*.16,shell);
  }
  // Residencia, con fachada modular y patios.
  for(let wing=0;wing<2;wing++){
    const x=-21+wing*4.8;
    box(x,9,4.3,2.9,0,.22,shell);
    box(x,9,4.3,.11,.22,Math.max(.18,2.28-lift*.28),shell);
    box(x,9,.11,2.9,.22,Math.max(.18,2.28-lift*.3),shell);
    for(let room=0;room<4;room++){
      const bed=x+.23+room;
      const linen=room%2?['#9cbfc8','#507783','#749ba5']:['#bcd391','#68844a','#8ba66a'];
      box(bed-.1,9.22,.82,1.67,.22,.018,['#dfd5c3','#b6aa97','#cec2ab']);
      box(bed,9.33,.63,1.25,.24,.14,dark);
      box(bed,9.33,.63,1.25,.38,.085,shell);
      box(bed-.015,9.65,.66,.94,.465,.055,linen);
      box(bed+.085,9.38,.46,.22,.465,.09,shell);
      box(bed,9.27,.63,.065,.24,.38,dark);
      box(bed+.69,9.37,.20,.27,.24,.24,shell);
      box(bed+.72,9.43,.10,.11,.48,.13,['#f1d888','#af934f','#ceaf69']);
      box(bed,11.38,.66,.32,.24,.33,dark);
      box(bed+.12,11.36,.37,.045,.57,.15,glass);
      box(bed+.16,11.05,.29,.24,.24,.17,linen);
      if(room<3) box(bed+.79,9.24,.045,2.43,.22,.19,shell);
    }
    materialOpacity=Math.max(0,1-lift/3);
    for(let level=0;level<3;level++){
      for(let bay=0;bay<7;bay++)box(x+.18+bay*.58,11.91,.42,.03,.32+level*.71,.43,glass);
    }
    materialOpacity=Math.max(0,1-lift/7.6);
    box(x+.12,9.12+lift*.55,4.06,2.66,2.5+lift*.54,.16,shell);
    materialOpacity=1;
  }
  floor(-21,8.6,9.15,.3,.03,'#759785');
  // Acceso y plaza.
  for(let col=0;col<17;col++) floor(-21.5+col*2.5,6.15,.04,2.28,.035,'#e0e6db');
  box(13,9.2,5,1.15,0,.65,dark);
  for(let i=0;i<7;i++)box(13+i*.70,9.15,.09,1.23,0,.83,shell);
  // Pistas y campo
  floor(-10,-5,14,10,.04,'#ad694f');
  for(let i=0;i<5;i++)floor(-9.6+i*.25,-4.65+i*.25,13.2-i*.5,9.3-i*.5,.06+i*.006,i===4?'#54846b':'#ad694f','#f4d8bc');
  pitch(-7.9,-3,9.8,6,.10);
  // Pabellones y núcleo
  const gymRoof = 2.2 + lift * .66;
  const recoveryRoof = 1.85 + lift * .63;
  box(5,-5,6,5,0,.18,shell);
  box(5,.7,2.7,4.4,0,.18,shell);
  for(let i=0;i<5;i++){
    box(5.5+i*.98,-4.4,.65,1,.18,.15,dark);
    box(5.59+i*.98,-4.25,.46,.72,.33,.22,glass);
    box(5.7+i*.98,-2.2,.43,.55,.18,.54,shell);
    athlete(5.82+i*.98,-3.85,.32,i%2?'#c64f49':'#386cb3',Math.sin(t*9+i)*.075);
    athlete(5.82+i*.98,-1.05,.25,'#cf8b3c');
    box(5.54+i*.98,-1.05,.57,.08,.56+Math.sin(t*2+i)*.13,.08,dark);
  }
  // El vaso se dibuja sobre la plataforma y debajo de los nadadores.
  floor(7.7,.85,3.2,4.08,.195,'#d8eceb',undefined,0);
  floor(7.92,1.08,2.78,3.58,.20,'#168ec3','#f0fbff',0);
  for(let lane=0;lane<3;lane++){
    const x=8.38+lane*.9;
    const z=2.86+Math.sin(t*1.18+lane*2)*1.42;
    floor(x-.025,1.14,.05,3.45,.21,'#a1eaf7',undefined,0);
    box(x-.13,z-.22,.26,.43,.22,.10,['#ff795b','#ad493b','#ea6850']);
    box(x-.083,z+.16,.166,.14,.25,.10,shell);
    box(x-.25,z+Math.sin(t*6+lane)*.17,.5,.08,.24,.04,shell);
  }
  for(let i=0;i<3;i++){
    floor(8.4+i*.78,1.13,.025,3.44,.32,'#c1e6e3');
    box(5.4,1.1+i*1.18,1.7,.63,.18,.38,shell);
    box(5.48,1.13+i*1.18,1.5,.52,.56,.12,glass);
  }
  for(let panel=0;panel<6;panel++){
    const drift=(panel-2.5)*lift*.13;
    box(5+panel+drift,-5-lift*.62,.94,5,gymRoof+panel*lift*.036,.22,shell);
    materialOpacity=Math.max(0,1-lift/7.6);
    box(5+panel+drift,.7+lift*.69,.94,4.4,recoveryRoof+panel*lift*.036,.22,shell);
    materialOpacity=1;
  }
  modelTransform=true;
  box(-10,-7.2,21,1.5,0,.18,shell);
  box(-10,-7.2,21,.12,.18,1.47,dark);
  for(let desk=0;desk<5;desk++){
    const x=-2+desk*.85;
    box(x,-6.45,.71,.43,.18,.36,shell);
    const monitor=failed && chapter===networkChapter?['#e55659','#941b27','#bf343d']:glass;
    box(x+.12,-6.40,.45,.07,.53,.24,monitor);
    athlete(x+.34,-5.85,.18,desk%2?'#1d699b':'#ba604a');
  }
  // Racks de servidores con módulos y testigos de actividad.
  for(let rack=0;rack<6;rack++){
    const x=-8.7+rack*.72;
    box(x,-6.95,.54,.63,.18,1.12,dark);
    for(let unit=0;unit<6;unit++){
      box(x+.045,-6.30,.45,.025,.27+unit*.15,.10,['#3e5952','#253b35','#304a42']);
      box(x+.37,-6.267,.045,.018,.30+unit*.15,.03,['#b8e981','#b8e981','#b8e981']);
    }
  }
  // Mur d'écrans de supervision et postes informatiques.
  for(let screen=0;screen<4;screen++){
    const x=2.8+screen*.84;
    box(x,-7.03,.75,.07,.63,.58,dark);
    box(x+.04,-6.95,.67,.02,.68,.48,glass);
    for(let bar=0;bar<4;bar++)box(x+.09,-6.925,.08+bar*.10,.012,.73+bar*.08,.026,['#a6d8b4','#a6d8b4','#a6d8b4']);
  }
  for(let desk=0;desk<5;desk++){
    const x=-2+desk*.85;
    box(x+.44,-6.40,.17,.24,.18,.28,dark);
    box(x+.10,-6.12,.40,.14,.55,.024,dark);
    box(x+.22,-6.37,.04,.05,.54,.10,shell);
    box(x+.04,-6.4,.14,.025,.55,.20,glass);
    box(x+.21,-5.94,.28,.08,.32,.23,dark);
  }
  box(-10,-7.2,.12,1.5,.18,Math.max(.2,1.8-lift*.2),shell);
  box(10.88,-7.2,.12,1.5,.18,Math.max(.2,1.8-lift*.2),shell);
  materialOpacity=Math.max(0,1-lift/7);
  box(-10,-7.2+lift*.15,21,1.5,2.1+lift*.5,.14,shell);
  materialOpacity=1;
  modelTransform=null;
  floor(-.4,8.6,1, .45,.02,'#b3c4b8');

  for(let i=0;i<10;i++)box(5.1+i*.57,-5.05,.09,.12,0,2.26,shell);
  for(let i=0;i<10;i++)box(5.1+i*.57,.65,.09,.12,0,1.91,shell);
  for(let i=0;i<6;i++)box(-9.9+i*2.4,5.35,1.9,.45,0,.32,dark);
  // Equipos de fuerza, zona de análisis y vasos de contraste.
  for(let station=0;station<5;station++){
    const x=5.45+station*1.03;
    box(x,-1.3,.72,.49,.18,.07,dark);
    box(x,-1.3,.09,.09,.25,.65,shell);
    box(x+.63,-1.3,.09,.09,.25,.65,shell);
    box(x-.06,-1.31,.84,.08,.63,.07,dark);
  }
  for(let bath=0;bath<2;bath++){
    const z=4.65-bath*.70;
    box(7.1,z,.75,.58,.18,.25,shell);
    floor(7.17,z+.065,.61,.45,.44,bath?'#69b8d0':'#d4a87b');
  }
  // Costillas de cubierta con lucernarios
  for(let i=0;i<15;i++){
    const z=-6.8+i*.92;
    const shift=lift*.46;
    box(-11,z-shift,22.8,.72,3.05+lift,.26,shell);
    box(-1.8,z-shift,4.6,.74,3.32+lift,.045,glass);
  }
  for(const x of [-11,11.55])for(const z of [-6.8,5.9])box(x,z,.24,.24,0,3.1,shell);
  for(let i=0;i<12;i++){
    const x=-21+(i%6)*8.2, z=i<6?8.5:-11.5;
    box(x,z,.7,.7,0,.22,dark);
    box(x+.29,z+.3,.11,.11,.22,.7,dark);
    box(x+.10,z+.1,.5,.5,.76,.52,['#698775','#435f4f','#587663']);
  }
  for(let i=0;i<32;i++){
    const direction=i%2===0?1:-1;
    const x=((i*3.81+t*(.65+i%4*.12)*direction)%41+41)%41-20.5;
    const z=6.1+(i%9)*.24;
    const stride=Math.sin(t*12+i)*.075;
    const coat=['#b96046','#416e65','#344e5b','#dbad66'][i%4];
    for(const side of [-1,1])box(x+stride*side,z+side*.055,.07,.05,0,.19,dark);
    box(x,z-.08,.12,.16,.16,.19,[coat,coat,coat]);
    box(x+.018,z-.048,.08,.08,.35,.08,['#d5ad89','#b48866','#bd9674']);
  }
  faces.sort((a,b)=>a.layer-b.layer || (a.layer===0 ? a.points[0][3]-b.points[0][3] : a.depth-b.depth));
  if(gl) renderGeometry();
  else for(const face of faces){
    ctx.globalAlpha=(chapter===networkChapter?.24:1)*face.opacity;
    ctx.beginPath();
    face.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.closePath();
    ctx.fillStyle=face.color;
    ctx.fill();
    if(face.edge){ctx.strokeStyle=face.edge;ctx.lineWidth=1;ctx.stroke();}
  }
  ctx.globalAlpha=1;
  if(chapter===networkChapter) drawNetwork(t);
  else if(zone===1 || zoom>1.6) badge(scoreboard,'HELIX  2–1  VISITA  ·  67:24','#10251f');
  else if(zone) {
    const point = [zones[zone][1],.9,zones[zone][2]];
    badge(point,zones[zone][0],'#153b2d');
  }
  if(presenting) drawStagePulse(time);
  requestAnimationFrame(draw);
}
const branches = [
  {id:'FUT',point:[-16.7,.22,-3],name:'Estadio'},
  {id:'GYM',point:[8,.22,-2.5],name:'Gimnasio'},
  {id:'REC',point:[8,.22,3],name:'Piscinas y fisioterapia'},
  {id:'TEN',point:[16,.22,1.7],name:'Tenis'},
  {id:'RES',point:[-17,.22,10],name:'Residencia'},
  {id:'OPS',point:[.2,.85,12.3],name:'Operaciones'},
];
function badge(point,label,color){
  const [x,y]=project(point);
  ctx.font='700 11px system-ui';
  const size=ctx.measureText(label).width+14;
  ctx.fillStyle=color;
  ctx.fillRect(x-size/2,y-19,size,18);
  ctx.fillStyle='#fff';
  ctx.fillText(label,x-size/2+7,y-6);
}
function networkNode(point,label,color){
  const [x,y]=project(point);
  ctx.fillStyle=color;
  ctx.strokeStyle='#fff';
  ctx.lineWidth=2;
  ctx.fillRect(x-5,y-5,10,10);
  ctx.strokeRect(x-5,y-5,10,10);
  badge(point,label,color);
}
function networkFlow(path,t,color){
  const progress=(t*.6)%1*(path.length-1);
  const index=Math.floor(progress);
  const from=path[index],to=path[index+1];
  const [x,y]=project(from.map((v,i)=>v+(to[i]-v)*(progress%1)));
  ctx.fillStyle=color;
  ctx.beginPath();
  ctx.arc(x,y,3.5,0,Math.PI*2);
  ctx.fill();
}
function drawNetwork(t){
  const router=[-7.5,1.2,10.5];
  const core=[-3.5,1.85,9.5];
  const app=[3.5,1.3,10.6];
  const service=[7.2,1.3,12.6];
  const healthy='#008f6a',fault='#d95047',amber='#ae791e';
  const trunk=[router,core];
  const application=[core,[3.5,.35,9.5],app,service];
  ctx.setLineDash(failed?[6,5]:[]);
  line(trunk,failed?fault:'#286eaa',3.5);
  line(application,failed?fault:healthy,3);
  for(const [index,branch] of branches.entries()){
    const [x,y,z]=branch.point;
    const switchNode=[x,y,z];
    const access=[x+1.4,y,z+.75];
    const path=[core,[x,.35,9.5],switchNode];
    line(path,failed?fault:'#286eaa',2.5);
    ctx.setLineDash([]);
    line([switchNode,access],healthy,1.7);
    if(!failed) networkFlow(path,t+index*.3,healthy);
    const id=branch.id==='REC'?'HA-ACC-MED-01':branch.id==='FUT'||branch.id==='GYM'||branch.id==='TEN'?'HA-ACC-DEP-01':'SW-'+branch.id;
    networkNode(switchNode,id,'#246349');
    if(zone===index+1) networkNode(access,'AP-'+branch.id,'#246349');
    ctx.setLineDash(failed?[6,5]:[]);
  }
  ctx.setLineDash([]);
  if(!failed){
    networkFlow(trunk,t,healthy);
    networkFlow(application,t,healthy);
  }
  networkNode(router,'BB-R1-SPBR'+(failed?' · CAÍDO':''),failed?fault:'#246349');
  networkNode(core,'HA-CORE-01','#246349');
  networkNode(app,'HA-APP-01','#246349');
  networkNode(service,'AtletaPro · '+(failed?'AFECTADO':'OPERATIVO'),failed?amber:'#246349');
}

visit(0);
select(0);
requestAnimationFrame(draw);

const demoSteps = [
  {title:'Visibilidad del servicio', capability:'BMC Helix Dashboards', agent:'', value:'A las 03:00, AtletaPro sigue en verde. Aparece una señal de riesgo.', action:'Conectar la salud técnica con la experiencia del atleta y el impacto de negocio.', sketch:'dashboards', zone:6},
  {title:'Localizar el fallo de red', capability:'BMC Helix Network Management', agent:'', value:'El router BB-R1-SPBR deja de funcionar e impacta en el servicio AtletaPro.', action:'Seguir la ruta afectada y comprobar la latencia por salto.', zone:6, outage:true},
  {title:'De los eventos al cambio', capability:'BMC Helix AIOps + HelixGPT', agent:'', value:'La topología aporta contexto. La correlación concentra el ruido en una situación.', action:'Revisar la situación y la recomendación de Root Cause Finder.', sketch:'aiops', zone:6, outage:true},
  {title:'Coordinar desde Teams', capability:'War room · Microsoft Teams', agent:'OpsWarmer', value:'La situación genera una incidencia y el equipo comparte su contexto en la war room.', action:'Pedir un resumen a OpsWarmer y coordinar el cambio en ITSM.', sketch:'teams', zone:6, outage:true},
  {title:'Validar antes de autorizar', capability:'Gestión de cambios', agent:'Change Coordinator', value:'El router necesita un firmware actualizado para poder aplicar QoS.', action:'Completar el plan de pruebas y solicitar autorización. Después, actualizar el firmware y aplicar QoS.', sketch:'change', zone:6, outage:true},
  {title:'Conservar lo aprendido', capability:'Gestión del conocimiento', agent:'Knowledge Curator · ITSM agent', value:'El contexto del ticket se convierte en conocimiento reutilizable y documentación de la incidencia mayor.', action:'Revisar el artículo y el Major Incident Report; descargar el informe en PDF.', sketch:'knowledge', zone:6},
  {title:'Prevenir la repetición', capability:'Gestión de problemas', agent:'Problem Solver', value:'Agrupa incidencias relacionadas y explora el problema con el contexto generado por HelixGPT.', action:'Preguntar por el clúster, revisar las evidencias y validar el candidato a problema.', sketch:'problem', zone:6},
  {title:'Un onboarding, varios equipos', capability:'BMC Helix Business Workflows · Digital Workplace', agent:'Employee Navigator', value:'RR. HH., TI y operaciones coordinan la incorporación del atleta en un único flujo.', action:'Solicitar el onboarding, repartir tareas y seguir cada incorporación.', sketch:'onboarding', zone:5},
  {title:'Mejorar el catálogo', capability:'Service Optimizer', agent:'', value:'Las conversaciones con Employee Navigator revelan oportunidades para crear o mejorar servicios.', action:'Revisar las conversaciones y priorizar por impacto. Llevar la oportunidad a Catalog Curator.', sketch:'optimizer', zone:6},
  {title:'Medir el valor de los agentes', capability:'Agent Outcomes', agent:'', value:'Cuantifica la capacidad digital creada y el valor que aportan los agentes al negocio.', action:'Comparar resultados por agente y periodo.', sketch:'outcomes', zone:6},
  {title:'Segunda parte', value:'', zone:0, closing:true},
  {title:'A2A y MCP', value:'', sketch:'architecture', zone:0},
  {title:'Mensajería instantánea', capability:'Innovation Studio · HAE', agent:'', value:'Una aplicación de Innovation Studio, construida con HAE, manda WhatsApp por Twilio y controla cada comunicado.', action:'Elegir plantilla, personas o grupos, enviar y seguir el estado de entrega.', sketch:'messaging', zone:0},
];
const stageSteps = demoSteps;
const present = document.querySelector('#present');
const cue = document.querySelector('#cue');
const stageControls = document.querySelector('#stage-controls');
const previousStep = document.querySelector('#prev-step');
const nextStep = document.querySelector('#next-step');
let presenting = false;
let stageStep = 0;
let stageTransition = null;
const stageAngles = [-.58,-.74,-.40,-.48,-.61,-.46,-.55,-.24,-.52,-.58,-.58,-.58,-.58];
const stageMarkers = [
  [.2,1.3,12.3], [-.5,.85,10.4], [-3.5,1.85,9.5],
  [.2,1.3,12.3], [.2,1.3,12.3], [-.5,.85,10.4], [-3.5,1.85,9.5],
  [-16.35,.8,10.45], [.2,1.3,12.3], [.2,1.3,12.3], [0,1,0], [0,1,0], [0,1,0],
];

function drawStagePulse(time){
  if(!stageTransition || reduced) return;
  stageTransition.start ??= time;
  const elapsed=(time-stageTransition.start)/1250;
  if(elapsed>=1){
    stageTransition=null;
    return;
  }
  const {from,to}=stageTransition;
  const travel=Math.min(1,elapsed*2);
  const position=from.map((coordinate,i)=>coordinate+(to[i]-coordinate)*travel);
  const [x,y]=project(position);
  const color=failed?'#e12f38':'#228e68';
  ctx.save();
  ctx.globalAlpha=1-elapsed;
  ctx.strokeStyle=color;
  ctx.lineWidth=3;
  ctx.beginPath();
  ctx.arc(x,y,8+elapsed*32,0,Math.PI*2);
  ctx.stroke();
  ctx.fillStyle=color;
  ctx.beginPath();
  ctx.arc(x,y,5,0,Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function fitSketch(){
  const slot=document.querySelector('#sketch-slot');
  const content=slot.firstElementChild;
  if(slot.hidden || !content) return;
  if(window.matchMedia('(max-width:1024px)').matches){
    if(content.style.zoom) content.style.zoom='';
    return;
  }
  const style=getComputedStyle(slot);
  const available=slot.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)-4;
  if(available<=0) return;
  content.style.zoom='1';
  if(content.scrollHeight<=available) return;
  // Find the largest readable scale that fits the whole sketch on a presentation screen.
  let low=.6,high=1;
  for(let i=0;i<8;i++){
    const middle=(low+high)/2;
    content.style.zoom=String(middle);
    if(content.scrollHeight*middle<=available) low=middle;
    else high=middle;
  }
  content.style.zoom=String(low);
}
function layoutSketch(){
  fitSketch();
  alignValueCallouts();
  alignArchitectureEdges();
}
function alignArchitectureEdges(){
  const board=document.querySelector('#sketch-slot .orbit-board');
  if(!board) return;
  const bounds=board.getBoundingClientRect();
  const svg=board.querySelector('.orbit-lines');
  svg.setAttribute('viewBox','0 0 '+bounds.width+' '+bounds.height);
  const mobile=window.matchMedia('(max-width:1024px)').matches;
  const rect=id=>board.querySelector('#'+id+' .orbit-card').getBoundingClientRect();
  for(const path of svg.querySelectorAll('path[data-from]')){
    const from=rect(path.dataset.from),to=rect(path.dataset.to);
    if(!from.width || !to.width) continue;
    let x1,y1,x2,y2,d;
    if(path.classList.contains('orbit-a2a')){
      if(mobile){
        x1=from.right-bounds.left;y1=from.top+from.height/2-bounds.top;
        x2=to.right-bounds.left;y2=to.top+to.height/2-bounds.top;
        const side=bounds.width-2;
        d=`M${x1},${y1} L${side},${y1} L${side},${y2} L${x2},${y2}`;
      }else{
        x1=from.left-bounds.left;y1=from.top+from.height/2-bounds.top;
        x2=to.right-bounds.left;y2=to.top+to.height/2-bounds.top;
        d=`M${x1},${y1} L${x2},${y2}`;
      }
    }else if(mobile){
      const left=to.left+to.width/2<bounds.left+bounds.width/2;
      const side=left?8:bounds.width-8;
      x1=(left?from.left:from.right)-bounds.left;y1=from.top+from.height/2-bounds.top;
      x2=(left?to.left:to.right)-bounds.left;y2=to.top+to.height/2-bounds.top;
      d=`M${x1},${y1} C${side},${y1} ${side},${y2} ${x2},${y2}`;
    }else{
      const above=to.top<from.top;
      x1=from.left+from.width/2-bounds.left;y1=(above?from.top:from.bottom)-bounds.top;
      x2=to.left+to.width/2-bounds.left;y2=(above?to.bottom:to.top)-bounds.top;
      const middle=(y1+y2)/2;
      d=`M${x1},${y1} C${x1},${middle} ${x2},${middle} ${x2},${y2}`;
    }
    path.setAttribute('d',d);
  }
}
function alignValueCallouts(){
  const container=document.querySelector('#sketch-slot .annotated-monitor');
  if(!container) return;
  const bounds=container.getBoundingClientRect();
  const svg=container.querySelector('.callout-lines');
  svg.setAttribute('viewBox','0 0 '+bounds.width+' '+bounds.height);
  svg.replaceChildren();
  for(const box of container.querySelectorAll('[data-callout]')){
    const target=container.querySelector('[data-callout-target="'+box.dataset.callout+'"]');
    const boxBounds=box.getBoundingClientRect(),targetBounds=target.getBoundingClientRect();
    const upper=box.dataset.callout==='discovery';
    const mobile=window.matchMedia('(max-width:1024px)').matches;
    const x=boxBounds.left-bounds.left+boxBounds.width/2;
    const y=(upper?boxBounds.bottom:boxBounds.top)-bounds.top;
    const tx=targetBounds.left-bounds.left+targetBounds.width*(upper?.28:.5);
    const ty=(upper?targetBounds.top:targetBounds.bottom)-bounds.top;
    const middle=(y+ty)/2;
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',mobile
      ? 'M'+(boxBounds.left-bounds.left)+' '+(boxBounds.top-bounds.top+boxBounds.height/2)+' H6 V'+(targetBounds.top-bounds.top+targetBounds.height/2)+' H'+(targetBounds.left-bounds.left)
      : 'M'+x+' '+y+' C'+x+' '+middle+' '+tx+' '+middle+' '+tx+' '+ty);
    const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');
    dot.setAttribute('cx',mobile?targetBounds.left-bounds.left:tx);
    dot.setAttribute('cy',mobile?targetBounds.top-bounds.top+targetBounds.height/2:ty);
    dot.setAttribute('r',4);
    svg.append(path,dot);
  }
}
if(typeof ResizeObserver!=='undefined'){
  new ResizeObserver(layoutSketch).observe(document.querySelector('#sketch-slot'));
}

function showStep(index){
  const previous=stageStep;
  if(presenting && window.matchMedia('(max-width:1024px)').matches) window.scrollTo({top:0,behavior:'instant'});
  stageStep = Math.max(0, Math.min(stageSteps.length-1,index));
  if(stageStep!==previous) stageTransition={from:stageMarkers[previous],to:stageMarkers[stageStep]};
  const step=stageSteps[stageStep];
  const demo=Boolean(step.capability);
  document.body.classList.toggle('part-two-slide',Boolean(step.closing));
  document.body.classList.toggle('architecture-slide',step.sketch==='architecture');
  document.querySelector('#part-two-title').hidden=!step.closing;
  document.body.classList.toggle('product-slide',['aiops','dashboards','change','teams','knowledge','problem','optimizer','outcomes','onboarding','architecture','messaging'].includes(step.sketch));
  document.querySelector('#helixgpt-capabilities').hidden=step.sketch!=='aiops';
  failed=Boolean(step.outage);
  select(demo && step.zone===6 ? networkChapter : 0);
  visit(0);
  cue.className=demo?'demo':'overview';
  cue.hidden=Boolean(step.closing || step.sketch==='architecture');
  if(step.closing){zoom=targetZoom=1.12;angle=stageAngles[stageStep];focus=focusZ=offset=panX=panY=0;lift=0;tilt=.53;zoomAnchor=null;cutaway=false;stageTransition=null;}
  tourLabel.hidden=true;
  document.querySelector('#cue-phase').textContent=step.capability || 'Visita al centro';
  document.querySelector('#cue-title').textContent=step.title;
  document.querySelector('#cue-value').textContent=step.value;
  const agent=document.querySelector('#cue-agent');
  agent.hidden=!step.agent;
  agent.textContent=step.agent ? 'HelixGPT · '+step.agent : '';
  const action=document.querySelector('#cue-action');
  action.hidden=!step.action;
  action.textContent=step.action?'Acción · '+step.action:'';
  const sketchSlot=document.querySelector('#sketch-slot');
  sketchSlot.replaceChildren();
  sketchSlot.scrollTop=0;
  cue.scrollTop=0;
  sketchSlot.hidden=!step.sketch;
  if(step.sketch){
    const template=document.querySelector('#sketch-'+step.sketch);
    sketchSlot.append(template.content.cloneNode(true));
    for(const topology of sketchSlot.querySelectorAll('.ci-topology')){
      topology.tabIndex=0;
      topology.setAttribute('role','region');
      topology.setAttribute('aria-label','Topología del servicio AtletaPro');
    }
    const expandA2A=sketchSlot.querySelector('#expand-a2a');
    if(expandA2A){
      const board=sketchSlot.querySelector('.orbit-board');
      const subtitle=sketchSlot.querySelector('#arch-subtitle');
      expandA2A.onclick=()=>{
        const expanded=board.classList.toggle('a2a-expanded');
        expandA2A.setAttribute('aria-expanded',String(expanded));
        expandA2A.textContent=expanded?'← Vista de la aplicación':'✦ Mostrar customización A2A →';
        if(subtitle) subtitle.textContent=expanded
          ?'La customización A2A conecta un agente de Copilot Studio con el supervisor, que sigue dentro de CAB Workspace.'
          :'El CAB Supervisor vive dentro de CAB Workspace. HAE construyó ahí el calendario de cambios.';
        requestAnimationFrame(layoutSketch);
      };
    }
    requestAnimationFrame(layoutSketch);
  }
  previousStep.disabled=stageStep===0;
  nextStep.disabled=stageStep===stageSteps.length-1;
  document.querySelector('#step-count').textContent=(stageStep+1)+' / '+stageSteps.length;
}
present.onclick=()=>{
  presenting=!presenting;
  document.body.classList.toggle('presenting',presenting);
  if(!presenting){
    document.body.classList.toggle('product-slide',false);
    document.body.classList.toggle('part-two-slide',false);
    document.body.classList.toggle('architecture-slide',false);
    document.querySelector('#part-two-title').hidden=true;
    tourStart=null;
    failed=false;
    select(0);
    visit(0);
  }
  present.textContent=presenting?'Salir del escenario':'Modo escenario';
  stageControls.hidden=!presenting;
  cue.hidden=!presenting;
  tourLabel.hidden=presenting;
  document.querySelector('#sketch-slot').hidden=true;
  stageTransition=null;
  if(presenting){
    stageStep=0;
    showStep(0);
  }
};
previousStep.onclick=()=>showStep(stageStep-1);
nextStep.onclick=()=>showStep(stageStep+1);
