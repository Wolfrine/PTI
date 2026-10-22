import test from 'node:test';
import assert from 'node:assert/strict';
import { createDriftGestures } from '../drift-gestures.mjs';

function fixture() {
  const handlers = {};
  const classes = new Set();
  let currentTime = 1000;
  let active = true;
  const pending = new Map();
  let nextTimer = 0;
  const stage = {
    clientWidth: 390, clientHeight: 844,
    getBoundingClientRect: () => ({left: 0, top: 0, width: 390, height: 844}),
    classList: {
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      contains: name => classes.has(name),
      toggle: (name, add) => add ? classes.add(name) : classes.delete(name)
    },
    setPointerCapture: () => {},
    addEventListener: (name, cb) => { handlers[name] = cb; },
    removeEventListener: name => { delete handlers[name]; }
  };
  const previousWindow = globalThis.window;
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    visualViewport: null
  };
  const image = {naturalWidth: 4800,naturalHeight:3000, complete:true, style:{transform:''},addEventListener:()=>{}};
  const events=[];
  const gestures=createDriftGestures({
    stage,
    getImage:()=>image,
    isActive:()=>active,
    onNext:()=>events.push('next'),
    onPrev:()=>events.push('prev'),
    onHoldStart:point=>events.push({type:'hold-start',...point}),
    onHoldProgress:detail=>events.push({type:'hold-progress',...detail}),
    onHoldEnd:detail=>events.push({type:'hold-end',...detail}),
    onHoldCancel:()=>events.push({type:'hold-cancel'}),
    onTap:()=>events.push('tap'),
    onState:state=>events.push(state.zoomed ? 'zoomed' : state.touching ? 'touching' : 'fit'),
    now:()=>currentTime,
    setDelay:(fn,ms)=>{const n=++nextTimer;pending.set(n,{fn,at:currentTime+ms});return n;},
    cancelDelay:n=>pending.delete(n)
  });
  const fire=(name,x,y,id=1,target=null)=>handlers[name]?.({
    clientX:x,clientY:y,pointerId:id,pointerType:'touch',button:0,target:target||{closest:()=>false}
  });
  const tick=ms=>{
    currentTime+=ms;
    for (const [id,t] of [...pending]){
      if (t.at<=currentTime) {pending.delete(id);t.fn();}
    }
  };
  const stroke=(start,end,duration=150)=> {
    fire('pointerdown',...start);
    tick(duration/2);
    if(start[0]!==end[0]||start[1]!==end[1])fire('pointermove',...end);
    tick(duration/2);
    fire('pointerup',...end);
  };
  const tap=(x=180,y=420)=>{stroke([x,y],[x,y],70);tick(70);};
  const doubleTap=(x=180,y=420)=>{tap(x,y);tap(x,y);};
  return {gestures,image,events,fire,tick,stroke,tap,doubleTap,classes,setActive:value=>{active=value},destroy:()=>{gestures.destroy();globalThis.window=previousWindow;}};
}

test('media starts fully fitted, no foreground crop, no zoomed class',()=>{
  const f=fixture();
  assert.equal(f.gestures.getState().scale,1);
  assert.match(f.image.style.transform,/scale\(1\)/);
  assert.equal(f.classes.has('velum-inspecting'),false);
  f.destroy();
});

test('left and right swipes navigate; vertical swipes never like or dislike',()=>{
  const f=fixture();
  f.stroke([350,400],[85,415]);
  f.stroke([60,400],[325,405]);
  f.stroke([170,530],[170,280]);
  f.stroke([170,280],[170,530]);
  assert.deepEqual(f.events.filter(x=>typeof x === 'string' && ['next','prev','up','down'].includes(x)),['next','prev']);
  assert.equal(f.events.filter(x=>x?.type==='hold-end').length,0);
  f.destroy();
});

test('double-tap enters zoom, double-tap again always restores fit',()=>{
  const f=fixture();
  f.doubleTap(110,380);
  assert.ok(f.gestures.getState().scale>2);
  assert.equal(f.classes.has('velum-inspecting'),true);
  f.tick(350);
  f.doubleTap(110,380);
  assert.equal(f.gestures.getState().scale,1);
  assert.equal(f.classes.has('velum-inspecting'),false);
  f.destroy();
});

test('double-tap hold slide up zooms deeply using one finger',()=>{
  const f=fixture();
  f.tap(180,440);
  f.fire('pointerdown',180,440);
  f.tick(70);
  f.fire('pointermove',180,45);
  assert.ok(f.gestures.getState().scale>5);
  f.fire('pointerup',180,45);
  assert.ok(f.gestures.getState().scale<=f.gestures.getState().maxScale);
  f.destroy();
});

test('zoomed image supports single-finger slide-down zoom out to full fit',()=>{
  const f=fixture();
  f.doubleTap();
  assert.ok(f.gestures.getState().scale>2);
  f.tick(370);
  f.tap();
  f.fire('pointerdown',180,420);
  f.fire('pointermove',180,800);
  f.fire('pointerup',180,800);
  assert.equal(f.gestures.getState().scale,1);
  f.destroy();
});

test('drag when zoomed pans; never votes or changes image',()=>{
  const f=fixture();
  f.doubleTap();
  f.tick(400);
  f.stroke([220,460],[100,590]);
  assert.ok(f.gestures.getState().scale>1);
  assert.deepEqual(f.events.filter(x=>['next','prev','up','down'].includes(x)),[]);
  f.destroy();
});

test('single tap reveals controls after double-tap detection window',()=>{
  const f=fixture();
  f.tap();
  assert.equal(f.events.includes('tap'),false);
  f.tick(400);
  assert.equal(f.events.filter(x=>x==='tap').length,1);
  f.destroy();
});

