// Illustrated, procedural sky layer. No WebGL, requests, external assets or user data.
// Sprite-like pigment textures are generated once per weather/light combination.
const TWO_PI = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function randomSource(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function palette(phase, weather) {
  const wet = weather === 'rain' || weather === 'storm';
  if (phase === 'night') return wet
    ? ['#8797a5', '#566a78', '#273c4b', '#e4e9ed']
    : ['#a8bed2', '#768fa8', '#455b72', '#e4eff5'];
  if (weather === 'storm') return ['#c4ced0', '#8d9da2', '#435a68', '#e4e1d2'];
  if (weather === 'rain') return ['#e0e4dd', '#aebdc0', '#667e88', '#fcf3db'];
  if (weather === 'overcast') return ['#ecece8', '#b8c4c7', '#738a94', '#f1f0e8'];
  if (phase === 'dawn') return ['#fff7e3', '#e8c9c4', '#aeabb5', '#fff8e2'];
  if (phase === 'dusk') return ['#ffeed8', '#e6b8b2', '#b1a5b3', '#fff1d2'];
  return ['#fffefa', '#e8f0ec', '#aec4d3', '#fffdf0'];
}

function roundedCloudContour(ctx, w, h, random, stratus) {
  const jitter = (scale) => (random() - .5) * scale;
  const base = stratus ? h * .67 : h * .80;
  ctx.beginPath();
  ctx.moveTo(w * .035, base);
  if (stratus) {
    ctx.bezierCurveTo(w*.02,h*.59,w*.06,h*.45,w*.17,h*.47);
    ctx.bezierCurveTo(w*.25,h*.41,w*.33,h*.33,w*.43,h*.43);
    ctx.bezierCurveTo(w*.54,h*.34,w*.64,h*.42,w*.71,h*.46);
    ctx.bezierCurveTo(w*.82,h*.37,w*.91,h*.49,w*.965,h*.53);
  } else {
    ctx.bezierCurveTo(w*.003,h*.67,w*.06,h*.49,w*.15,h*.54);
    ctx.bezierCurveTo(w*.16,h*.38,w*.25,h*.30,w*.33,h*.38);
    ctx.bezierCurveTo(w*(.34+jitter(.018)),h*.24,w*.44,h*.11,w*.51,h*.21);
    ctx.bezierCurveTo(w*.61,h*.08,w*.69,h*.31,w*.71,h*.36);
    ctx.bezierCurveTo(w*.83,h*.23,w*.87,h*.44,w*.89,h*.53);
    ctx.bezierCurveTo(w*.96,h*.51,w*.985,h*.65,w*.965,base);
  }
  ctx.bezierCurveTo(w*.94,base+h*.045,w*.79,base+h*.018,w*.66,base+h*.060);
  ctx.bezierCurveTo(w*.53,base+h*.092,w*.41,base+h*.037,w*.32,base+h*.075);
  ctx.bezierCurveTo(w*.23,base+h*.095,w*.11,base+h*.047,w*.035,base);
  ctx.closePath();
}

function paintCumulus(canvas, colors, seed, phase, weather, stratus = false, sunFromLeft = false, sunY = 30) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  const random = randomSource(seed);
  ctx.clearRect(0,0,w,h);
  const wet = weather === 'storm' || weather === 'rain';
  // A diffused pigment halo softens the silhouette, followed by a defined
  // scalloped mass. The uneven underside reads like weather, not a blur oval.
  ctx.save();
  ctx.filter='blur(13px)'; ctx.globalAlpha=.32;
  roundedCloudContour(ctx,w,h,random,stratus);
  ctx.fillStyle=colors[2];ctx.fill();
  ctx.restore();
  roundedCloudContour(ctx,w,h,randomSource(seed),stratus);
  const fill = ctx.createLinearGradient(0,h*.18,0,h*.89);
  fill.addColorStop(0,colors[0]);
  fill.addColorStop(.48,colors[1]);
  fill.addColorStop(.91,colors[2]);
  fill.addColorStop(1,colors[2]);
  ctx.fillStyle=fill;ctx.globalAlpha=wet ? .95 : .89;ctx.fill();
  ctx.save();ctx.clip();ctx.globalAlpha=1;

  const lowSun=clamp((sunY-26)/52,0,1);
  const edgeLight=ctx.createLinearGradient(sunFromLeft?0:w,0,sunFromLeft?w:0,0);
  edgeLight.addColorStop(0,colors[3]+'9e');
  edgeLight.addColorStop(.43,colors[0]+'34');
  edgeLight.addColorStop(1,colors[0]+'00');
  ctx.globalAlpha=(phase==='night' ? .08 : wet ? .17 : .29)*(1+lowSun*.30);
  ctx.fillStyle=edgeLight;ctx.fillRect(0,0,w,h);

  // Directional warm light catches the turret tops. Multiple irregular
  // highlights, clipped inside the silhouette, give painted cloud volume.
  for(let i=0;i<8;i++){
    const x=w*(.09+random()*.83),y=h*(.16+lowSun*.16+random()*.32);
    const radius=w*(.07+random()*.08);
    const gradient=ctx.createRadialGradient(x-radius*.24,y-radius*.2,0,x,y,radius);
    gradient.addColorStop(0, colors[3]+'dd');
    gradient.addColorStop(.40, colors[0]+'a2');
    gradient.addColorStop(1, colors[0]+'00');
    ctx.globalAlpha=stratus ? .34 : .64;
    ctx.fillStyle=gradient;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
  }

  // Fine hand-drawn gouache strokes and granulation; deterministic and
  // rendered to the sprite only once, never scattered per animation frame.
  for(let i=0;i<125;i++){
    const x=random()*w,y=(.18+random()*.70)*h;
    const length=3+random()*18;
    ctx.globalAlpha=.025+random()*(wet ? .09 : .065);
    ctx.strokeStyle=i%3===0?colors[2]:colors[3];
    ctx.lineWidth=.45+random()*1.4;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(x,y);
    ctx.quadraticCurveTo(x+length*.46,y+(random()-.5)*4,x+length,y+(random()-.5)*5);
    ctx.stroke();
  }
  ctx.globalAlpha=.15;
  const lower = ctx.createLinearGradient(0,h*.68,0,h*.88);
  lower.addColorStop(0,colors[2]+'00');lower.addColorStop(.8,colors[2]+'bb');lower.addColorStop(1,colors[2]+'00');
  ctx.fillStyle=lower;ctx.fillRect(0,h*.65,w,h*.26);
  ctx.restore();
  ctx.globalAlpha=1;
}

