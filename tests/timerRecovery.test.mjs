import test from 'node:test';
import assert from 'node:assert/strict';
import {createTimerController} from '../src/timer/timerController.js';
import {readTimerSession,persistTimerSession} from '../src/timer/timerPersistence.js';
function harness(saved) {
 let clock=100000, persisted, sound=0;
 const media={pause(){},restore(){},reset(){},destroy(){},finish(){},milk(){},unlock(){},resume(){},start(){}};
 const audio={reset(){},unlock(){},playAlmost(){},playFinished(){sound++;return Promise.resolve()},destroy(){}};
 const timer=createTimerController({media,audio,now:()=>clock,onPersist:s=>persisted=s,
 scheduler:{setInterval:()=>1,clearInterval(){}},documentRef:null,navigatorRef:null});
 if(saved) timer.restore(saved);
 return {timer,setClock:v=>clock=v,get persisted(){return persisted},get sound(){return sound}};
}
test('running reload retains original deadline, including preload time',()=>{
 const h=harness({status:'running',total:60,remaining:60,deadline:140000});
 assert.equal(h.timer.state().remaining,40);
 h.setClock(110000);h.timer.tick();assert.equal(h.timer.state().remaining,30);
 assert.equal(h.persisted.deadline,140000);
});
test('paused reload stays paused and resume creates a new deadline',()=>{
 const h=harness({status:'paused',total:60,remaining:23,deadline:null});
 h.setClock(200000);h.timer.tick();assert.equal(h.timer.state().remaining,23);
 assert.equal(h.timer.state().running,false);
 h.timer.start();assert.equal(h.persisted.deadline,223000);
});
test('expired and finished recovery never replay an old alarm',()=>{
 for(const status of ['running','finished']){
 const h=harness({status,total:60,remaining:0,deadline:90000});
 assert.equal(h.timer.state().finished,true);assert.equal(h.sound,0);
 }
});
test('reset clears persisted session and destroy does not persist a false pause',()=>{
 const h=harness({status:'running',total:60,remaining:60,deadline:140000});
 h.timer.destroy();assert.equal(h.persisted.running,true);
 const other=harness({status:'paused',total:60,remaining:20});other.timer.reset();
 let item='old'; const storage={getItem:()=>item,setItem:(_,v)=>item=v,removeItem:()=>item=null};
 persistTimerSession(storage,'test',other.persisted);assert.equal(item,null);
});
test('corrupt or unavailable storage cannot break timer recovery',()=>{
 for(const raw of ['bad','{}','null',JSON.stringify({version:1,status:'running',total:60,remaining:60,deadline:'bad'})])
 assert.equal(readTimerSession({getItem:()=>raw},'x'),null);
 assert.doesNotThrow(()=>persistTimerSession({getItem(){throw Error()}},'x',{running:true,total:60,remaining:60}));
});