test('double-tap cancels delayed single-tap action',()=>{
  const f=fixture();
  f.doubleTap();
  f.tick(400);
  assert.equal(f.events.filter(x=>x==='tap').length,0);
  f.destroy();
});

test('interactive controls and inactive modes do not navigate',()=>{
  const f=fixture();
  f.fire('pointerdown',350,400,1,{closest:()=>true});
  f.fire('pointerup',70,400);
  f.setActive(false);
  f.stroke([350,400],[60,400]);
  assert.deepEqual(f.events.filter(x=>['next','prev','up','down'].includes(x)),[]);
  f.destroy();
});

test('two fingers do not trigger accidental swipe or affection',()=>{
  const f=fixture();
  f.fire('pointerdown',100,200,1);
  f.fire('pointerdown',140,200,2);
  f.fire('pointermove',100,550,1);
  f.fire('pointerup',100,550,1);
  f.fire('pointerup',140,200,2);
  assert.deepEqual(f.events.filter(x=>['next','prev','up','down'].includes(x)),[]);
  f.destroy();
});

test('reset after media change preserves full fit and no pending taps',()=>{
  const f=fixture();
  f.doubleTap();
  f.gestures.reset();
  assert.equal(f.gestures.getState().scale,1);
  f.tick(600);
  assert.equal(f.events.filter(x=>x==='tap').length,0);
  f.destroy();
});


test('stationary first hold starts at 450 ms, intensity grows to level 5, releases exactly one affection',()=>{
  const f=fixture();
  f.fire('pointerdown',186,417);
  f.tick(449);
  assert.equal(f.events.filter(x=>x?.type==='hold-start').length,0);
  f.tick(1);
  assert.equal(f.events.filter(x=>x?.type==='hold-start').length,1);
  f.tick(2700);
  f.fire('pointerup',186,417);
  const reactions=f.events.filter(x=>x?.type==='hold-end');
  assert.equal(reactions.length,1);
  assert.equal(reactions[0].level,5);
  assert.ok(reactions[0].durationMs>=3000);
  assert.deepEqual(f.events.filter(x=>['next','prev','tap'].includes(x)),[]);
  f.destroy();
});

test('short tap and swipe never produce affection',()=>{
  const f=fixture();
  f.tap();
  f.stroke([345,400],[70,400]);
  f.tick(700);
  assert.equal(f.events.filter(x=>x?.type==='hold-end').length,0);
  assert.deepEqual(f.events.filter(x=>x==='next'),['next']);
  f.destroy();
});

test('movement before threshold cancels hold yet keeps horizontal navigation',()=>{
  const f=fixture();
  f.fire('pointerdown',330,400);
  f.tick(220);
  f.fire('pointermove',100,410);
  f.tick(500);
  f.fire('pointerup',100,410);
  assert.equal(f.events.filter(x=>x?.type==='hold-start').length,0);
  assert.equal(f.events.filter(x=>x?.type==='hold-end').length,0);
  assert.deepEqual(f.events.filter(x=>x==='next'),['next']);
  f.destroy();
});

test('moving after hold begins cancels it without an accidental navigation or reaction',()=>{
  const f=fixture();
  f.fire('pointerdown',330,400);
  f.tick(500);
  f.fire('pointermove',60,410);
  f.fire('pointerup',60,410);
  assert.equal(f.events.filter(x=>x?.type==='hold-start').length,1);
  assert.equal(f.events.filter(x=>x?.type==='hold-cancel').length,1);
  assert.equal(f.events.filter(x=>x?.type==='hold-end').length,0);
  assert.equal(f.events.filter(x=>x==='next').length,0);
  f.destroy();
});

test('the second held tap of a double-tap is reserved for slide zoom, not hearts',()=>{
  const f=fixture();
  f.tap(180,440);
  f.fire('pointerdown',180,440);
  f.tick(550);
  f.fire('pointermove',180,100);
  f.fire('pointerup',180,100);
  assert.ok(f.gestures.getState().scale>1);
  assert.equal(f.events.filter(x=>x?.type==='hold-start'||x?.type==='hold-end').length,0);
  f.destroy();
});

test('holding also works on a zoomed image; moving pans instead',()=>{
  const f=fixture();
  f.doubleTap(180,440);
  f.tick(370);
  f.fire('pointerdown',180,440);
  f.tick(720);
  f.fire('pointerup',180,440);
  assert.equal(f.events.filter(x=>x?.type==='hold-end').length,1);
  assert.ok(f.gestures.getState().scale>1);
  f.stroke([210,470],[90,550]);
  assert.equal(f.events.filter(x=>x==='prev'||x==='next').length,0);
  f.destroy();
});

test('repeated holds on same media are separate deliberate gestures',()=>{
  const f=fixture();
  for(let i=0;i<2;i++){
    f.fire('pointerdown',170,420);
    f.tick(850);
    f.fire('pointerup',170,420);
    f.tick(400);
  }
  assert.equal(f.events.filter(x=>x?.type==='hold-end').length,2);
  f.destroy();
});

test('pointer cancellation and media reset never record a reaction',()=>{
  const f=fixture();
  f.fire('pointerdown',180,420);
  f.tick(550);
  f.fire('pointercancel',180,420);
  f.fire('pointerdown',180,420);
  f.tick(500);
  f.gestures.reset();
  f.tick(1400);
  assert.equal(f.events.filter(x=>x?.type==='hold-end').length,0);
  assert.equal(f.events.filter(x=>x?.type==='hold-cancel').length,2);
  f.destroy();
});