function paintCirrus(canvas, colors, seed, phase) {
  const ctx=canvas.getContext('2d');
  if(!ctx) return;
  const w=canvas.width,h=canvas.height,random=randomSource(seed);
  ctx.clearRect(0,0,w,h);
  for(let i=0;i<32;i++){
    const x=(random()-.12)*w,y=(.1+random()*.76)*h;
    const length=w*(.25+random()*.45);
    ctx.lineWidth=.4+random()*2.4;
    ctx.strokeStyle=colors[i%4===0?2:0];
    ctx.globalAlpha=.018+random()*(phase==='night'?.075:.125);
    ctx.beginPath();ctx.moveTo(x,y);
    ctx.bezierCurveTo(x+length*.33,y-5-random()*15,x+length*.61,y+6+random()*9,x+length,y-13-random()*11);
    ctx.stroke();
  }
  ctx.globalAlpha=1;
}

const CLOUD_COUNT=20;
function cloudSpecs(){
  const random=randomSource(0x94bb18);
  const clouds=[];
  for(let i=0;i<CLOUD_COUNT;i++){
    const layer=i%5===0?0:i%4===0?2:1;
    clouds.push({
      index:i,layer,seed:Math.floor(random()*0xffffffff),
      x:random()*1.5-.22,
      y:layer===0?-.10+random()*.30:layer===2?.13+random()*.30:-.11+random()*.32,
      scale:layer===0?.9+random()*.3:layer===2?.85+random()*.55:.4+random()*.45,
      opacity:.65+random()*.35,
      speed:(layer===0?.00062:layer===1?.00044:.00028)*(random()>.5?1:-1),
    });
  }
  return clouds.sort((a,b)=>a.layer-b.layer);
}

/**
 * Attach to a decorative <canvas> on the horizon stage.
 * `update` accepts the live or simulated weather; all numeric values are
 * clamped. No location-specific data is used by this purely artistic layer.
 */
