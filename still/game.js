(function(){
  'use strict';
  const P=StillPhysics,$=id=>document.getElementById(id),SIZE={x:1000,y:600},COUNT=28,SAVE_KEY='still-plane-v1';
  const pageTitle=document.title;
  const player={x:0,y:0},keys=new Set(),touches=new Map();
  let rocks=[],elapsed=0,collisionAt=Infinity,predictionAt=0,threat=null,plan=null,planAt=0;
  let ended=false,maneuver=null,dialog=null,focusBefore=null,generation=0,heading=0;
  let phase=0,lastNow=Date.now(),lastSave=0,lastUI=0,lastFrame=0;
  let watchLeft=Infinity,alertCount=0,lastExecutedPlan=null,storageOK=true;
  let aliveElapsed=0;
  let uiKey=null,uiPlan=null;
  let avoidanceSearch=null;
  const board=new FlightBoard({preview:value=>{setPhase(value);renderUI();}});
  const idOf=rock=>rock?'AST-'+String(rock.id+1).padStart(2,'0'):'—';
  const set=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
  function rng(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
  function forecast(replan=true){
    const before=threat,previousImpact=collisionAt,result=P.predict(player,rocks,SIZE);
    threat=result.asteroid;collisionAt=elapsed+result.time;predictionAt=elapsed;
    if(before!==threat||Math.abs(previousImpact-collisionAt)>.01)watchLeft=timeLeft();
    if(before!==threat){phase=0;board.selected=threat?.id??null;}
    if(replan){
      avoidanceSearch=threat&&!ended?P.createAvoidanceSearch(player,rocks,SIZE):null;
      const result=avoidanceSearch?.step(30);plan=result?.plan||null;planAt=elapsed;
      if(result?.done)avoidanceSearch=null;
    }
  }
  function reset(){
    board.resetDistance();
    generation++;rocks=[];player.x=player.y=0;elapsed=0;aliveElapsed=0;ended=false;maneuver=null;plan=null;avoidanceSearch=null;threat=null;heading=0;
    lastExecutedPlan=null;watchLeft=Infinity;alertCount=0;clearInput();setPhase(0);closeDialog();
    const random=rng(generation===1?538171:Date.now()>>>0);
    // Independently sampled, non-homing rocks. Reject rushed starting fields.
    for(let attempt=0;attempt<200;attempt++){
      rocks=Array.from({length:COUNT},(_,id)=>{
        const angle=random()*Math.PI*2,speed=.011+random()*.014;
        return {id,position:{x:(random()-.5)*SIZE.x,y:(random()-.5)*SIZE.y},velocity:{x:Math.cos(angle)*speed,y:Math.sin(angle)*speed},radius:4+random()*4};
      });
      const next=P.predict(player,rocks,SIZE);
      if(next.time>=6*3600&&next.time<4*86400)break;
      if(attempt===199){
        // Scaling all velocities preserves the sampled paths and sets a calm pace.
        if(Number.isFinite(next.time)&&next.time>0){const factor=next.time/86400;for(const r of rocks){r.velocity.x*=factor;r.velocity.y*=factor;}}
      }
    }
    forecast();lastNow=Date.now();renderUI();saveRun();
  }
  function timeLeft(){return Math.max(0,collisionAt-elapsed);}
  function aliveSeconds(){return Math.floor(aliveElapsed);}
  function aliveTimespan(){
    const seconds=aliveSeconds();
    const units=[[Math.floor(seconds/86400),'d'],[Math.floor(seconds/3600)%24,'h'],[Math.floor(seconds/60)%60,'m'],[seconds%60,'s']];
    const first=units.findIndex(([value],index)=>value>0||index===3);
    return units.slice(first).map(([value,unit],index)=>(index?String(value).padStart(2,'0'):String(value))+unit).join(' ');
  }
  function advanceRocks(dt){for(const rock of rocks)P.advancePosition(rock.position,rock.velocity,dt,SIZE);elapsed+=dt;aliveElapsed+=dt;}
  function impact(){
    ended=true;maneuver=null;plan=null;avoidanceSearch=null;collisionAt=elapsed;clearInput();setPhase(0);saveRun();audio.sync();openDialog('lost');
  }
  function advanceTravel(dt,velocity){
    let travel=dt,hit=false;
    for(const rock of rocks){const t=P.timeToWrappedImpact(player,rock,SIZE,dt,P.SHIP_RADIUS,velocity);if(t<=travel){travel=t;hit=true;}}
    if(travel>0&&(velocity.x||velocity.y))heading=Math.atan2(velocity.x,velocity.y);
    P.advancePosition(player,velocity,travel,SIZE);advanceRocks(travel);
    if(hit)impact();
    return travel;
  }
  function idle(dt){
    while(dt>1e-8&&!ended){
      let remaining=P.FORECAST_HORIZON-(elapsed-predictionAt);
      if(remaining<1e-5){forecast(false);remaining=P.FORECAST_HORIZON;}
      const hit=timeLeft(),amount=Math.min(dt,remaining,hit);
      advanceRocks(amount);dt-=amount;
      if(amount>=hit){impact();return;}
    }
    if(!ended&&!Number.isFinite(collisionAt)&&elapsed-predictionAt>3600)forecast();
  }
  function direction(){
    const d=new Set([...keys].map(k=>movementCodes.get(k)));for(const v of touches.values())d.add(v);
    const x=Number(d.has('right'))-Number(d.has('left')),y=Number(d.has('up'))-Number(d.has('down')),n=Math.hypot(x,y)||1;
    return {x:x/n*8,y:y/n*8};
  }
  function advance(){
    // Wall time includes device sleep, even when the performance clock stops.
    const now=Date.now();
    let dt=Math.max(0,(now-lastNow)/1000);lastNow=Math.max(lastNow,now);
    if(ended||!dt)return;
    let moved=false;
    if(maneuver){
      const used=advanceTravel(Math.min(dt,maneuver.remaining),maneuver.velocity);
      dt-=used;moved=true;
      if(maneuver){maneuver.remaining-=used;if(maneuver.remaining<1e-7)maneuver=null;}
    }
    const velocity=direction();
    if(dt>0&&!ended&&(velocity.x||velocity.y)){
      advanceTravel(dt,velocity);dt=0;moved=true;plan=null;phase=0;
    }
    if(moved&&!ended)forecast(!maneuver&&!velocity.x&&!velocity.y);
    if(dt>0&&!ended)idle(dt);
    if(!ended&&!maneuver&&!velocity.x&&!velocity.y){
      if(!plan&&!avoidanceSearch&&elapsed-planAt>3||plan&&(elapsed-planAt>1800||plan.nextImpact-(elapsed-planAt)-plan.duration<P.MIN_SAFE_TIME))forecast();
      if(avoidanceSearch){
        const result=avoidanceSearch.step(4);
        if(result.plan){plan=result.plan;planAt=elapsed;}
        if(result.done)avoidanceSearch=null;
      }
    }
    watch();
    if(performance.now()-lastSave>5000)saveRun();
  }
  function execute(){
    if(ended||maneuver||phase!==0)return false;
    advance();
    if(ended)return false;
    const proposal=plan?P.validateAvoidance(player,rocks,SIZE,plan.delta):null;
    if(!proposal){forecast();renderUI();return false;}
    clearInput();plan=proposal;planAt=elapsed;avoidanceSearch=null;
    maneuver={velocity:{...proposal.velocity},remaining:proposal.duration};
    lastExecutedPlan={delta:{...proposal.delta},duration:proposal.duration,before:timeLeft(),expected:proposal.nextImpact,startedAt:elapsed};
    setPhase(0);saveRun();renderUI();return true;
  }
  const audio={
    context:null,master:null,enabled:true,
    async start(){
      if(!this.enabled)return;
      try{
        if(!this.context){
          const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;
          this.context=new AudioContext();this.master=this.context.createGain();this.master.gain.value=.6;this.master.connect(this.context.destination);
          this.context.onstatechange=()=>this.sync();
        }
        if(this.context.state==='suspended')await this.context.resume();
        this.sync();
        return this.context.state==='running';
      }catch(_){/* Keep flight running when audio is unavailable. */}
    },
    sync(){
      if(this.master)this.master.gain.setTargetAtTime(ended||!this.enabled?0:.6,this.context.currentTime,.1);
      const ready=this.enabled&&this.context?.state==='running',status=this.enabled+'|'+ready;
      if(this.buttonStatus===status)return;
      this.buttonStatus=status;
      $('sound-button').setAttribute('aria-pressed',String(!!ready));
      $('sound-button').title=ready?'Mute sound alerts':this.enabled?'Click to unlock sound alerts':'Enable sound alerts';
    },
    toggle(){
      this.enabled=!(this.enabled&&this.context?.state==='running');
      try{localStorage.setItem('still-sound-enabled',String(this.enabled));}catch(_){/* The toggle still works without storage. */}
      if(this.enabled)this.start().then(ready=>{if(ready)this.advisory();});
      this.sync();
    },
    advisory(highOnly=false){
      if(!this.enabled||this.context?.state!=='running')return false;
      for(const [frequency,delay] of (highOnly?[[783.99,0]]:[[587.33,0],[783.99,.23]])){
        const osc=this.context.createOscillator(),gain=this.context.createGain(),start=this.context.currentTime+delay;
        osc.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.04,start+.04);gain.gain.exponentialRampToValueAtTime(.0001,start+.85);
        osc.connect(gain);gain.connect(this.master);osc.onended=()=>{osc.disconnect();gain.disconnect();};osc.start(start);osc.stop(start+.9);
      }
      return true;
    }
  };
  function watch(){
    const remaining=timeLeft(),previous=watchLeft;
    watchLeft=remaining;
    audio.sync();
    if(!threat||ended||maneuver||!Number.isFinite(previous)||remaining<=0)return;
    // Hourly, then minutely from T-1h, then a high note each second from T-1m.
    // Consume crossings even if audio is blocked; never queue missed reminders.
    const unit=previous>3600?3600:previous>60?60:1;
    const boundary=(Math.ceil(previous/unit)-1)*unit;
    if(boundary>0&&remaining<=boundary&&audio.advisory(remaining<=60))alertCount++;
  }
  function vectorName(delta){
    const angle=(Math.atan2(delta.y,delta.x)*180/Math.PI+360)%360;
    return ['right','up-right','up','up-left','left','down-left','down','down-right'][Math.round(angle/45)%8];
  }
  function tabCountdown(seconds){
    if(!Number.isFinite(seconds))return '>30d';
    const total=Math.max(0,Math.ceil(seconds));
    const units=[[Math.floor(total/86400),'d'],[Math.floor(total/3600)%24,'h'],[Math.floor(total/60)%60,'min'],[total%60,'sec']];
    const first=units.findIndex(([value])=>value>0);
    return units.slice(first<0?3:first,(first<0?3:first)+2).map(([value,label])=>value+label).join(' ');
  }
  function renderUI(){
    const t=timeLeft(),safe=!Number.isFinite(t);
    const key=[Math.ceil(t),Math.floor(elapsed),aliveSeconds(),ended,!!maneuver,!!avoidanceSearch,phase,keys.size,touches.size,storageOK,threat?.id,generation].join('|');
    if(key===uiKey&&plan===uiPlan)return;
    uiKey=key;uiPlan=plan;
    document.body.classList.toggle('flight-ended',ended);
    const aliveLabel=$('alive-label');
    if(aliveLabel.dataset.ended!==String(ended)){
      aliveLabel.dataset.ended=String(ended);
      aliveLabel.innerHTML=ended?'<span class="death-word">Dead</span> — but alive for':'Alive';
    }
    const alive=$('alive-seconds'),duration=aliveTimespan();
    if(alive.textContent!==duration||!alive.firstElementChild)alive.innerHTML=duration.replace(/[dhms]/g,unit=>'<span class="alive-unit">'+unit+'</span>');
    $('death-survival').hidden=!ended;
    if(ended)set('death-duration',duration);
    const total=ended||safe?0:Math.max(0,Math.ceil(t));
    const days=Math.floor(total/86400),hours=Math.floor(total/3600)%24;
    const countdownParts=[['timer-days',days,days===1?'day':'days'],['timer-hours',hours,hours===1?'hour':'hours'],['timer-minutes',Math.floor(total/60)%60,'min'],['timer-seconds',total%60,'sec']];
    const firstVisible=countdownParts.findIndex(([,value],index)=>value>0||index===3);
    for(const [index,[id,value,unit]] of countdownParts.entries()){
      $(id).hidden=safe&&!ended?index>0:index<firstVisible;
      if(safe&&!ended&&index===0)set(id,'>30 days');
      else if($(id).textContent!==value+' '+unit||!$(id).firstElementChild){
        $(id).innerHTML='<span class="timer-value">'+value+'</span> <span class="timer-unit">'+unit+'</span>';
      }
    }
    const tabTitle=(ended?'Impact':tabCountdown(t))+' · '+pageTitle;
    if(document.title!==tabTitle)document.title=tabTitle;
    $('timer').setAttribute('aria-label',ended?'Impact':safe?'No impact predicted in the next thirty days':countdownParts.map(([,value],i)=>value+' '+['days','hours','minutes','seconds'][i]).slice(firstVisible).join(' ')+' until impact if you stay here');
    set('timer-label',ended?'Impact':safe?'No predicted impact':'Impact in');
    set('threat-id',idOf(threat));
    if(!safe&&!ended){
      const date=new Date(Date.now()+t*1000);
      set('arrival-time',date.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+' local time');
    }else set('arrival-time',ended?'Flight ended':'Next 30 days clear');
    set('solution-instruction',maneuver?'Moving…':keys.size||touches.size?'Manual movement…':plan?'Suggested: '+(plan.distance/10).toFixed(2)+' km '+vectorName(plan.delta):safe?'No move needed':avoidanceSearch?'Searching for ≥4h clear…':ended?'Impact':'Checking escape routes…');
    set('clearance-value',plan?(plan.clearance/10).toFixed(2)+' km':'—');
    set('after-value',plan?P.briefTime(Math.max(0,plan.nextImpact-(elapsed-planAt)-(maneuver?.remaining??plan.duration))):'—');
    $('execute-button').disabled=phase!==0||!plan||ended||!!maneuver||keys.size>0||touches.size>0;
    $('execute-button').querySelector('strong').textContent=maneuver?'Moving…':'Take evasive action';
    document.body.classList.toggle('has-threat',!!threat&&!ended);
    set('live-tag',phase?'◇ Preview':maneuver?'↗ Moving':'● Live');
    const previewHorizon=safe?86400:t;
    $('preview-badge').hidden=phase===0;set('preview-offset','+'+P.briefTime(previewHorizon*phase));
    $('save-status').hidden=storageOK;
    if(!storageOK)set('save-status','Not saved · storage unavailable');
  }
  function setPhase(value){phase=Math.max(0,Math.min(1,value));}
  $('live-button').addEventListener('click',()=>{setPhase(0);renderUI();});
  $('locate-button').addEventListener('click',()=>{setPhase(0);board.trackNext();renderUI();});
  $('execute-button').addEventListener('click',execute);
  $('sound-button').addEventListener('click',()=>audio.toggle());
  function clearInput(){keys.clear();touches.clear();document.querySelectorAll('[data-direction]').forEach(b=>b.classList.remove('active'));}
  function manualStart(){if(maneuver){maneuver=null;forecast(false);}plan=null;avoidanceSearch=null;setPhase(0);}
  function openDialog(mode){
    if(ended&&mode!=='lost')return;
    if(!dialog)focusBefore=document.activeElement;
    advance();
    const held=keys.size||touches.size;clearInput();
    if(held&&!ended)forecast();
    // Help is an overlay; flight and an executing maneuver continue underneath.
    if(ended)mode='lost';
    dialog=mode;$('dialog-backdrop').hidden=false;$('help-content').hidden=mode!=='help';
    const contents={
      help:['STILL 2D','Controls','','Close'],
      lost:['Impact','Flight ended','You successfully intercepted the asteroid. Unfortunately, that was not the assignment.','Restart']
    }[mode];
    set('dialog-kicker',contents[0]);set('dialog-title',contents[1]);set('dialog-description',contents[2]);set('dialog-action',contents[3]);
    $('dialog-action').focus();renderUI();
  }
  function closeDialog(){
    dialog=null;$('dialog-backdrop').hidden=true;
    focusBefore?.focus?.({preventScroll:true});focusBefore=null;
  }
  $('help-button').addEventListener('click',()=>openDialog('help'));
  $('dialog-action').addEventListener('click',()=>{if(dialog==='lost')reset();else closeDialog();});
  $('dialog-backdrop').addEventListener('click',e=>{if(e.target===$('dialog-backdrop')&&!ended)closeDialog();});
  const movementCodes=new Map([['KeyW','up'],['ArrowUp','up'],['KeyS','down'],['ArrowDown','down'],['KeyA','left'],['ArrowLeft','left'],['KeyD','right'],['ArrowRight','right']]);
  function paintKeys(){
    const held=new Set([...keys].map(k=>movementCodes.get(k)));for(const v of touches.values())held.add(v);
    document.querySelectorAll('[data-direction]').forEach(b=>b.classList.toggle('active',held.has(b.dataset.direction)));
  }
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.code==='Tab'&&dialog){
      const focusable=[...$('game-dialog').querySelectorAll('button:not([hidden])')],first=focusable[0],last=focusable.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}return;
    }
    if(e.target.matches('input,textarea,select'))return;
    if(movementCodes.has(e.code)){e.preventDefault();if(!dialog&&!ended){advance();if(ended)return;manualStart();keys.add(e.code);paintKeys();}return;}
    if(e.repeat)return;
    if(e.code==='Space'&&e.target.closest('button,a'))return;
    if(e.code==='Space'){e.preventDefault();return;}
    if(e.code==='Escape'&&dialog==='help'){e.preventDefault();closeDialog();}
    if(e.code==='KeyH'&&!dialog)openDialog('help');
    if(e.code==='KeyL'&&!dialog){board.trackNext();setPhase(0);}
  });
  document.addEventListener('keyup',e=>{if(keys.has(e.code)){advance();keys.delete(e.code);if(!keys.size&&!touches.size&&!ended)forecast();paintKeys();}});
  document.querySelectorAll('[data-direction]').forEach(button=>{
    button.addEventListener('pointerdown',e=>{
      e.preventDefault();if(dialog||ended)return;advance();if(ended)return;manualStart();button.setPointerCapture(e.pointerId);touches.set(e.pointerId,button.dataset.direction);paintKeys();
    });
    const release=e=>{if(touches.has(e.pointerId)){advance();touches.delete(e.pointerId);if(!keys.size&&!touches.size&&!ended)forecast();paintKeys();}};
    button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
    button.addEventListener('contextmenu',e=>e.preventDefault());
  });
  function releaseFocus(){advance();const held=keys.size||touches.size;clearInput();if(held&&!ended)forecast();}
  window.addEventListener('blur',releaseFocus);
  window.addEventListener('focus',()=>advance());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseFocus();else advance();saveRun();});
  window.addEventListener('pagehide',()=>{releaseFocus();saveRun();});
  window.addEventListener('pageshow',()=>{advance();renderUI();saveRun();});
  function saveRun(){
    if(!rocks.length)return;
    try{
      localStorage.setItem(SAVE_KEY,JSON.stringify({version:1,savedAt:lastNow,elapsed,aliveElapsed,ended,player:{...player},rocks,maneuver,heading,distanceAnchor:board.distanceAnchor}));
      storageOK=true;lastSave=performance.now();
    }catch(_){storageOK=false;}
  }
  function restoreRun(){
    try{
      const saved=JSON.parse(localStorage.getItem(SAVE_KEY)),vector=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y);
      if(!saved||saved.version!==1||!Number.isFinite(saved.savedAt)||!Number.isFinite(saved.elapsed)||saved.elapsed<0||!vector(saved.player)||!Array.isArray(saved.rocks)||saved.rocks.length!==COUNT)return false;
      if(!saved.rocks.every(r=>vector(r.position)&&vector(r.velocity)&&P.length(r.velocity)<=1&&r.radius>=4&&r.radius<=8))return false;
      rocks=saved.rocks.map((r,id)=>({...r,id}));player.x=P.wrap(saved.player.x,SIZE.x);player.y=P.wrap(saved.player.y,SIZE.y);elapsed=saved.elapsed;generation++;
      // Older saves already record time survived in the current flight.
      aliveElapsed=Number.isFinite(saved.aliveElapsed)&&saved.aliveElapsed>=0?saved.aliveElapsed:saved.elapsed;
      heading=Number.isFinite(saved.heading)?P.wrap(saved.heading,Math.PI*2):0;
      lastNow=Date.now();
      forecast();
      board.restoreDistance(saved.distanceAnchor,snapshot());
      if(saved.maneuver&&vector(saved.maneuver.velocity)&&P.length(saved.maneuver.velocity)<=8.01&&saved.maneuver.remaining>0&&saved.maneuver.remaining<=Math.hypot(SIZE.x,SIZE.y)/16)maneuver=saved.maneuver;
      if(saved.ended){ended=true;collisionAt=elapsed;plan=null;openDialog('lost');}
      else{
        // Old paused saves resume here without retroactively simulating their paused time.
        let away=saved.paused?0:Math.max(0,(lastNow-saved.savedAt)/1000);
        if(maneuver){const used=advanceTravel(Math.min(away,maneuver.remaining),maneuver.velocity);away-=used;if(maneuver){maneuver.remaining-=used;if(maneuver.remaining<1e-7)maneuver=null;}if(!ended)forecast();}
        if(!ended)idle(away);
        if(!ended)forecast();
      }
      return true;
    }catch(_){return false;}
  }
  function snapshot(){return {dimensions:2,size:SIZE,player:{...player},shipVelocity:maneuver?{...maneuver.velocity}:direction(),rocks,elapsed,timeToImpact:timeLeft(),threat,plan,maneuver,heading,generation,phase,searching:!!avoidanceSearch,paused:false,ended};}
  function frame(now){
    requestAnimationFrame(frame);
    const active=keys.size||touches.size||maneuver||phase!==board.state?.phase||board.distanceHover!==board.renderedHover||Math.abs((board.shipHeading||0)-(board.turnTarget||0))>1e-5;
    if(document.hidden||now-lastFrame<(active?30:100))return;
    advance();
    lastFrame=now;
    board.update(snapshot(),now);
    if(now-lastUI>120){renderUI();lastUI=now;}
  }
  try{audio.enabled=localStorage.getItem('still-sound-enabled')!=='false';}catch(_){/* Default on if preferences cannot be read. */}
  if(!restoreRun())reset();
  watchLeft=timeLeft();audio.start();
  const unlockAudio=event=>{if(!event.target.closest?.('#sound-button'))audio.start();};
  document.addEventListener('pointerdown',unlockAudio,{capture:true,passive:true});
  document.addEventListener('keydown',unlockAudio,{capture:true});
  renderUI();board.update(snapshot(),performance.now());
  setInterval(()=>{if(document.hidden){advance();renderUI();}},250);
  requestAnimationFrame(frame);
  window.STILL=Object.freeze({getState:()=>({...snapshot(),aliveSeconds:aliveSeconds(),nextThreat:threat?.id??null,asteroids:rocks.length,shipRadius:P.SHIP_RADIUS,worldSize:SIZE,generation,dialog,sound:audio.enabled,board:board.getState(),lastExecutedPlan,watch:{alertCount,audioState:audio.context?.state||'unarmed'}})});
})();
