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
    onVote:direction=>events.push(direction),
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

test('left and right swipes navigate, up and down vote only while fitted',()=>{
  const f=fixture();
  f.stroke([350,400],[85,415]);
  f.stroke([60,400],[325,405]);
  f.stroke([170,530],[170,280]);
  f.stroke([170,280],[170,530]);
  assert.deepEqual(f.events.filter(x=>['next','prev','up','down'].includes(x)),['next','prev','up','down']);
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

test('two fingers do not trigger accidental swipe or vote',()=>{
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