export function createCloudSystem(canvas, frame) {
  if(!canvas || !frame) return {update(){},destroy(){}};
  const context=canvas.getContext('2d',{alpha:true});
  if(!context) return {update(){},destroy(){}};
  const specs=cloudSpecs();
  const sprites=new Map();
  let width=0,height=0,pxRatio=1;
  let current={weather:'clear',cover:20,wind:12,phase:'day',sunX:74,sunY:25};
  let running=true,visible=true,lastFrame=0,elapsed=0,raf=0;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const io=typeof IntersectionObserver==='function'
    ?new IntersectionObserver(([entry])=>{visible=entry.isIntersecting; if(visible) start();}, {threshold:.02})
    :null;
  io?.observe(frame);
  const resize=typeof ResizeObserver==='function'
    ?new ResizeObserver(()=>{measure();draw();})
    :null;
  resize?.observe(frame);
  function measure(){
    const box=frame.getBoundingClientRect();
    width=Math.max(1,Math.round(box.width));height=Math.max(1,Math.round(box.height));
    pxRatio=Math.min(1.6,window.devicePixelRatio||1);
    canvas.width=Math.round(width*pxRatio);canvas.height=Math.round(height*pxRatio);
    context.setTransform(pxRatio,0,0,pxRatio,0,0);
  }
  function getSprite(spec){
    const sunFromLeft=current.sunX<50;
    const lightAngle=Math.floor(current.sunY/20);
    const key=[spec.index,current.weather,current.phase,sunFromLeft?'L':'R',lightAngle].join('|');
    if(sprites.has(key))return sprites.get(key);
    const image=document.createElement('canvas');
    image.width=spec.layer===0?440:400;
    image.height=spec.layer===0?124:174;
    const colors=palette(current.phase,current.weather);
    if(spec.layer===0)paintCirrus(image,colors,spec.seed,current.phase);
    else paintCumulus(image,colors,spec.seed,current.phase,current.weather,spec.layer===2,sunFromLeft,current.sunY);
    sprites.set(key,image);
    if(sprites.size>95)sprites.delete(sprites.keys().next().value);
    return image;
  }
  function draw(){
    if(!width)return;
    context.clearRect(0,0,width,height);
    const cover=clamp(current.cover,0,100);
    const raining=current.weather==='rain'||current.weather==='storm';
    const dense=current.weather==='overcast'||raining;
    const base=cover/100;
    if(current.weather==='overcast'){
      // Overcast is a continuous stratiform ceiling, not a collection of
      // disconnected round cumulus stickers. Its softly undulating lower edge
      // sits behind the transparent landscape, with painterly tonal bands.
      const night=current.phase==='night';
      const ceiling=context.createLinearGradient(0,0,0,height*.52);
      ceiling.addColorStop(0,night?'rgba(61,75,87,.88)':'rgba(108,125,135,.88)');
      ceiling.addColorStop(.55,night?'rgba(79,94,104,.75)':'rgba(163,179,185,.82)');
      ceiling.addColorStop(1,night?'rgba(101,116,128,0)':'rgba(205,209,204,0)');
      context.globalAlpha=clamp(.42+base*.57,0,1);
      context.fillStyle=ceiling;
      context.beginPath();context.moveTo(0,0);context.lineTo(width,0);
      for(let x=width;x>=0;x-=22){
        const wave=Math.sin(x/123+elapsed*.000025)*7+Math.sin(x/47+.8)*3;
        context.lineTo(x,height*.34+wave);
      }
      context.closePath();context.fill();context.globalAlpha=1;
    }
    const intensity=dense ? .54 : .20;
    const allowed=CLOUD_COUNT*(intensity+base*(1-intensity));
    const cloudSpan=width+340;
    const windMultiplier=.25+clamp(current.wind,0,80)/26;
    const darkness=raining ? 1 : current.weather==='fog' ? .62 : 1;
    for(const spec of specs){
      if(current.weather==='overcast' && spec.layer===1)continue;
      const revealed=clamp(allowed-(spec.index*.92),0,1);
      if(revealed<=0)continue;
      const sprite=getSprite(spec);
      const spriteWidth=width*(spec.layer===0 ? .46 : spec.layer===2 ? .53 : .43)*spec.scale;
      const spriteHeight=spriteWidth*(sprite.height/sprite.width);
      const x=((spec.x*cloudSpan+elapsed*spec.speed*windMultiplier)%cloudSpan+cloudSpan)%cloudSpan-170;
      const y=height*spec.y-(spec.layer===2 ? 3 : 0);
      const amount=(spec.layer===0 ? .40 : spec.layer===1 ? .76 : .86);
      context.globalAlpha=clamp((.18+base*.95)*amount*spec.opacity*revealed*darkness*(current.weather==='overcast'?.58:1),0,.95);
      context.drawImage(sprite,x,y,spriteWidth,spriteHeight);
      if(x+spriteWidth>width+3)context.drawImage(sprite,x-cloudSpan,y,spriteWidth,spriteHeight);
      if(x<0 && x+spriteWidth<15)context.drawImage(sprite,x+cloudSpan,y,spriteWidth,spriteHeight);
    }
    context.globalAlpha=1;
  }
  function animate(timestamp){
    if(!running||!visible||document.hidden)return;
    raf=window.requestAnimationFrame(animate);
    if(timestamp-lastFrame<48)return;
    elapsed+=Math.min(70,timestamp-lastFrame||48);
    lastFrame=timestamp;
    draw();
  }
  function start(){
    if(!running)return;
    window.cancelAnimationFrame(raf);
    raf=0;lastFrame=0;
    draw();
    if(visible && !reduced.matches && !document.hidden)raf=window.requestAnimationFrame(animate);
  }
  function onVisibility(){if(!document.hidden)start();}
  function onMotion(){start();}
  document.addEventListener('visibilitychange',onVisibility);
  reduced.addEventListener?.('change',onMotion);
  measure();start();
  return {
    update(state={}){
      const next={...current,...state};
      next.cover=clamp(Number(next.cover)||0,0,100);
      next.wind=clamp(Number(next.wind)||0,0,80);
      next.sunX=clamp(Number(next.sunX)||50,0,100);
      next.sunY=clamp(Number(next.sunY)||30,0,100);
      if(next.weather!==current.weather||next.phase!==current.phase||
        (next.sunX<50)!==(current.sunX<50)||Math.floor(next.sunY/20)!==Math.floor(current.sunY/20))sprites.clear();
      current=next;
      start();
    },
    destroy(){
      running=false;window.cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange',onVisibility);
      reduced.removeEventListener?.('change',onMotion);
      io?.disconnect();resize?.disconnect();sprites.clear();
    },
  };
}
