import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../pinsim/three.module.min.js';
import { CoffeeScene } from './scene.js';
import { HOPPER_GEOMETRY as G, getHopperState, getBeanPose } from './bean-hopper.mjs';

const scene = Object.create(CoffeeScene.prototype);
scene.machine = new THREE.Group();
scene.makeMaterials();scene.makeHopper();
const matrix = new THREE.Matrix4();
const matrixAt = (mesh,index) => { mesh.getMatrixAt(index,matrix);return matrix.clone(); };
const close = (actual,expected,tolerance=1e-6) => assert.ok(Math.abs(actual-expected)<tolerance,`${actual} ≈ ${expected}`);
const pose = state => { scene.updateHopper(state);scene.machine.updateMatrixWorld(true); };
const snapshot = () => ({
  count:scene.beans.count,position:scene.hopper.position.toArray(),rotation:scene.hopper.rotation.toArray(),
  beans:Array.from({length:scene.beans.count},(_,i)=>matrixAt(scene.beans,i).elements),
  grooves:Array.from({length:scene.beanGrooves.count},(_,i)=>matrixAt(scene.beanGrooves,i).elements),
});

function beanBounds(index) {
  const transform=matrixAt(scene.beans,index),e=transform.elements;
  const centre=new THREE.Vector3().setFromMatrixPosition(transform);
  // Exact support distances of the scaled sphere, avoiding rotated-AABB excess.
  const radius=new THREE.Vector3(...[0,1,2].map(axis=>.068*Math.hypot(e[axis],e[axis+4],e[axis+8])));
  return {centre,min:centre.clone().sub(radius),max:centre.clone().add(radius)};
}

test('persistent bean level lowers the pile and removes full-sized beans and matching grooves', () => {
  let previous=G.capacity;
  for(let step=100;step>=0;step--){
    const beanLevel=step/100;
    pose({beanLevel,time:0});
    assert.equal(scene.beans.count,Math.ceil(beanLevel*G.capacity));
    assert.equal(scene.beanGrooves.count,scene.beans.count);
    assert.ok(scene.beans.count<=previous);previous=scene.beans.count;
    for(let index=0;index<scene.beans.count;index++){
      const scale=new THREE.Vector3(),q=new THREE.Quaternion(),p=new THREE.Vector3();
      matrixAt(scene.beans,index).decompose(p,q,scale);
      G.beanScale.forEach((size,axis)=>close(scale.getComponent(axis),size));
      const groovePosition=new THREE.Vector3().setFromMatrixPosition(matrixAt(scene.beanGrooves,index));
      assert.ok(p.distanceTo(groovePosition)<1e-6,'seam follows the same bean');
    }
  }
  pose({beanLevel:1});const fullTop=Math.max(...Array.from({length:scene.beans.count},(_,i)=>beanBounds(i).max.y));
  pose({beanLevel:.25});const quarterTop=Math.max(...Array.from({length:scene.beans.count},(_,i)=>beanBounds(i).max.y));
  assert.equal(scene.beans.count,37,'five 9 g doses leave 15 g of a 60 g supply');
  assert.ok(fullTop-quarterTop>.10,'a quarter-full hopper has a visibly lower surface');
  pose({beanLevel:0});
  assert.equal(scene.beans.visible,false);assert.equal(scene.beanGrooves.visible,false);
});

test('beans stay inside the hopper and descend only through the grinder opening', () => {
  for(let step=1;step<=250;step++){
    const beanLevel=step/250;
    pose({beanLevel,time:step*.037,grind:true,phaseProgress:.5});
    for(let index=0;index<scene.beans.count;index++){
      const b=beanBounds(index);
      assert.ok(b.min.x>-1.10&&b.max.x<1.10,'bean clears both side walls');
      assert.ok(b.min.z>-.79&&b.max.z<.79,'bean clears the front and rear walls');
      assert.ok(b.max.y<.20,'bean stays below the lid');
      if(b.min.y<-.20){
        assert.ok(Math.hypot(b.centre.x-G.inlet[0],b.centre.z-G.inlet[2])<.035,
          'only beans aligned with the outlet may cross the hopper floor');
      }
    }
  }
});

test('each consumed bean reaches the inlet before removal and surviving beans do not jump', () => {
  for(let remaining=1;remaining<G.capacity;remaining++){
    const before=getHopperState({beanLevel:(remaining+1e-7)/G.capacity});
    const after=getHopperState({beanLevel:(remaining-1e-7)/G.capacity});
    assert.equal(before.count,remaining+1);assert.equal(after.count,remaining);
    const consumed=getBeanPose(remaining,before);
    consumed.position.forEach((value,axis)=>close(value,G.inlet[axis],1e-5));
    for(let index=0;index<remaining;index++){
      const a=getBeanPose(index,before),b=getBeanPose(index,after);
      a.position.forEach((value,axis)=>close(value,b.position[axis],1e-5));
      a.rotation.forEach((value,axis)=>close(value,b.rotation[axis],1e-5));
    }
  }
});

test('only the hopper vibrates during grinding; paused samples and idle stock remain stable', () => {
  const state={beanLevel:.67,time:3.35,grind:true,phaseProgress:.5};
  pose(state);const first=snapshot();
  for(let frame=0;frame<10;frame++)pose({...state});
  assert.deepEqual(snapshot(),first,'a paused simulation has no wall-clock animation');
  pose({...state,time:3.36});assert.notDeepEqual(snapshot().position,first.position);
  assert.deepEqual(scene.machine.position.toArray(),[0,0,0],'the machine is not shaken');
  assert.deepEqual(scene.beanThroat.position.toArray(),[.10,3.76,-.47],'the fixed inlet remains attached to the grinder');
  pose({...state,grind:false});const idle=snapshot();
  pose({...state,time:100,grind:false});assert.deepEqual(snapshot(),idle);
  assert.deepEqual(scene.hopper.position.toArray(),G.origin);
  pose({...state,resourceEmpty:true});assert.deepEqual(snapshot(),idle,'empty stock stops vibration');
});

test('full reset reproduces the initial geometry exactly and legacy samples default to full stock', () => {
  pose({});const initial=snapshot();
  pose({beanLevel:.25,time:3,grind:true,phaseProgress:.5});
  pose({beanLevel:0,time:7,resourceEmpty:true});
  pose({beanLevel:1,time:0,grind:true,phaseProgress:0});
  assert.deepEqual(snapshot(),initial);
  pose({time:90,grind:false});assert.deepEqual(snapshot(),initial);
});
