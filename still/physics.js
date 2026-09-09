/* Continuous 2D collision prediction on a periodic plane. No rendering dependencies. */
(function (root) {
  'use strict';
  const FORECAST_HORIZON = 31 * 86400, SHIP_RADIUS = 1.3;
  const wrap = (value, size) => ((value + size / 2) % size + size) % size - size / 2;
  const length = v => Math.hypot(v.x, v.y);
  const axes = size => typeof size === 'number' ? {x:size,y:size} : size;
  function circleTime(x, y, vx, vy, radius) {
    const c=x*x+y*y-radius*radius;
    if(c<=0)return 0;
    const a=vx*vx+vy*vy,b=x*vx+y*vy;
    if(a<1e-20||b>=0)return Infinity;
    const d=b*b-a*c;
    return d<0?Infinity:c/(-b+Math.sqrt(d));
  }
  function timeToWrappedImpact(ship, rock, size, horizon=FORECAST_HORIZON, shipRadius=SHIP_RADIUS, shipVelocity={x:0,y:0}) {
    const span=axes(size),hx=span.x/2,hy=span.y/2,vx=rock.velocity.x-shipVelocity.x,vy=rock.velocity.y-shipVelocity.y;
    let x=wrap(rock.position.x-ship.x,span.x),y=wrap(rock.position.y-ship.y,span.y),elapsed=0;
    do {
      const tx=vx?Math.max(0,((vx>0?hx:-hx)-x)/vx):Infinity;
      const ty=vy?Math.max(0,((vy>0?hy:-hy)-y)/vy):Infinity;
      const duration=Math.min(tx,ty,horizon-elapsed);
      const hit=circleTime(x,y,vx,vy,rock.radius+shipRadius);
      if(hit<=duration+1e-9)return Math.min(horizon,elapsed+hit);
      if(duration>=horizon-elapsed)break;
      x+=vx*duration;y+=vy*duration;
      if(tx<=duration+1e-9)x-=Math.sign(vx)*span.x;
      if(ty<=duration+1e-9)y-=Math.sign(vy)*span.y;
      elapsed+=duration;
    }while(elapsed<=horizon);
    return Infinity;
  }
  function predict(ship, rocks, size, horizon=FORECAST_HORIZON) {
    let time=Infinity,asteroid=null;
    for(const rock of rocks){const t=timeToWrappedImpact(ship,rock,size,Math.min(horizon,time));if(t<time){time=t;asteroid=rock;}}
    return {time,asteroid};
  }
  function advancePosition(position,velocity,seconds,size){
    const span=axes(size);position.x=wrap(position.x+velocity.x*seconds,span.x);position.y=wrap(position.y+velocity.y*seconds,span.y);
  }
  // Exact drawable segments. A wrap pairs two edges; it is never a line across the map.
  function wrappedPath(position,velocity,seconds,size){
    const span=axes(size),hx=span.x/2,hy=span.y/2;
    let x=wrap(position.x,span.x),y=wrap(position.y,span.y),elapsed=0;
    const segments=[];
    while(elapsed<seconds-1e-7){
      const tx=velocity.x?Math.max(0,((velocity.x>0?hx:-hx)-x)/velocity.x):Infinity;
      const ty=velocity.y?Math.max(0,((velocity.y>0?hy:-hy)-y)/velocity.y):Infinity;
      const dt=Math.min(tx,ty,seconds-elapsed),end={x:x+velocity.x*dt,y:y+velocity.y*dt};
      if(dt>1e-7)segments.push({start:{x,y},end,t0:elapsed,t1:elapsed+dt});
      x=end.x;y=end.y;elapsed+=dt;
      if(tx<=dt+1e-7)x-=Math.sign(velocity.x)*span.x;
      if(ty<=dt+1e-7)y-=Math.sign(velocity.y)*span.y;
    }
    return segments;
  }
  // Center-to-center distance on the torus. Squaring removes the sign flip at a seam.
  function wrappedDistance(ship,rock,time,size){
    const span=axes(size);
    return Math.hypot(wrap(rock.position.x+rock.velocity.x*time-ship.x,span.x),wrap(rock.position.y+rock.velocity.y*time-ship.y,span.y));
  }
  function distanceTrace(ship,rock,size,horizon,samples=400){
    if(!rock||!Number.isFinite(horizon)||horizon<0)return {points:[],crossings:[]};
    if(horizon===0)return {points:[{time:0,distance:wrappedDistance(ship,rock,0,size)}],crossings:[]};
    const relative={x:rock.position.x-ship.x,y:rock.position.y-ship.y};
    const segments=wrappedPath(relative,rock.velocity,horizon,size),points=[],crossings=[];
    const speed2=rock.velocity.x**2+rock.velocity.y**2;
    for(const segment of segments){
      const duration=segment.t1-segment.t0;
      const count=Math.max(1,Math.ceil(duration/horizon*samples));
      const times=Array.from({length:count+1},(_,i)=>duration*i/count);
      // Preserve every minimum and seam exactly, even in a long, densely folded route.
      if(speed2){const closest=-(segment.start.x*rock.velocity.x+segment.start.y*rock.velocity.y)/speed2;if(closest>0&&closest<duration)times.push(closest);}
      times.sort((a,b)=>a-b);
      for(const t of times){
        const time=segment.t0+t;
        if(points.length&&Math.abs(points.at(-1).time-time)<1e-8)continue;
        points.push({time,distance:Math.hypot(segment.start.x+rock.velocity.x*t,segment.start.y+rock.velocity.y*t)});
      }
      if(segment.t1<horizon-1e-7)crossings.push({time:segment.t1,distance:points.at(-1).distance});
    }
    return {points,crossings};
  }
  function encounterGeometry(ship,rock,size,time){
    if(!rock||!Number.isFinite(time))return null;
    const speed=length(rock.velocity),span=axes(size);if(!speed)return null;
    const along={x:rock.velocity.x/speed,y:rock.velocity.y/speed},normal={x:-along.y,y:along.x};
    const entry={x:wrap(rock.position.x+rock.velocity.x*time-ship.x,span.x),y:wrap(rock.position.y+rock.velocity.y*time-ship.y,span.y)};
    return {along,normal,entry,offset:entry.x*normal.x+entry.y*normal.y,radius:rock.radius+SHIP_RADIUS};
  }
  const MIN_SAFE_TIME=3600;
  function clearanceDuring(ship,rock,size,horizon){
    const segments=wrappedPath({x:rock.position.x-ship.x,y:rock.position.y-ship.y},rock.velocity,horizon,size);
    const speed2=rock.velocity.x**2+rock.velocity.y**2;
    let closest=Infinity;
    for(const s of segments){
      const t=speed2?Math.max(0,Math.min(s.t1-s.t0,-(s.start.x*rock.velocity.x+s.start.y*rock.velocity.y)/speed2)):0;
      closest=Math.min(closest,Math.hypot(s.start.x+rock.velocity.x*t,s.start.y+rock.velocity.y*t));
    }
    return closest-rock.radius-SHIP_RADIUS;
  }
  function validateAvoidance(ship,rocks,size,delta,current=predict(ship,rocks,size)){
    const span=axes(size),distance=length(delta),duration=distance/8;
    if(!current.asteroid||current.time<=0||!Number.isFinite(distance)||distance<=0||Math.abs(delta.x)>span.x/2||Math.abs(delta.y)>span.y/2)return null;
    const geometry=encounterGeometry(ship,current.asteroid,size,current.time);
    if(!geometry)return null;
    // Clear the entire threatening pass, not just its original contact instant.
    // Keep delta unwrapped in this encounter's frame: it describes the actual
    // move across a seam, while geometry identifies the threatening path image.
    const clearance=Math.abs(delta.x*geometry.normal.x+delta.y*geometry.normal.y-geometry.offset)-geometry.radius;
    if(clearance<1e-6)return null;
    const velocity={x:delta.x/duration,y:delta.y/duration};
    if(rocks.some(rock=>timeToWrappedImpact(ship,rock,size,duration,SHIP_RADIUS,velocity)<=duration))return null;
    const destination={x:wrap(ship.x+delta.x,span.x),y:wrap(ship.y+delta.y,span.y)};
    const arrival=rocks.map(rock=>{const position={...rock.position};advancePosition(position,rock.velocity,duration,size);return {...rock,position};});
    const safeFor=predict(destination,arrival,size).time,nextImpact=duration+safeFor;
    if(safeFor<MIN_SAFE_TIME||nextImpact<=current.time)return null;
    // Still protect the first hour against every asteroid, including tangencies.
    if(arrival.some(rock=>clearanceDuring(destination,rock,size,MIN_SAFE_TIME)<1e-6))return null;
    return {delta:{...delta},velocity,destination,duration,distance,clearance,safeFor,nextImpact,beforeImpact:current.time,geometry};
  }
  function* avoidanceCandidates(geometry,size){
    const directions=[geometry.normal,{x:-geometry.normal.x,y:-geometry.normal.y}];
    for(let i=0;i<8;i++)directions.push({x:Math.cos(i*Math.PI/4),y:Math.sin(i*Math.PI/4)});
    for(const factor of [1.8,3,4.5])for(const direction of directions){
      const distance=geometry.radius*factor+2;
      yield {x:direction.x*distance,y:direction.y*distance};
    }
    // Try finer angles and both shorter and longer moves before searching the field.
    for(const factor of [.25,.5,1,1.1,1.25,1.5,6,9,14])for(let i=0;i<32;i++){
      const angle=i*Math.PI/16,distance=geometry.radius*factor;
      yield {x:Math.cos(angle)*distance,y:Math.sin(angle)*distance};
    }
    const radicalInverse=(index,base)=>{let value=0,factor=1/base;while(index){value+=(index%base)*factor;index=Math.floor(index/base);factor/=base;}return value;};
    // A progressively denser, deterministic search of all shortest destination offsets.
    for(let i=1;;i++)yield {x:(radicalInverse(i,2)-.5)*size.x,y:(radicalInverse(i,3)-.5)*size.y};
  }
  function createAvoidanceSearch(ship,rocks,size){
    const initial=predict(ship,rocks,size),geometry=encounterGeometry(ship,initial.asteroid,size,initial.time);
    const candidates=geometry?avoidanceCandidates(geometry,axes(size)):null;
    let attempts=0,done=!candidates;
    return {step(limit=4){
      if(done)return {plan:null,done,attempts};
      // The live objects may have advanced since the previous batch. Check every
      // candidate against their current positions, never an old search snapshot.
      const current=predict(ship,rocks,size);
      if(!current.asteroid||current.time<=0){done=true;return {plan:null,done,attempts};}
      let best=null;
      for(let i=0;i<limit;i++){
        const delta=candidates.next().value;attempts++;
        const proposal=validateAvoidance(ship,rocks,size,delta,current);
        if(proposal&&(!best||proposal.nextImpact>best.nextImpact))best=proposal;
        if(best&&!Number.isFinite(best.nextImpact))break;
      }
      done=!!best;return {plan:best,done,attempts};
    }};
  }
  function planAvoidance(ship,rocks,size){return createAvoidanceSearch(ship,rocks,size).step(30).plan;}
  function formatTime(seconds){
    if(!Number.isFinite(seconds))return '>30d';
    const total=Math.max(0,Math.ceil(seconds)),days=Math.floor(total/86400);
    const clock=[Math.floor(total/3600)%24,Math.floor(total/60)%60,total%60].map(v=>String(v).padStart(2,'0')).join(':');
    return days?days+'d '+clock:clock;
  }
  function briefTime(seconds){
    if(!Number.isFinite(seconds))return '>30 days';
    if(seconds>=86400)return Math.floor(seconds/86400)+'d '+Math.floor(seconds/3600)%24+'h';
    if(seconds>=3600)return Math.floor(seconds/3600)+'h '+Math.floor(seconds/60)%60+'m';
    return Math.max(0,Math.ceil(seconds/60))+' min';
  }
  root.StillPhysics=Object.freeze({FORECAST_HORIZON,SHIP_RADIUS,MIN_SAFE_TIME,wrap,length,timeToWrappedImpact,predict,advancePosition,wrappedPath,wrappedDistance,distanceTrace,encounterGeometry,validateAvoidance,createAvoidanceSearch,planAvoidance,formatTime,briefTime});
})(window);
