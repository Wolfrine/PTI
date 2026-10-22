import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeartEffects } from '../heart-effects.mjs';

function fixture({reducedMotion=false}={}) {
  const previousDocument=globalThis.document;
  class MockElement {
    constructor(tag='span') {
      this.tag=tag;
      this.children=[];
      this.parent=null;
      this.className='';
      this.innerHTML='';
      this.textContent='';
      this.css={};
      this.style={setProperty:(key,value)=>{this.css[key]=String(value);}};
    }
    setAttribute(){}
    appendChild(node){node.parent=this;this.children.push(node);return node;}
    querySelectorAll(selector){return this.children.filter(el=>'.'+el.className===selector);}
    addEventListener(){}
    remove(){if(this.parent){const i=this.parent.children.indexOf(this);if(i>=0)this.parent.children.splice(i,1);this.parent=null;}}
    replaceChildren(){this.children.forEach(n=>n.parent=null);this.children=[];}
  }
  globalThis.document={createElement:tag=>new MockElement(tag)};
  const field=new MockElement('div');
  const stage={getBoundingClientRect:()=>({left:0,top:0,width:390,height:844})};
  const effects=createHeartEffects({stage,field,random:()=>0.95,reducedMotion});
  return {
    effects,field,
    particles:()=>field.querySelectorAll('.heart-particle'),
    core:()=>field.querySelectorAll('.heart-core')[0],
    restore:()=>{effects.reset();globalThis.document=previousDocument;}
  };
}

test('a hold starts with an unnumbered heart, never a 1/5 counter',()=>{
  const v=fixture();
  v.effects.start({x:160,y:410});
  assert.ok(v.core());
  assert.match(v.core().innerHTML,/heart-mark/);
  assert.doesNotMatch(v.core().innerHTML,/heart-level|1\/5|5\/5/);
  v.restore();
});

test('heart particles grow smoothly toward ~60-70px, without getting larger after eight seconds',()=>{
  const v=fixture();
  v.effects.start({x:160,y:410});
  v.effects.progress({x:160,y:410,durationMs:450});
  const early=parseInt(v.particles().at(-1).css['--heart-size'],10);
  v.effects.progress({x:160,y:410,durationMs:5000});
  const middle=parseInt(v.particles().at(-1).css['--heart-size'],10);
  v.effects.progress({x:160,y:410,durationMs:8000});
  const mature=parseInt(v.particles().at(-1).css['--heart-size'],10);
  v.effects.progress({x:160,y:410,durationMs:16000});
  const later=parseInt(v.particles().at(-1).css['--heart-size'],10);
  assert.ok(early<middle);
  assert.ok(middle<mature);
  assert.ok(mature>=60 && mature<=65);
  assert.equal(mature,later);
  assert.equal(v.core().css['--heart-core-size'],'56px');
  v.restore();
});

test('long holds keep streaming but retain a bounded live particle count',()=>{
  const v=fixture();
  v.effects.start({x:150,y:420});
  for(let ms=450;ms<=60000;ms+=200) v.effects.progress({x:150,y:420,durationMs:ms});
  assert.ok(v.particles().length>0);
  assert.ok(v.particles().length<=28);
  assert.equal(v.core().css['--heart-core-size'],'56px');
  v.effects.finish({x:150,y:420,durationMs:60000});
  assert.equal(v.core(),undefined);
  assert.ok(v.particles().length<=28);
  v.restore();
});

test('reduced motion keeps stationary visual affirmation without floating particles',()=>{
  const v=fixture({reducedMotion:true});
  v.effects.start({x:150,y:420});
  v.effects.progress({x:150,y:420,durationMs:9000});
  assert.ok(v.core());
  assert.equal(v.particles().length,0);
  v.effects.finish({x:150,y:420,durationMs:9000});
  assert.equal(v.field.children.length,0);
  v.restore();
});
