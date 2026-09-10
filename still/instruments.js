/* The flight board and encounter close-up are drawn directly from the 2D simulation. */
(function(root){
  'use strict';
  const P=StillPhysics,$=id=>document.getElementById(id);
  const C={lime:'#dbff73',blue:'#91afce',danger:'#d58c86',trajectory:'#ff4d4d',cyan:'#a0c9d0',muted:'#a7b6c5'};
  const idOf=rock=>rock?'AST-'+String(rock.id+1).padStart(2,'0'):'—';
  const setText=(id,value)=>{const element=$(id);if(element.textContent!==value)element.textContent=value;};
  const canvasSizes=new WeakMap();
  function line(c,a,b,color,width=1,dash=[]){c.beginPath();c.setLineDash(dash);c.lineWidth=width;c.strokeStyle=color;c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.setLineDash([]);}
  function ring(c,p,r,color,width=1){c.beginPath();c.arc(p.x,p.y,Math.max(.1,r),0,Math.PI*2);c.strokeStyle=color;c.lineWidth=width;c.stroke();}
  function text(c,label,x,y,color,size=8,align='left'){c.fillStyle=color;c.font=(size<=7?12:size<=8?14:size<=9?16:size)+'px FlightMono, "Courier New", Courier, monospace';c.textAlign=align;c.textBaseline='middle';c.fillText(label,x,y);}
  function fieldPopup(c,p,label,details,w,top,mapH,avoid=[]){
    c.font='16px FlightMono, "Courier New", Courier, monospace';const labelWidth=c.measureText(label).width;
    c.font='12px FlightMono, "Courier New", Courier, monospace';
    const boxW=Math.ceil(Math.max(labelWidth,...details.map(value=>c.measureText(value).width)))+16,boxH=30+18*details.length;
    const sides=p.x>w*.58?[p.x-boxW-32,p.x+32]:[p.x+32,p.x-boxW-32];
    const candidates=sides.flatMap(x=>[p.y+25,p.y-boxH-25,p.y-boxH/2].map(y=>({x,y})));
    candidates.push({x:p.x-boxW/2,y:p.y-boxH-32},{x:p.x-boxW/2,y:p.y+32});
    const overlap=(x,y,r)=>Math.max(0,Math.min(x+boxW,r.right)-Math.max(x,r.left))*Math.max(0,Math.min(y+boxH,r.bottom)-Math.max(y,r.top));
    const positions=candidates.map(({x,y},order)=>{
      x=Math.max(4,Math.min(w-boxW-4,x));y=Math.max(top+4,Math.min(top+mapH-boxH-4,y));
      return {x,y,score:avoid.reduce((sum,r)=>sum+overlap(x,y,r)*(r.weight||1),0),order};
    });
    positions.sort((a,b)=>a.score-b.score||a.order-b.order);
    const {x,y}=positions[0];
    line(c,p,{x:Math.max(x,Math.min(x+boxW,p.x)),y:Math.max(y,Math.min(y+boxH,p.y))},C.blue+'90');
    c.fillStyle='#1e3040';c.fillRect(x,y,boxW,boxH);
    text(c,label,x+8,y+14,C.blue,9);
    details.forEach((value,i)=>text(c,value,x+8,y+35+i*18,'#b4cadd',7));
    return {left:x-6,right:x+boxW+6,top:y-6,bottom:y+boxH+6,weight:100};
  }
  function labelClear(c,label,x,y,pixels,align,circles){
    c.font=pixels+'px FlightMono, "Courier New", Courier, monospace';
    const width=c.measureText(label).width,left=x-(align==='right'?width:align==='center'?width/2:0),padding=4;
    return !circles.some(p=>{
      const nearestX=Math.max(left-padding,Math.min(left+width+padding,p.x));
      const nearestY=Math.max(y-pixels/2-padding,Math.min(y+pixels/2+padding,p.y));
      return Math.hypot(p.x-nearestX,p.y-nearestY)<=p.radius;
    });
  }
  function arrow(c,a,b,color,width=1,headSize=5,closed=false){
    line(c,a,b,color,width);
    const angle=Math.atan2(b.y-a.y,b.x-a.x),r=headSize;
    if(closed){
      c.beginPath();c.moveTo(b.x,b.y);
      c.lineTo(b.x-r*Math.cos(angle-.5),b.y-r*Math.sin(angle-.5));
      c.lineTo(b.x-r*Math.cos(angle+.5),b.y-r*Math.sin(angle+.5));
      c.closePath();c.fillStyle=color;c.fill();c.strokeStyle=color;c.lineWidth=width;c.stroke();return;
    }
    line(c,b,{x:b.x-r*Math.cos(angle-.5),y:b.y-r*Math.sin(angle-.5)},color,width);
    line(c,b,{x:b.x-r*Math.cos(angle+.5),y:b.y-r*Math.sin(angle+.5)},color,width);
  }
  function ship(c,p,color,r=7,ghost=false,heading=0){
    c.save();c.translate(p.x,p.y);c.rotate(heading);c.beginPath();c.moveTo(0,-r);c.lineTo(r*.75,r*.8);c.lineTo(0,r*.4);c.lineTo(-r*.75,r*.8);c.closePath();c.lineWidth=1.3;
    c.strokeStyle=color;c.fillStyle=ghost?'#101923':color;c.fill();c.stroke();c.restore();
  }
  function rock(c,p,r,color,seed,rotation=0,surfaceMark=true){
    c.beginPath();
    for(let i=0;i<9;i++){const a=i/9*Math.PI*2+rotation,rad=r*(.76+.24*(Math.sin(seed*29+i*13)*.5+.5)),x=p.x+Math.cos(a)*rad,y=p.y+Math.sin(a)*rad;i?c.lineTo(x,y):c.moveTo(x,y);}
    c.closePath();c.fillStyle=color+'16';c.strokeStyle=color;c.lineWidth=1.2;c.fill();c.stroke();
    if(surfaceMark)line(c,{x:p.x-r*.3,y:p.y-r*.25},{x:p.x+r*.36,y:p.y+r*.15},color+'50');
  }
  function prepare(canvas){
    const r=canvasSizes.get(canvas)||canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,r.width),h=Math.max(1,r.height);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);return {c,w,h};
  }
  class FlightBoard{
    constructor({preview=()=>{}}={}){
      this.canvas=$('space');this.detail=$('solution-display');this.selected=null;this.hits=[];this.state=null;this.routes=[];this.lastThreat=null;
      this.fieldPointer=null;this.hovered=null;
      this.distanceCanvas=$('distance-display');this.distanceHover=null;this.distanceInfo=null;this.distancePlot=null;this.distanceAnchor=null;this.distanceTrace=null;
      this.ruleCanvas=$('slide-rule-display');this.ruleInfo=null;
      this.liveCanvas=$('live-passes-display');this.livePasses=[];
      this.phaseCanvas=$('phase-display');this.instrument='avoidance';this.phaseInfo=null;
      this.layoutVersion=0;
      this.resizeObserver=new ResizeObserver(entries=>{for(const entry of entries)canvasSizes.set(entry.target,entry.contentRect);this.layoutVersion++;});
      const canvases=[this.canvas,this.detail,this.distanceCanvas,this.ruleCanvas,this.liveCanvas,this.phaseCanvas];
      // A resumed tab or restored context may have lost its bitmap even though
      // the plan is unchanged. Invalidate cached drawings, including impact's
      // frozen frame, and remeasure before the next visible render.
      const invalidate=()=>{for(const canvas of canvases)canvasSizes.delete(canvas);this.layoutVersion++;};
      for(const canvas of canvases){
        this.resizeObserver.observe(canvas);
        canvas.addEventListener('contextrestored',invalidate);
      }
      window.addEventListener('focus',invalidate);
      window.addEventListener('pageshow',invalidate);
      document.addEventListener('visibilitychange',()=>{if(!document.hidden)invalidate();});
      document.fonts.ready.then(()=>{this.layoutVersion++;});
      const tabs=[$('avoidance-tab'),$('phase-tab')];
      const selectInstrument=(index,persist=true)=>{
        this.instrument=index?'phase':'avoidance';
        tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;});
        $('avoidance-view').hidden=index!==0;$('phase-view').hidden=index!==1;
        setText('instrument-heading',index?'Phase portrait':'Avoidance');
        if(persist)try{localStorage.setItem('still-instrument-view',this.instrument);}catch(_){/* Switching still works without storage. */}
        invalidate();
      };
      let savedInstrument;
      try{savedInstrument=localStorage.getItem('still-instrument-view');}catch(_){/* Default to Avoidance when storage is unavailable. */}
      selectInstrument(savedInstrument==='phase'?1:0,false);
      const derivativeToggle=$('derivative-toggle');
      this.derivativeVisible=false;
      try{this.derivativeVisible=localStorage.getItem('still-distance-derivative')==='true';}catch(_){/* The overlay defaults off. */}
      const setDerivativeVisibility=()=>{
        derivativeToggle.checked=this.derivativeVisible;
        $('distance-legend').hidden=!this.derivativeVisible;
        if(this.derivativeVisible)this.distanceCanvas.setAttribute('aria-describedby','distance-legend');
        else this.distanceCanvas.removeAttribute('aria-describedby');
        this.distanceCanvas.title='Fixed time from Start to contact. Lime Now shows progress; cyan shows preview. Numbered lines mark field wraps. Hover or tap to preview the future.'+
          (this.derivativeVisible?' Dashed rate uses the right km/h axis: negative is closing. Open circles mark undefined derivatives at corners.':'');
        invalidate();
      };
      setDerivativeVisibility();
      derivativeToggle.addEventListener('change',()=>{
        this.derivativeVisible=derivativeToggle.checked;
        try{localStorage.setItem('still-distance-derivative',String(this.derivativeVisible));}catch(_){/* Toggling still works without storage. */}
        setDerivativeVisibility();
      });
      tabs.forEach((tab,index)=>{
        tab.addEventListener('click',()=>selectInstrument(index));
        tab.addEventListener('keydown',event=>{
          if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
          event.preventDefault();event.stopPropagation();
          const next=event.key==='Home'?0:event.key==='End'?1:1-index;
          selectInstrument(next);tabs[next].focus();
        });
      });
      const chartPhase=event=>{const r=this.distanceCanvas.getBoundingClientRect(),p=this.distancePlot;return p?Math.max(0,Math.min(1,(event.clientX-r.left-p.left)/p.width)):0;};
      const previewAt=event=>{if(this.distancePlot&&this.state?.threat&&!this.state.ended&&!this.state.maneuver){
        this.distanceHover=chartPhase(event);
        const elapsed=this.state.elapsed-this.distanceAnchor.elapsed,remaining=this.state.timeToImpact;
        preview(remaining>0?(this.distanceHover*this.distanceAnchor.horizon-elapsed)/remaining:0);
      }};
      this.distanceCanvas.addEventListener('pointermove',previewAt);
      this.distanceCanvas.addEventListener('pointerleave',()=>{this.distanceHover=null;});
      this.distanceCanvas.addEventListener('click',previewAt);
      this.reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.canvas.addEventListener('pointermove',event=>{
        const r=this.canvas.getBoundingClientRect();this.fieldPointer={x:event.clientX-r.left,y:event.clientY-r.top};this.updateFieldHover();
      });
      this.canvas.addEventListener('pointerleave',()=>{this.fieldPointer=null;this.updateFieldHover();});
    }
    fieldHit(x,y){return this.hits.reduce((best,p)=>{const d=Math.hypot(p.x-x,p.y-y);return d<18&&(!best||d<best.d)?{id:p.id,d}:best;},null);}
    updateFieldHover(){
      const hit=this.fieldPointer?this.fieldHit(this.fieldPointer.x,this.fieldPointer.y):null;
      this.hovered=hit?.id??null;
      const cursor=hit?'pointer':'';
      if(this.canvas.style.cursor!==cursor)this.canvas.style.cursor=cursor;
    }
    trackNext(){if(this.state)this.selected=this.state.threat?.id??null;}
    update(state,now){
      if(state.ended){
        if(!this.state?.ended||state.generation!==this.state.generation)this.stoppedAt=now;
        now=this.stoppedAt;
        const endedKey=[state.generation,this.layoutVersion,devicePixelRatio].join('|');
        if(this.endedRenderKey===endedKey)return;
        this.endedRenderKey=endedKey;
      }else this.endedRenderKey=null;
      this.updateHeading(state,now);this.state=state;
      if(this.lastThreat!==state.threat?.id){this.lastThreat=state.threat?.id;this.trackNext();this.distanceHover=null;}
      // Distance instruments update twice a second until the displayed countdown
      // reaches five minutes, then follow every field frame. Input and resizing
      // also invalidate immediately.
      const course=[state.generation,state.threat?.id,state.player.x,state.player.y,state.ended,!!state.maneuver,this.layoutVersion,devicePixelRatio];
      const distanceKey=[...course,state.phase,this.distanceHover,Math.floor(state.elapsed*2),Math.round((state.elapsed+state.timeToImpact)*1000)].join('|');
      const remaining=state.timeToImpact*(1-state.phase);
      const nearContact=state.threat&&!state.ended&&!state.maneuver&&remaining>0&&remaining<=300;
      if(nearContact||distanceKey!==this.distanceKey){
        this.drawDistance(state);
        if(this.instrument==='phase')this.drawPhasePortrait(state);
        this.distanceKey=distanceKey;
      }
      this.drawMap(state,now);
      const solutionKey=[...course,this.shipHeading,state.plan?0:Math.floor(state.elapsed)].join('|');
      if(solutionKey!==this.solutionKey||state.plan!==this.solutionPlan){
        this.drawSolution(state);this.solutionKey=solutionKey;this.solutionPlan=state.plan;
      }
      const liveKey=[...course,state.phase,Math.floor(state.elapsed*2)].join('|');
      if(liveKey!==this.liveKey){this.drawLivePasses(state);this.liveKey=liveKey;}
      this.renderedHover=this.distanceHover;
    }
    updateHeading(s,now){
      const target=s.heading||0;
      if(!this.state||this.state.generation!==s.generation||this.reduced){
        this.shipHeading=this.turnFrom=this.turnTarget=target;this.turnAt=now;return;
      }
      const t=Math.max(0,Math.min(1,(now-this.turnAt)/1000)),ease=t*t*(3-2*t);
      this.shipHeading=this.turnFrom+(this.turnTarget-this.turnFrom)*ease;
      if(Math.abs(P.wrap(target-this.turnTarget,Math.PI*2))>1e-8){
        // Retarget from the visible heading and take the shortest arc across north/south.
        this.turnFrom=this.shipHeading;
        this.turnTarget=this.shipHeading+P.wrap(target-this.shipHeading,Math.PI*2);
        this.turnAt=now;
      }
    }
    resetDistance(){this.distanceAnchor=null;this.distanceTrace=null;this.distanceHover=null;this.distanceKey=null;}
    matchesDistance(s,a=this.distanceAnchor){
      return a&&s.threat&&a.rock.id===s.threat.id&&a.rock.radius===s.threat.radius&&
        a.rock.velocity.x===s.threat.velocity.x&&a.rock.velocity.y===s.threat.velocity.y&&
        a.player.x===s.player.x&&a.player.y===s.player.y&&a.size.x===s.size.x&&a.size.y===s.size.y&&
        s.elapsed>=a.elapsed&&Math.abs(a.elapsed+a.horizon-s.elapsed-s.timeToImpact)<.01;
    }
    restoreDistance(a,s){
      this.resetDistance();
      const vector=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y);
      if(!a||!Number.isFinite(a.elapsed)||a.elapsed<0||!Number.isFinite(a.horizon)||a.horizon<=0||a.horizon>P.FORECAST_HORIZON||
        !vector(a.player)||!vector(a.size)||!vector(a.rock?.position)||!vector(a.rock?.velocity)||
        !Number.isInteger(a.samples)||a.samples<320||a.samples>10000||!this.matchesDistance(s,a))return;
      // Reject stale saved curves even when the asteroid ID and impact time agree.
      const dt=s.elapsed-a.elapsed;
      if(['x','y'].some(axis=>Math.abs(P.wrap(a.rock.position[axis]+a.rock.velocity[axis]*dt-s.threat.position[axis],s.size[axis]))>.001))return;
      this.distanceAnchor=a;
    }
    drawMap(s,now){
      const {c,w,h}=prepare(this.canvas);
      const top=16,bottom=36;
      const scale=Math.min((w-94)/s.size.x,Math.max(1,h-top-bottom)/s.size.y),mapW=s.size.x*scale,mapH=s.size.y*scale,left=(w-mapW)/2;
      const project=p=>({x:left+(p.x+s.size.x/2)*scale,y:top+(s.size.y/2-p.y)*scale});
      const relative=p=>({x:P.wrap(p.x-s.player.x,s.size.x),y:P.wrap(p.y-s.player.y,s.size.y)});
      const origin=project({x:0,y:0}),future=s.phase*(Number.isFinite(s.timeToImpact)?s.timeToImpact:86400);
      this.hits=[];
      // A quiet graph-paper plane keeps distance legible behind the bright route.
      for(let x=20;x<w;x+=26)for(let y=15;y<h;y+=26){c.fillStyle='#a3bfd510';c.fillRect(x,y,1,1);}
      c.fillStyle='#0d1721';c.fillRect(left,top,mapW,mapH);
      for(let n=0;n<=10;n++){
        const x=left+n*mapW/10;
        line(c,{x,y:top},{x,y:top+mapH},n===5?'#6b879f43':'#68869e21');
        const km=(n-5)*s.size.x/100;
        if(mapW>=260||n===0||n===5||n===10)text(c,(km>0?'+':'')+km,x,top+mapH+14,n===5?'#c4d9ea':'#8b9fb2',7,'center');
      }
      for(let n=0;n<=6;n++){
        const y=top+n*mapH/6;
        line(c,{x:left,y},{x:left+mapW,y},n===3?'#6b879f43':'#68869e21');
        const km=(3-n)*s.size.y/60;
        text(c,(km>0?'+':'')+km,left-12,y,n===3?'#c4d9ea':'#8b9fb2',7,'right');
      }
      c.strokeStyle='#8aa5bc88';c.strokeRect(left,top,mapW,mapH);
      for(const [x,y,sx,sy] of [[left,top,1,1],[left+mapW,top,-1,1],[left,top+mapH,1,-1],[left+mapW,top+mapH,-1,-1]]){
        line(c,{x,y:y+sy*11},{x,y},'#afc6d699');line(c,{x,y},{x:x+sx*11,y},'#afc6d699');
      }
      this.routes=s.threat?P.wrappedPath(relative(s.threat.position),s.threat.velocity,s.timeToImpact,s.size):[];
      const passedWraps=this.distanceInfo?.wrapTimes.filter(t=>t<=this.distanceInfo.elapsed).length||0;
      c.save();c.beginPath();c.rect(left,top,mapW,mapH);c.clip();
      for(const segment of this.routes){
        const a=project(segment.start),b=project(segment.end);
        c.lineDashOffset=this.reduced?0:-now*.008;
        line(c,a,b,C.trajectory,1.2,[4,6]);
        c.lineDashOffset=0;
        const d=Math.hypot(b.x-a.x,b.y-a.y);
        for(let v=38;v<d-18;v+=85){
          const t=v/d,q={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
          arrow(c,{x:q.x-(b.x-a.x)/d*5,y:q.y-(b.y-a.y)/d*5},q,C.trajectory);
        }
      }
      c.restore();
      // Matching numbered portals explicitly explain each periodic boundary crossing.
      for(let i=0;i<this.routes.length-1;i++){
        const pair=[project(this.routes[i].end),project(this.routes[i+1].start)];
        for(const p of pair){
          const x=Math.max(left+6,Math.min(left+mapW-6,p.x)),y=Math.max(top+6,Math.min(top+mapH-6,p.y));
          c.fillStyle='#203142';c.fillRect(x-11,y-11,22,22);text(c,String(passedWraps+i+1),x,y,C.blue,7,'center');
        }
      }
      if(s.threat){
        c.save();c.shadowColor=C.blue+'99';c.shadowBlur=8;
        const threatAt=project(relative({x:s.threat.position.x+s.threat.velocity.x*future,y:s.threat.position.y+s.threat.velocity.y*future}));
        const threatRadius=Math.max(25,s.threat.radius*scale+19);
        const occupied=[
          {left:origin.x-24,right:origin.x+24,top:origin.y-24,bottom:origin.y+24},
          {left:threatAt.x-threatRadius,right:threatAt.x+threatRadius,top:threatAt.y-threatRadius,bottom:threatAt.y+threatRadius}
        ];
        // Measure the actual labels in screen pixels so small views and wraps
        // thin out crowded markers too. Fade over the last 18 pixels of space.
        for(const fraction of [.25,.5,.75]){
          const dt=s.timeToImpact*fraction,p=relative({x:s.threat.position.x+s.threat.velocity.x*dt,y:s.threat.position.y+s.threat.velocity.y*dt}),q=project(p);
          const label='+'+P.briefTime(dt);
          c.font='14px FlightMono, "Courier New", Courier, monospace';
          const labelWidth=c.measureText(label).width;
          if(labelWidth+6>mapW)continue;
          const x=Math.max(left+3,Math.min(left+mapW-labelWidth-3,q.x+12)),y=Math.max(top+16,q.y-16);
          const bounds={left:Math.min(q.x-6,x-3),right:Math.max(q.x+6,x+labelWidth+3),top:Math.min(q.y-6,y-10),bottom:Math.max(q.y+6,y+10)};
          const gap=Math.min(...occupied.map(b=>Math.hypot(
            Math.max(0,b.left-bounds.right,bounds.left-b.right),
            Math.max(0,b.top-bounds.bottom,bounds.top-b.bottom))));
          const fade=Math.min(1,gap/18);
          if(fade<=0)continue;
          c.globalAlpha=fade*fade*(3-2*fade);
          ring(c,q,4,'#c4d9ea',1.5);
          text(c,label,x,y,'#c4d9ea',8);
          occupied.push(bounds);
        }
        c.restore();
      }
      // Stamp history on a fixed simulation clock, not at offsets that follow the rock.
      // Reconstructing the stamps also keeps previews, reloads, and time jumps consistent.
      const trailInterval=900,trailCount=6,trailLifetime=trailInterval*trailCount;
      const displayTime=s.elapsed+future,lastStamp=Math.floor(displayTime/trailInterval)*trailInterval;
      c.save();c.beginPath();c.rect(left,top,mapW,mapH);c.clip();
      for(const asteroid of s.rocks){
        if(!P.length(asteroid.velocity))continue;
        c.fillStyle=asteroid===s.threat?C.danger:'#8a9eaf';
        for(let i=trailCount-1;i>=0;i--){
          const stamp=lastStamp-i*trailInterval,age=displayTime-stamp,t=stamp-s.elapsed;
          const dot=project(relative({x:asteroid.position.x+asteroid.velocity.x*t,y:asteroid.position.y+asteroid.velocity.y*t}));
          c.globalAlpha=.65*(1-age/trailLifetime)**1.4;
          c.beginPath();c.arc(dot.x,dot.y,2,0,Math.PI*2);c.fill();
        }
      }
      c.restore();
      const popups=[];
      for(const asteroid of s.rocks){
        const offset=relative({x:asteroid.position.x+asteroid.velocity.x*future,y:asteroid.position.y+asteroid.velocity.y*future}),p=project(offset);
        const danger=asteroid===s.threat,r=Math.max(6,asteroid.radius*scale);
        rock(c,p,r,'#8a9eaf',asteroid.id,this.reduced?0:s.elapsed*.006+asteroid.id,!danger);
        if(danger){
          const pulse=this.reduced?0:Math.sin(now*.0015),inset=r+5+pulse*1.5;
          ring(c,p,Math.max(23,r+17)+pulse*2,C.trajectory+'80',1.2);
          const rotation=this.reduced?0:(now%30000)/30000*Math.PI*2;
          for(let i=0;i<4;i++){
            const angle=rotation-Math.PI/2+i*Math.PI/2,dx=Math.cos(angle),dy=Math.sin(angle);
            line(c,{x:p.x+dx*inset,y:p.y+dy*inset},{x:p.x+dx*(inset+9),y:p.y+dy*(inset+9)},C.trajectory,1.5);
          }
          const label=s.phase>.995?'IMPACT / '+idOf(asteroid):idOf(asteroid);
          const detail=s.phase>.995?'IF STATIONARY':P.briefTime(s.timeToImpact);
          const metrics=(P.length(offset)/10).toFixed(2)+' km · '+(P.length(asteroid.velocity)*360).toFixed(2)+' km/h';
          popups.push({p,label,details:[detail,metrics]});
        }
        if(asteroid.id===this.hovered&&!danger){
          ring(c,p,12,C.blue);
          const metrics=(P.length(offset)/10).toFixed(2)+' km · '+(P.length(asteroid.velocity)*360).toFixed(2)+' km/h';
          popups.push({p,label:idOf(asteroid),details:[metrics]});
        }
        this.hits.push({...p,id:asteroid.id,radius:danger?Math.max(25,r+19):r});
      }
      // Keep callouts clear of the ship, its labels, and other callouts. Draw
      // them after the rocks so later asteroid strokes cannot cross the text.
      const avoid=[{left:origin.x-60,right:origin.x+24,top:origin.y-30,bottom:origin.y+(s.maneuver?42:18),weight:100},
        ...this.hits.map(p=>({left:p.x-p.radius-6,right:p.x+p.radius+6,top:p.y-p.radius-6,bottom:p.y+p.radius+6}))];
      for(const popup of popups)avoid.push(fieldPopup(c,popup.p,popup.label,popup.details,w,top,mapH,avoid));
      if(this.fieldPointer)this.updateFieldHover();
      ship(c,origin,C.lime,8,false,this.shipHeading);
      if(!s.phase&&labelClear(c,'YOU',origin.x-12,origin.y-12,16,'right',this.hits)){text(c,'YOU',origin.x-12,origin.y-12,C.lime,9,'right');}
      if(s.maneuver){ring(c,origin,17,C.cyan);text(c,'MOVING',origin.x,origin.y+29,C.cyan,8,'center');}
      text(c,'↑ Y',left+mapW+15,top+7,'#8299ac',7);text(c,'X →',left+mapW-8,top+mapH+25,'#8299ac',7,'right');
    }
    drawSolution(s){
      const {c,w,h}=prepare(this.detail),g=s.plan?.geometry||P.encounterGeometry(s.player,s.threat,s.size,s.timeToImpact);
      if(!g){text(c,s.ended?'IMPACT':'CLEAR',w/2,h/2,C.lime,13,'center');return;}
      const delta=s.plan?.delta||{x:0,y:0},r=g.radius;
      // Keep the same X/Y orientation as the main map. Down means down in both views.
      const closest={x:g.normal.x*g.offset,y:g.normal.y*g.offset};
      const a={x:closest.x-g.along.x*r*4,y:closest.y-g.along.y*r*4};
      const b={x:closest.x+g.along.x*r*4,y:closest.y+g.along.y*r*4};
      const minX=Math.min(a.x,b.x,-r,delta.x-r),maxX=Math.max(a.x,b.x,r,delta.x+r);
      const minY=Math.min(a.y,b.y,-r,delta.y-r),maxY=Math.max(a.y,b.y,r,delta.y+r);
      const scale=Math.min((w-84)/(maxX-minX),(h-63)/(maxY-minY));
      const ox=(w-(maxX-minX)*scale)/2-minX*scale;
      let oy=(h-(maxY-minY)*scale)/2+maxY*scale+3;
      // Bring the drawing closer to its heading without clipping the path,
      // asteroid, or ship markers when the encounter points in another direction.
      const topEdge=Math.min(
        oy-Math.max(a.y,b.y)*scale-s.threat.radius*scale*Math.abs(g.along.x),
        oy-g.entry.y*scale-Math.max(7,s.threat.radius*scale),oy-32,
        s.plan?oy-delta.y*scale-(delta.y>=0?38:13):Infinity);
      oy-=Math.min(24,Math.max(0,topEdge-12));
      const project=p=>({x:ox+p.x*scale,y:oy-p.y*scale});
      const start=project(a),end=project(b),here=project({x:0,y:0}),target=project(delta);
      line(c,start,end,C.blue+'10',s.threat.radius*scale*2);
      arrow(c,start,end,C.blue+'dd',1.5,15,true);
      rock(c,project(g.entry),Math.max(7,s.threat.radius*scale),C.trajectory,s.threat.id,0,false);
      ship(c,here,C.lime,6,true,this.shipHeading);
      line(c,{x:here.x-9,y:here.y-9},{x:here.x+9,y:here.y+9},C.danger,1.3);
      line(c,{x:here.x+9,y:here.y-9},{x:here.x-9,y:here.y+9},C.danger,1.3);
      const stayX=Math.max(7,Math.min(w-113,here.x+18)),stayY=Math.max(33,Math.min(h-13,here.y-24));
      text(c,'STAY = HIT',stayX,stayY,C.danger,9);
      if(s.plan){
        arrow(c,here,target,C.cyan,1.5);ship(c,target,C.cyan,7,false,Math.atan2(delta.x,delta.y));ring(c,target,13,C.cyan+'50');
        const labelY=target.y>here.y?target.y+31:target.y-30;
        text(c,'MOVE = MISS',Math.max(87,Math.min(w-87,target.x)),Math.max(24,Math.min(h-32,labelY)),C.cyan,9,'center');
      }
    }
    drawLivePasses(s){
      const range=50,sidePadding=30,shipVelocity=s.shipVelocity||{x:0,y:0};
      const future=s.phase*(Number.isFinite(s.timeToImpact)?s.timeToImpact:86400),preview=future>0;
      setText('live-passes-heading',preview?'Projected close passes':'Live close passes');
      setText('live-passes-caption',preview?'Edge clearance · preview':'Edge clearance · now');
      setText('live-passes-mode',preview?'PREVIEW':'NOW');
      $('live-passes-mode').classList.toggle('is-preview',preview);
      // Match the field's selected time before selecting nearby contacts.
      const contacts=s.rocks.map(asteroid=>{
        const x=P.wrap(asteroid.position.x+asteroid.velocity.x*future-s.player.x,s.size.x),
          y=P.wrap(asteroid.position.y+asteroid.velocity.y*future-s.player.y,s.size.y),distance=Math.hypot(x,y);
        const closing=x*(asteroid.velocity.x-shipVelocity.x)+y*(asteroid.velocity.y-shipVelocity.y);
        return {id:asteroid.id,x,y,velocity:{...asteroid.velocity},radius:asteroid.radius,distance,clearance:Math.max(0,distance-asteroid.radius-P.SHIP_RADIUS)/10,
          motion:distance<=asteroid.radius+P.SHIP_RADIUS?'Contact':Math.abs(closing)<1e-8?'Steady':closing<0?'Closing':'Receding'};
      // Extend the vicinity three kilometers sideways without extending it vertically.
      }).filter(p=>Math.hypot(Math.max(0,Math.abs(p.x)-sidePadding),p.y)<=range).sort((a,b)=>a.clearance-b.clearance);
      this.livePasses=contacts;
      const shown=contacts.length>0,body=$('live-passes-body'),empty=$('live-passes-empty');
      if(body.hidden===shown)body.hidden=!shown;
      if(empty.hidden!==shown)empty.hidden=shown;
      $('live-passes-scale').hidden=!shown;
      const nearest=contacts.slice(0,3),summary=nearest.map(p=>idOf(p)+' '+p.clearance.toFixed(3)+' km '+p.motion).join('|');
      if(summary!==this.liveSummary){
        this.liveSummary=summary;
        $('live-passes-list').replaceChildren(...nearest.map(p=>{
          const row=document.createElement('div');row.className='live-pass';
          const label=document.createElement('strong');label.textContent=idOf(p)+' · '+p.clearance.toFixed(3)+' km';
          const motion=document.createElement('small');motion.textContent=p.motion;
          row.append(label,motion);return row;
        }));
      }
      if(!shown){this.liveCanvas.setAttribute('aria-label',(preview?'Projected':'Live')+' close passes: no nearby asteroids.');return;}
      const viewRange=30;
      // The taller viewport adds 10% above and below at the original zoom.
      const {c,w,h}=prepare(this.liveCanvas),origin={x:w/2,y:h/2},scale=Math.max(1,h/1.2-18)/(2*viewRange);
      ring(c,origin,viewRange*scale,'#607f9955');
      for(const radius of [20,10])ring(c,origin,radius*scale,'#607f992b');
      // Extend the current straight course backward and forward to the rectangle.
      // The rings are distance references, not a clipping boundary.
      for(const p of contacts){
        const speed=P.length(p.velocity);if(!speed)continue;
        const at={x:origin.x+p.x*scale,y:origin.y-p.y*scale},
          direction={x:p.velocity.x/speed,y:-p.velocity.y/speed},color=p.id===s.threat?.id?C.trajectory:C.cyan;
        let tail=-Infinity,head=Infinity;
        for(const [axis,extent] of [['x',w],['y',h]]){
          if(Math.abs(direction[axis])<1e-12){
            if(at[axis]<2||at[axis]>extent-2){head=-Infinity;break;}
          }else{
            const a=(2-at[axis])/direction[axis],b=(extent-2-at[axis])/direction[axis];
            tail=Math.max(tail,Math.min(a,b));head=Math.min(head,Math.max(a,b));
          }
        }
        if(head<=tail)continue;
        const point=t=>({x:at.x+direction.x*t,y:at.y+direction.y*t});
        line(c,point(tail),point(head),color+'99',1,[3,4]);
        // Both arrowheads point with the motion, at the incoming and outgoing ends.
        const inset=Math.min(10,(head-tail)/3),headSize=Math.min(7,inset);
        for(const t of [tail+inset,head-inset])arrow(c,point(t-headSize),point(t),color,1,headSize,true);
      }
      line(c,{x:origin.x-5,y:origin.y},{x:origin.x+5,y:origin.y},C.lime+'70');
      line(c,{x:origin.x,y:origin.y-5},{x:origin.x,y:origin.y+5},C.lime+'70');
      ring(c,origin,P.SHIP_RADIUS*scale,C.lime,1.5);
      const liveCircles=contacts.map(p=>({x:origin.x+p.x*scale,y:origin.y-p.y*scale,radius:p.radius*scale}));
      const innerRingOccupied=contacts.some(p=>p.distance-p.radius<=10);
      if(!innerRingOccupied&&labelClear(c,'YOU',origin.x,origin.y+14,12,'center',liveCircles))text(c,'YOU',origin.x,origin.y+14,C.lime,7,'center');
      for(const p of contacts){
        const at={x:origin.x+p.x*scale,y:origin.y-p.y*scale},color=p.id===s.threat?.id?C.trajectory:C.cyan;
        ring(c,at,p.radius*scale,color,1.2);
        c.beginPath();c.arc(at.x,at.y,1.4,0,Math.PI*2);c.fillStyle=color;c.fill();
        if(nearest.includes(p))text(c,String(p.id+1).padStart(2,'0'),Math.max(9,Math.min(w-9,at.x)),Math.max(7,Math.min(h-7,at.y-p.radius*scale-7)),color,7,'center');
      }
      this.liveCanvas.setAttribute('aria-label',(preview?'Projected positions at '+Math.round(future)+' seconds from now':'Live positions')+', fixed '+viewRange/10+' kilometer outer ring with faint rings at 2 and 1 kilometers, up is positive Y. Dashed trajectories extend backward and forward across the rectangular view. Arrowheads at both ends indicate the direction of motion. Collision circles are drawn to scale. '+nearest.map(p=>idOf(p)+': '+p.clearance.toFixed(3)+' kilometers edge clearance, '+p.motion.toLowerCase()).join('. '));
    }
    drawDistance(s){
      const {c,w,h}=prepare(this.distanceCanvas);
      // Velocity is in 100-meter units per second; convert its magnitude to km/h.
      const speed=s.threat?P.length(s.threat.velocity)*360:null;
      $('speed-readout').hidden=speed===null;
      setText('distance-target',s.threat?idOf(s.threat):'—');
      if(!this.matchesDistance(s))this.resetDistance();
      if(!s.threat||!Number.isFinite(s.timeToImpact)||(!this.distanceAnchor&&s.timeToImpact<=0)||s.maneuver){
        this.resetDistance();
        this.distanceInfo=null;this.distancePlot=null;
        setText('speed-readout',speed===null?'':'Speed '+speed.toFixed(2)+' km/h');
        setText('instant-distance','Direct to contact — km');
        setText('distance-rate','');
        $('distance-readout').hidden=true;
        $('route-time').hidden=true;
        this.drawSlideRule(null,null);
        const message=s.ended?'Impact':s.maneuver?'Updating course…':'No predicted threat';
        text(c,message,w/2,h/2,C.muted,8,'center');this.distanceCanvas.setAttribute('aria-label',message);return;
      }
      if(!this.distanceAnchor)this.distanceAnchor={elapsed:s.elapsed,horizon:s.timeToImpact,player:{...s.player},size:{...s.size},rock:{...s.threat,position:{...s.threat.position},velocity:{...s.threat.velocity}},samples:Math.max(320,Math.min(10000,Math.ceil(w)))};
      const a=this.distanceAnchor,horizon=a.horizon,elapsed=s.ended?horizon:Math.max(0,Math.min(horizon,s.elapsed-a.elapsed));
      // Both distances end where the asteroid's center will be at first contact.
      const contactPoint={x:a.rock.position.x+a.rock.velocity.x*horizon,y:a.rock.position.y+a.rock.velocity.y*horizon};
      if(!this.distanceTrace){
        this.distanceTrace=P.distanceTrace(contactPoint,a.rock,a.size,horizon,a.samples);
        // Keep wrap numbers tied to the actual field boundaries around the ship.
        this.distanceTrace.crossings=P.wrappedPath({x:a.rock.position.x-a.player.x,y:a.rock.position.y-a.player.y},a.rock.velocity,horizon,a.size)
          .filter(segment=>segment.t1<horizon-1e-7)
          .map(segment=>({time:segment.t1,distance:P.wrappedDistance(contactPoint,a.rock,segment.t1,a.size)}));
      }
      const trace=this.distanceTrace;
      const {points,crossings}=trace;
      const maximum=Math.max(...points.map(p=>p.distance/10),1),rawStep=maximum/3;
      const power=10**Math.floor(Math.log10(rawStep)),ratio=rawStep/power;
      const step=(ratio<=1?1:ratio<=2?2:ratio<=5?5:10)*power,yMax=Math.ceil(maximum/step)*step;
      const plot={left:48,top:22,width:Math.max(1,w-(this.derivativeVisible?116:84)),height:Math.max(1,h-57)};
      this.distancePlot=plot;
      const x=t=>plot.left+t/horizon*plot.width,y=km=>plot.top+plot.height*(1-km/yMax);
      const rateColor='#b8ac7a',rateMax=Math.max(.01,Math.ceil(speed*100)/100),rateY=rate=>plot.top+plot.height*(1-rate/rateMax)/2;
      const unit=horizon>=7200?3600:horizon>=120?60:1,suffix=unit===3600?'h':unit===60?'min':'s';
      const tick=v=>Number(v.toFixed(v<10?1:0)).toString();
      for(let value=0;value<=yMax+step*.01;value+=step){
        const py=y(value);line(c,{x:plot.left,y:py},{x:plot.left+plot.width,y:py},'#607f993b');
        text(c,tick(value),plot.left-10,py,'#a7b6c5',7,'right');
      }
      text(c,'km',plot.left-10,10,'#a7b6c5',7,'right');
      if(this.derivativeVisible)text(c,'km/h',w-6,10,rateColor,7,'right');
      for(const rate of this.derivativeVisible?[rateMax,0,-rateMax]:[]){
        const py=rateY(rate),right=plot.left+plot.width;
        line(c,{x:right,y:py},{x:right+4,y:py},rateColor+'80');
        text(c,(rate>0?'+':'')+rate.toFixed(2),w-6,py,rateColor,7,'right');
      }
      for(let i=0;i<=4;i++){
        const px=x(horizon*i/4);
        line(c,{x:px,y:plot.top},{x:px,y:plot.top+plot.height},'#607f992b');
        const label=i===0?'Start':tick(horizon*i/4/unit)+(i===4?' '+suffix:'');
        text(c,label,px,plot.top+plot.height+22,'#a7b6c5',7,i===0?'left':i===4?'right':'center');
      }
      // These are the same crossings numbered on the field, not breaks in the curve.
      let lastNumberX=-Infinity;
      crossings.forEach((crossing,index)=>{
        const px=x(crossing.time);
        line(c,{x:px,y:plot.top},{x:px,y:plot.top+plot.height},'#91afce35',1,[2,4]);
        if(px-lastNumberX>22){text(c,String(index+1),px,10,C.blue,7,'center');lastNumberX=px;}
      });
      const fill=c.createLinearGradient(0,plot.top,0,plot.top+plot.height);fill.addColorStop(0,'#91afce26');fill.addColorStop(1,'#91afce02');
      c.beginPath();c.moveTo(x(0),y(0));for(const p of points)c.lineTo(x(p.time),y(p.distance/10));c.lineTo(x(horizon),y(0));c.closePath();c.fillStyle=fill;c.fill();
      // Each smooth branch has its own path: never draw through a derivative jump.
      if(this.derivativeVisible){
        line(c,{x:plot.left,y:rateY(0)},{x:plot.left+plot.width,y:rateY(0)},rateColor+'80',1.2);
        c.setLineDash([4,4]);c.strokeStyle=rateColor+'90';c.lineWidth=1.2;
        for(const segment of trace.rateSegments){
          c.beginPath();segment.forEach((p,i)=>{const px=x(p.time),py=rateY(p.rate*360);i?c.lineTo(px,py):c.moveTo(px,py);});c.stroke();
        }
        c.setLineDash([]);
      }
      c.beginPath();points.forEach((p,i)=>{const px=x(p.time),py=y(p.distance/10);i?c.lineTo(px,py):c.moveTo(px,py);});c.strokeStyle=C.blue;c.lineWidth=1.8;c.stroke();
      // Keep the open limits legible even where the distance curve crosses them.
      for(const segment of this.derivativeVisible?trace.rateSegments:[])for(const p of [segment[0],segment.at(-1)])if(p.open){
        const q={x:x(p.time),y:rateY(p.rate*360)};
        c.beginPath();c.arc(q.x,q.y,3,0,Math.PI*2);c.fillStyle='#090f16';c.fill();ring(c,q,3,rateColor+'cc',1);
      }
      const contact=0,cy=y(contact);
      ring(c,{x:x(horizon),y:cy},3,C.trajectory,1.5);
      text(c,'Contact',x(horizon),Math.max(plot.top+12,cy-14),C.trajectory,11,'center');
      // Real progress remains visible while the separate preview explores the future.
      const nowX=x(elapsed),nowDistance=P.wrappedDistance(contactPoint,a.rock,elapsed,a.size);
      c.fillStyle=C.lime+'0c';c.fillRect(plot.left,plot.top,nowX-plot.left,plot.height);
      line(c,{x:plot.left,y:plot.top+plot.height},{x:nowX,y:plot.top+plot.height},C.lime,3);
      line(c,{x:nowX,y:plot.top},{x:nowX,y:plot.top+plot.height},C.lime+'bb',1.5);
      ring(c,{x:nowX,y:y(nowDistance/10)},4,C.lime,1.5);
      c.font='12px FlightMono, "Courier New", Courier, monospace';
      const nowLabelWidth=c.measureText('Now').width+14,nowLabelY=plot.top+12;
      const nowLabelX=Math.max(plot.left+nowLabelWidth/2,Math.min(plot.left+plot.width-nowLabelWidth/2,nowX));
      c.beginPath();c.roundRect(nowLabelX-nowLabelWidth/2,nowLabelY-9,nowLabelWidth,18,9);c.fillStyle='#000000b3';c.fill();
      text(c,'Now',nowLabelX,nowLabelY,C.lime,7,'center');
      const cursorTime=elapsed+s.phase*(horizon-elapsed),cursorDistance=P.wrappedDistance(contactPoint,a.rock,cursorTime,a.size);
      const cursor={x:x(cursorTime),y:y(cursorDistance/10)};
      if(s.phase>0){line(c,{x:cursor.x,y:plot.top},{x:cursor.x,y:plot.top+plot.height},C.cyan+'bb',1);
      c.beginPath();c.arc(cursor.x,cursor.y,3.5,0,Math.PI*2);c.fillStyle=C.cyan;c.fill();}
      const t=this.distanceHover===null?cursorTime:this.distanceHover*horizon,distance=P.wrappedDistance(contactPoint,a.rock,t,a.size)/10;
      const rate=P.wrappedDistanceRate(contactPoint,a.rock,t,a.size);
      // A small pointer tolerance makes exact, otherwise hard-to-hit corners discoverable.
      const nearCorner=this.distanceHover!==null&&trace.rateBreaks.some(time=>Math.abs(x(time)-x(t))<=4);
      const rateLabel=nearCorner?'d′ undefined at corner':rate===null?'d′ undefined'+(Math.abs(t-horizon)<1e-7?' at contact':' at corner'):
        'd′ '+(rate>0?'+':'')+(rate*360).toFixed(2)+' km/h'+(rate<0?' · closing':rate>0?' · opening':' · level');
      setText('distance-rate',rateLabel);
      // Measure the route from the same future position shown on the field to contact.
      const previewOffset=s.phase*s.timeToImpact,remaining=Math.max(0,s.timeToImpact-previewOffset);
      const route=P.wrappedPath({x:s.threat.position.x+s.threat.velocity.x*previewOffset-s.player.x,y:s.threat.position.y+s.threat.velocity.y*previewOffset-s.player.y},s.threat.velocity,remaining,s.size);
      const travelDistance=route.reduce((total,segment)=>total+Math.hypot(segment.end.x-segment.start.x,segment.end.y-segment.start.y),0)/10;
      setText('instant-distance','Direct to contact '+distance.toFixed(2)+' km');
      $('distance-readout').hidden=false;
      setText('distance-readout','Route left '+travelDistance.toFixed(2)+' km');
      setText('speed-readout','÷ '+speed.toFixed(2)+' km/h');
      $('route-time').hidden=false;
      setText('route-time','≈ '+(speed>0?travelDistance/speed:0).toFixed(3)+' h');
      this.drawSlideRule(travelDistance,speed,s.phase>0);
      if(this.distanceHover!==null){
        const px=x(t),py=y(distance);
        line(c,{x:px,y:plot.top},{x:px,y:plot.top+plot.height},'#dae6ef88',1,[3,3]);ring(c,{x:px,y:py},4,'#e4ebf0',1.5);
        const label='Start +'+P.formatTime(t);c.font='14px FlightMono, "Courier New", Courier, monospace';const width=c.measureText(label).width+16;
        const lx=Math.max(plot.left,Math.min(w-width-5,px+10)),ly=plot.top+13;
        c.fillStyle='#203142ee';c.fillRect(lx,ly-11,width,24);text(c,label,lx+8,ly+1,'#e4ebf0',8);
      }
      this.distanceInfo={threat:s.threat.id,horizon,startedAt:a.elapsed,elapsed,progress:elapsed/horizon,yMax,samples:points.length,start:points[0].distance,end:points.at(-1).distance,contact:contact*10,cursorTime,cursorDistance,wrapTimes:crossings.map(p=>p.time),rate:rate===null?null:rate*360,rateMax,rateBreakTimes:trace.rateBreaks,plot:{...plot}};
      this.distanceCanvas.setAttribute('aria-label','Distance to '+idOf(s.threat)+', fixed from first plotted time to contact, assuming hold. '+(elapsed/horizon*100).toFixed(1)+' percent elapsed. Now '+(nowDistance/10).toFixed(2)+' kilometers; contact at '+contact.toFixed(2)+' kilometers in '+P.briefTime(s.timeToImpact)+'. '+
        (this.derivativeVisible?'Muted dashed derivative uses the right axis in kilometers per hour; negative means closing. Open circles show one-sided limits where the derivative is undefined. '+rateLabel+'. ':'')+'Hover or tap the graph to preview the future.');
    }
    drawPhasePortrait(s){
      const {c,w,h}=prepare(this.phaseCanvas),a=this.distanceAnchor,trace=this.distanceTrace,info=this.distanceInfo;
      const preview=s.phase>0&&!s.ended,color='#b8ac7a';
      setText('phase-mode',s.ended?'IMPACT':preview?'PREVIEW':'NOW');
      $('phase-mode').classList.toggle('is-preview',preview);
      if(!a||!trace||!info){
        const message=s.ended?'Impact':s.maneuver?'Updating course…':'No predicted threat';
        text(c,message,w/2,h/2,C.muted,8,'center');
        setText('phase-reading','Distance × distance rate');
        this.phaseCanvas.setAttribute('aria-label',message);this.phaseInfo=null;return;
      }
      const target={x:a.rock.position.x+a.rock.velocity.x*a.horizon,y:a.rock.position.y+a.rock.velocity.y*a.horizon};
      // Reuse the exact smooth branches of the time plot, including both limits.
      if(!trace.phaseSegments)trace.phaseSegments=trace.rateSegments.map(segment=>segment.map(p=>({
        ...p,distance:P.wrappedDistance(target,a.rock,p.time,a.size)/10,rate:p.rate*360
      })));
      const segments=trace.phaseSegments,plot={left:62,top:36,width:Math.max(1,w-82),height:Math.max(1,h-80)};
      const xMax=info.yMax,rateMax=info.rateMax;
      const project=p=>({x:plot.left+p.distance/xMax*plot.width,y:plot.top+(1-p.rate/rateMax)*plot.height/2});
      const right=plot.left+plot.width,bottom=plot.top+plot.height,zero=project({distance:0,rate:0}).y;
      text(c,'d′ · km/h',plot.left,14,color,7);
      for(let i=0;i<=3;i++){
        const distance=xMax*i/3,px=project({distance,rate:0}).x;
        line(c,{x:px,y:plot.top},{x:px,y:bottom},'#607f9930');
        text(c,Number(distance.toFixed(1)).toString(),px,bottom+17,C.muted,7,i===0?'left':i===3?'right':'center');
      }
      for(const fraction of [1,.5,0,-.5,-1]){
        const rate=rateMax*fraction,py=project({distance:0,rate}).y;
        line(c,{x:plot.left,y:py},{x:right,y:py},fraction===0?color+'80':'#607f9930',fraction===0?1.2:1);
        text(c,(rate>0?'+':'')+rate.toFixed(2),plot.left-8,py,color,7,'right');
      }
      text(c,'Distance to contact · km',plot.left+plot.width/2,h-9,C.blue,7,'center');
      text(c,'RECEDING',right-5,zero-12,color+'80',11,'right');
      text(c,'APPROACHING',right-5,zero+12,color+'80',11,'right');
      for(const segment of segments){
        const path=segment.map(project);
        c.beginPath();path.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.strokeStyle=color+'90';c.lineWidth=1.3;c.stroke();
        // Place one time-direction arrow halfway along each visible arc.
        const lengths=path.map((p,i)=>i?Math.hypot(p.x-path[i-1].x,p.y-path[i-1].y):0);
        const total=lengths.reduce((sum,length)=>sum+length,0);
        let traversed=0;
        if(total>28)for(let i=1;i<path.length;i++){
          const length=lengths[i];
          if(length&&traversed+length>=total*.5){
            const f=(total*.5-traversed)/length,dx=(path[i].x-path[i-1].x)/length,dy=(path[i].y-path[i-1].y)/length;
            const p={x:path[i-1].x+f*length*dx,y:path[i-1].y+f*length*dy};
            arrow(c,{x:p.x-dx*5,y:p.y-dy*5},{x:p.x+dx*5,y:p.y+dy*5},color+'cc',1.2,5);break;
          }
          traversed+=length;
        }
      }
      const limits=segments.flatMap(segment=>[segment[0],segment.at(-1)]).filter(p=>p.open);
      for(const p of limits){
        const q=project(p);c.beginPath();c.arc(q.x,q.y,3,0,Math.PI*2);c.fillStyle='#0d1721';c.fill();ring(c,q,3,color,1);
      }
      const first=segments[0]?.[0],last=segments.at(-1)?.at(-1);
      if(first){const q=project(first);ring(c,q,3,C.blue,1);text(c,'Start',Math.min(right-35,q.x+7),Math.max(plot.top+12,q.y-12),C.blue,11);}
      if(last){const q=project(last);ring(c,q,3,C.trajectory,1.5);text(c,'Contact',q.x+7,q.y-12,C.trajectory,11);}
      const marker=(time,markerColor)=>{
        const distance=P.wrappedDistance(target,a.rock,time,a.size)/10,rawRate=P.wrappedDistanceRate(target,a.rock,time,a.size),rate=rawRate===null?null:rawRate*360;
        const positions=rate===null?limits.filter(p=>Math.abs(p.time-time)<1e-7):[{time,distance,rate}];
        for(const p of positions){const q=project(p);ring(c,q,5,markerColor,1.7);
          if(rate!==null){c.beginPath();c.arc(q.x,q.y,2,0,Math.PI*2);c.fillStyle=markerColor;c.fill();}
        }
        return {time,distance,rate,limits:rate===null?positions.map(p=>p.rate):[]};
      };
      const now=marker(info.elapsed,C.lime),current=preview?marker(info.cursorTime,C.cyan):now;
      const reading=current.distance.toFixed(2)+' km · '+(current.rate===null?'d′ undefined':(current.rate>0?'+':'')+current.rate.toFixed(2)+' km/h');
      setText('phase-reading',reading);
      this.phaseInfo={...current,now,preview,branches:segments.length,jumps:trace.rateBreaks.length,xMax,rateMax,plot};
      this.phaseCanvas.setAttribute('aria-label','Phase portrait of '+idOf(s.threat)+': horizontal distance to contact in kilometers, vertical distance rate in kilometers per hour. '+
        segments.length+' smooth branches with arrows following time. Open ends mark derivative jumps; no lines connect across them. Lime marks now; cyan marks preview. '+
        (preview?'Preview: ':'Now: ')+reading+'. Final approach runs left toward zero distance at minus the asteroid speed.');
    }
    drawSlideRule(distance,speed,preview=false){
      const {c,w}=prepare(this.ruleCanvas),left=78,width=Math.max(1,w-86),right=left+width;
      const cy=31,dy=54;
      const valid=Number.isFinite(distance)&&distance>0&&Number.isFinite(speed)&&speed>0&&Number.isFinite(distance/speed)&&distance/speed>0;
      // A decade is a circle: shift C by log(d) - log(v), keeping D fixed.
      const phase=log=>{const f=log-Math.floor(log);return f<1e-12||1-f<1e-12?0:f;};
      const shift=valid?phase(Math.log10(distance)-Math.log10(speed)):0;
      const at=(value,moving)=>left+width*(moving?phase(Math.log10(value)+shift):Math.log10(value));
      c.fillStyle='#91afce09';c.fillRect(left,4,width,cy-4);
      line(c,{x:left,y:cy},{x:right,y:cy},C.cyan+'70');
      line(c,{x:left,y:dy},{x:right,y:dy},C.blue+'70');
      text(c,'C',12,cy-5,C.cyan,8);text(c,'km/h',30,cy-5,C.cyan,7);
      text(c,'D',12,dy+5,C.blue,8);text(c,'km',30,dy+5,C.blue,7);
      // Conventional subdivisions, thinned only when neighboring ticks are too close.
      const ticks=[];
      for(let n=100;n<=1000;n+=n<200?2:n<500?5:10)ticks.push(n);
      for(const moving of [true,false]){
        const baseline=moving?cy:dy,color=moving?C.cyan:C.blue;
        let previous=-Infinity;
        for(const n of ticks){
          if(moving&&n===1000)continue; // 10 and 1 share the wrapped C index.
          const v=n/100,major=n%100===0,half=n%100===50,medium=n%10===0,px=at(v,moving);
          const gap=width*Math.log10(v)-previous;
          if(!major&&!half&&gap<2.5)continue;
          previous=width*Math.log10(v);
          const length=major?13:half?12:medium?8:4;
          line(c,{x:px,y:baseline},{x:px,y:baseline+(moving?-length:length)},color+(major?'dd':half?'ff':'70'),half?1.8:major?1.3:1);
          if(major){
            const labelX=moving?Math.max(left+5,Math.min(right-5,px)):px;
            text(c,String(v),labelX,moving?10:78,color,7,!moving&&v===1?'left':!moving&&v===10?'right':'center');
          }
        }
      }
      if(!valid){
        this.ruleInfo=null;
        const message=distance===0&&speed>0?'t = 0 h · contact':'Awaiting route / speed';
        text(c,message,w/2,(cy+dy)/2,C.muted,7,'center');
        this.ruleCanvas.setAttribute('aria-label',message);return;
      }
      const hours=distance/speed,mantissa=10**shift,indexX=left+width*shift,operandX=left+width*phase(Math.log10(distance));
      // One hairline aligns the operands; the glowing index reads the quotient on D.
      const alignment='#7de8ff';
      c.save();c.shadowColor=alignment+'66';c.shadowBlur=6;
      line(c,{x:operandX,y:17},{x:operandX,y:dy+16},alignment,1.5,[2,2]);
      ring(c,{x:operandX,y:cy},3.5,alignment,1.6);ring(c,{x:operandX,y:dy},3.5,alignment,1.6);
      c.restore();
      c.save();c.shadowColor=C.lime+'70';c.shadowBlur=8;
      line(c,{x:indexX,y:17},{x:indexX,y:dy+14},C.lime,1.5);
      c.beginPath();c.moveTo(indexX,cy+4);c.lineTo(indexX-4,cy-2);c.lineTo(indexX+4,cy-2);c.closePath();c.fillStyle=C.lime;c.fill();
      c.restore();
      const label='t ≈ '+hours.toFixed(3)+' h';
      c.font='14px FlightMono, "Courier New", Courier, monospace';
      const boxWidth=c.measureText(label).width+8,boxX=Math.max(left,Math.min(right-boxWidth,indexX-boxWidth/2));
      c.fillStyle='#24301c';c.fillRect(boxX,cy+3,boxWidth,dy-cy-6);
      text(c,label,boxX+boxWidth/2,(cy+dy)/2,C.lime,8,'center');
      this.ruleInfo={distance,speed,hours,mantissa,shift,indexX,operandX,left,width,preview};
      this.ruleCanvas.setAttribute('aria-label','Slide rule: remaining '+(preview?'preview':'live')+' route including wraps, '+distance.toPrecision(4)+' kilometers divided by '+speed.toPrecision(4)+' kilometers per hour. Speed on C aligns with route distance on D. C index reads '+mantissa.toFixed(3)+' on D; the time callout shows '+hours.toFixed(3)+' hours until contact with the decimal placed correctly.');
    }
    getState(){return {selected:this.selected,routeSegments:this.routes.length,phase:this.state?.phase||0,heading:this.shipHeading,contacts:this.hits.map(p=>({...p})),distance:this.distanceInfo,slideRule:this.ruleInfo,livePasses:this.livePasses.map(p=>({...p})),instrument:this.instrument,phasePortrait:this.phaseInfo,derivativeVisible:this.derivativeVisible};}
  }
  root.FlightBoard=FlightBoard;
})(window);
