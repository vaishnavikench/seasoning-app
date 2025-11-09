// analysis.js - triangle detection + seasoning analysis using OpenCV.js
// Exposes: analyzeElementAndShow(element, overlayCanvas, resultElement)

let cvReady = false;
if (typeof cv !== 'undefined') {
  if (cv.getBuildInformation) {
    cvReady = true;
    console.log('OpenCV ready');
  } else {
    cv['onRuntimeInitialized'] = () => { cvReady = true; console.log('OpenCV ready'); };
  }
}

function waitForCv(max=5000){
  return new Promise((res,rej)=>{
    const start = Date.now();
    (function chk(){
      if (cvReady) return res(true);
      if (Date.now()-start > max) return rej(new Error('OpenCV timeout'));
      setTimeout(chk,100);
    })();
  });
}

// helper: draw overlay imageData onto canvas but keep transparency
function putOverlayImage(overlayCanvas, overlayImageData){
  overlayCanvas.getContext('2d').putImageData(overlayImageData,0,0);
}

// main wrapper
async function analyzeElementAndShow(element, overlayCanvas, resultElement){
  try {
    await waitForCv();
  } catch(e){
    alert('OpenCV failed to load. Reload page.');
    console.error(e); return;
  }

  // draw element into temp canvas
  const tmp = document.createElement('canvas');
  const w = element.videoWidth || element.naturalWidth || element.width;
  const h = element.videoHeight || element.naturalHeight || element.height;
  if (!w || !h){ alert('Image not ready'); return; }
  tmp.width = w; tmp.height = h;
  const tctx = tmp.getContext('2d');
  tctx.drawImage(element, 0, 0, w, h);

  // ensure overlay canvas pixel size matches
  overlayCanvas.width = w; overlayCanvas.height = h;
  overlayCanvas.style.width = Math.min(w,420) + 'px';
  overlayCanvas.style.height = Math.min(h,420) + 'px';
  const octx = overlayCanvas.getContext('2d');
  octx.clearRect(0,0,w,h);

  // convert canvas to OpenCV Mat
  let src = cv.imread(tmp);
  let srcRGBA = src.clone();

  // 1) find chip mask via edge/contour detection
  let gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  let blur = new cv.Mat();
  cv.GaussianBlur(gray, blur, new cv.Size(5,5), 0);

  let edges = new cv.Mat();
  cv.Canny(blur, edges, 60, 160);

  // morphological close to fill chip holes
  let M = cv.Mat.ones(7,7,cv.CV_8U);
  cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, M);

  // find contours
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  // choose largest contour by area
  let largestIdx = -1, largestArea = 0;
  for (let i=0;i<contours.size();i++){
    let cnt = contours.get(i);
    let area = cv.contourArea(cnt);
    if (area > largestArea){ largestArea = area; largestIdx = i; }
    cnt.delete();
  }

  // prepare chipMask (single-channel)
  let chipMask = new cv.Mat.zeros(h, w, cv.CV_8UC1);
  if (largestIdx !== -1 && largestArea > 2000) {
    let cnt = contours.get(largestIdx);
    // approximate polygon
    let peri = cv.arcLength(cnt, true);
    let approx = new cv.Mat();
    cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

    // If approx polygon has 3 vertices -> triangle
    let ptsMat = null;
    if (approx.rows === 3) {
      ptsMat = approx.clone();
    } else {
      // try convex hull then approximate to triangle
      let hull = new cv.Mat();
      cv.convexHull(cnt, hull, false, true);
      let approx2 = new cv.Mat();
      cv.approxPolyDP(hull, approx2, 0.04 * peri, true);
      if (approx2.rows >= 3){
        ptsMat = approx2.clone();
      } else {
        // fallback: use original contour
        ptsMat = cnt.clone();
      }
      hull.delete(); approx2.delete();
    }

    // fill polygon into chipMask
    let contVec = new cv.MatVector();
    contVec.push_back(ptsMat);
    cv.fillPoly(chipMask, contVec, new cv.Scalar(255,255,255));
    contVec.delete();
    ptsMat.delete();
    cnt.delete();
    approx.delete();
  } else {
    // fallback: center crop rectangle mask if no contour found
    let sx = Math.floor(w*0.08), sy = Math.floor(h*0.18);
    let cw = Math.floor(w*0.84), ch = Math.floor(h*0.5);
    let pts = cv.matFromArray(4,1,cv.CV_32SC2, [sx,sy, sx+cw,sy, sx+cw,sy+ch, sx,sy+ch]);
    let pv = new cv.MatVector(); pv.push_back(pts);
    cv.fillPoly(chipMask, pv, new cv.Scalar(255,255,255));
    pv.delete(); pts.delete();
  }

  // 2) Seasoning detection inside chipMask using HSV + dark speckle adaptive
  let hsv = new cv.Mat();
  cv.cvtColor(srcRGBA, hsv, cv.COLOR_RGBA2RGB);
  cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

  // Seasoning color bounds (orange-red-yellow zone)
  let lowSeason = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [5, 60, 20]);
  let highSeason = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [40, 255, 255]);
  let seasonMask = new cv.Mat();
  cv.inRange(hsv, lowSeason, highSeason, seasonMask);

  // Compute V-channel mean inside chip to detect dark speckles adaptively
  let hsvPlanes = new cv.MatVector();
  cv.split(hsv, hsvPlanes);
  let vplane = hsvPlanes.get(2); // V

  // compute mean V only inside chipMask
  let chipCount = cv.countNonZero(chipMask);
  let meanV = 255;
  if (chipCount > 0) {
    let sum = 0;
    for (let y=0; y<h; y++){
      for (let x=0; x<w; x++){
        if (chipMask.ucharPtr(y,x)[0] > 0) sum += vplane.ucharPtr(y,x)[0];
      }
    }
    meanV = sum / chipCount;
  }

  // dark speckles mask
  let darkMask = new cv.Mat();
  let darkThresh = Math.max(12, Math.round(meanV * 0.92));
  cv.threshold(vplane, darkMask, darkThresh, 255, cv.THRESH_BINARY_INV);

  // Combine seasoning OR dark speckles, then restrict to chip
  let combined = new cv.Mat();
  cv.bitwise_or(seasonMask, darkMask, combined);
  cv.bitwise_and(combined, chipMask, combined);

  // Count pixels
  let seasonPixels = cv.countNonZero(combined);
  let chipPixels = cv.countNonZero(chipMask);
  let coverage = chipPixels ? (seasonPixels / chipPixels) * 100 : 0;

  // Draw overlay: get original image then paint red & blue
  // We'll create an overlay ImageData and draw filled pixels
  const overlayImg = new ImageData(w, h);
  // init transparent
  for (let i=0;i<w*h;i++){
    overlayImg.data[i*4+0]=0; overlayImg.data[i*4+1]=0; overlayImg.data[i*4+2]=0; overlayImg.data[i*4+3]=0;
  }
  // Seasoned -> red, Unseasoned -> blue (only inside chip)
  for (let y=0;y<h;y++){
    for (let x=0;x<w;x++){
      const idx = y*w + x;
      const maskVal = chipMask.ucharPtr(y,x)[0];
      if (maskVal > 0) {
        if (combined.ucharPtr(y,x)[0] > 0) {
          // seasoned
          overlayImg.data[idx*4+0] = 255;
          overlayImg.data[idx*4+1] = 0;
          overlayImg.data[idx*4+2] = 0;
          overlayImg.data[idx*4+3] = 160;
        } else {
          // unseasoned (inside chip)
          overlayImg.data[idx*4+0] = 0;
          overlayImg.data[idx*4+1] = 120;
          overlayImg.data[idx*4+2] = 255;
          overlayImg.data[idx*4+3] = 120;
        }
      }
    }
  }

  // draw overlay onto overlayCanvas
  octx.putImageData(overlayImg, 0, 0);

  // update result text
  if (resultElement && resultElement instanceof HTMLElement) {
    resultElement.textContent = `Coverage: ${coverage.toFixed(1)}%`;
  }

  // cleanup mats
  src.delete(); srcRGBA.delete(); gray.delete(); blur.delete(); edges.delete();
  M.delete(); contours.delete(); hierarchy.delete(); chipMask.delete();
  hsv.delete(); lowSeason.delete(); highSeason.delete(); seasonMask.delete();
  hsvPlanes.delete(); vplane.delete(); darkMask.delete(); combined.delete();

  return {coverage, seasonPixels, chipPixels};
}

