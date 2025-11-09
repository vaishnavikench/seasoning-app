function rgbToHsv(r,g,b){
  r/=255; g/=255; b/=255;
  let max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min, h=0;
  let s = max===0?0:d/max, v=max;
  if (d!==0){
    switch(max){
      case r: h=(g-b)/d + (g<b?6:0); break;
      case g: h=(b-r)/d + 2; break;
      case b: h=(r-g)/d + 4; break;
    }
    h*=60;
  }
  return [h, s*100, v*100];
}

// Shared mask logic (improved)
function analyzeCanvas(ctx, w, h, overlayCtx){
  const img = ctx.getImageData(0,0,w,h);
  const d = img.data;
  const prodMask = new Uint8Array(w*h);

  // COLLET MASK (ignore background)
  for(let i=0,k=0;i<d.length;i+=4,k++){
    const v=(d[i]+d[i+1]+d[i+2])/3;
    prodMask[k] = v < 210 ? 1 : 0;   // background is bright
  }

  // largest connected region = collet
  let visited=new Uint8Array(w*h), best=[];
  function dfs(start){
    let stack=[start], comp=[];
    visited[start]=1;
    while(stack.length){
      let p=stack.pop();
      comp.push(p);
      let x=p%w, y=(p/w)|0;
      [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dy])=>{
        let nx=x+dx, ny=y+dy, np=ny*w+nx;
        if(nx>=0&&nx<w&&ny>=0&&ny<h && prodMask[np] && !visited[np]){
          visited[np]=1; stack.push(np);
        }
      });
    }
    return comp;
  }
  for(let i=0;i<w*h;i++){
    if(prodMask[i] && !visited[i]){
      let comp = dfs(i);
      if(comp.length > best.length) best = comp;
    }
  }
  const mask = new Uint8Array(w*h);
  best.forEach(p=> mask[p]=1);

  // seasoning classification
  let seasoned=0, total=best.length;
  overlayCtx.clearRect(0,0,w,h);
  overlayCtx.globalAlpha=0.55;

  for(let p of best){
    let i=p*4;
    let r=d[i], g=d[i+1], b=d[i+2];
    let [hue,s,v]=rgbToHsv(r,g,b);

    if (s>25 && v>35 && (hue < 50 || hue > 330)){ // wide orange-red range
      overlayCtx.fillStyle="red";
      seasoned++;
    } else {
      overlayCtx.fillStyle="blue";
    }
    overlayCtx.fillRect(p%w, (p/w)|0,1,1);
  }

  overlayCtx.globalAlpha=1;
  return (seasoned/total)*100;
}


// ====== LIVE ======
function startCamera(){
  navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}})
  .then(stream=>{
    let v=document.getElementById("video");
    v.srcObject=stream;
  });
}

function analyzeLive(){
  let v=document.getElementById("video");
  let c=document.createElement("canvas");
  c.width=v.videoWidth; c.height=v.videoHeight;
  let ctx=c.getContext("2d");
  ctx.drawImage(v,0,0);
  let overlay=document.getElementById("overlayCanvas").getContext("2d");
  let coverage=analyzeCanvas(ctx,c.width,c.height,overlay);
  document.getElementById("result").innerText="Coverage: "+coverage.toFixed(1)+"%";
}

// ====== UPLOAD ======
function analyzeImage(img){
  let c=document.createElement("canvas");
  c.width=img.naturalWidth; c.height=img.naturalHeight;
  let ctx=c.getContext("2d");
  ctx.drawImage(img,0,0);
  let overlay=document.getElementById("overlayCanvas").getContext("2d");
  let coverage=analyzeCanvas(ctx,c.width,c.height,overlay);
  document.getElementById("result").innerText="Coverage: "+coverage.toFixed(1)+"%";
}

