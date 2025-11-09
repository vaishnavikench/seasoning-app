let video = document.getElementById('video');
let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
let captureBtn = document.getElementById('captureBtn');
let uploadBtn = document.getElementById('uploadBtn');
let fileInput = document.getElementById('fileInput');
let percentageDiv = document.getElementById('percentage');

// Start back camera
navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: "environment" } } })
.then(stream => video.srcObject = stream)
.catch(err => {
    console.log("Back camera not found, using default camera.", err);
    navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => video.srcObject = stream);
});

function onOpenCvReady() {
    console.log('OpenCV.js ready');
}

// Convert RGB to HSV
function rgbToHsv(r,g,b){
    r/=255; g/=255; b/=255;
    let max=Math.max(r,g,b), min=Math.min(r,g,b), h, s, v=max, d=max-min;
    s = max===0 ? 0 : d/max;
    if(max===min) h=0;
    else{
        switch(max){
            case r: h=(g-b)/d + (g<b?6:0); break;
            case g: h=(b-r)/d +2; break;
            case b: h=(r-g)/d +4; break;
        }
        h/=6;
    }
    return [h*360, s, v*255];
}

function analyzeMat(src){
    let gray = new cv.Mat();
    let blurred = new cv.Mat();
    let edges = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.GaussianBlur(gray, blurred, new cv.Size(5,5),0);
    cv.Canny(blurred, edges, 50,150);

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let maxArea = 0;
    let triangleContour = null;
    for(let i=0;i<contours.size();i++){
        let cnt = contours.get(i);
        let approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02*cv.arcLength(cnt,true), true);
        if(approx.rows===3){
            let area = cv.contourArea(approx);
            if(area>maxArea){
                maxArea = area;
                triangleContour=approx;
            }
        }
    }

    if(!triangleContour){
        alert("Triangle not detected! Ensure collet is clearly visible.");
        gray.delete(); blurred.delete(); edges.delete(); contours.delete(); hierarchy.delete();
        return;
    }

    let mask = new cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1);
    cv.fillPoly(mask, new cv.MatVector([triangleContour]), new cv.Scalar(255));

    let seasonedCount=0, totalCount=0;
    for(let i=0;i<src.rows;i++){
        for(let j=0;j<src.cols;j++){
            if(mask.ucharPtr(i,j)[0]===0) continue;
            let px = src.ucharPtr(i,j);
            let [h,s,v] = rgbToHsv(px[0], px[1], px[2]);
            totalCount++;
            if(v>200 && s<0.2){
                px[0]=255; px[1]=255; px[2]=0; // yellow for unseasoned
            } else {
                px[0]=255; px[1]=0; px[2]=0; // red for seasoned
                seasonedCount++;
            }
        }
    }

    let percent = totalCount>0 ? (seasonedCount/totalCount*100).toFixed(2) : 0;
    percentageDiv.innerText = `Seasoning %: ${percent}%`;

    cv.imshow(canvas, src);

    gray.delete(); blurred.delete(); edges.delete(); contours.delete(); hierarchy.delete(); mask.delete(); triangleContour.delete();
}

// Live capture
captureBtn.addEventListener('click', ()=>{
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    let src = cv.imread(canvas);
    analyzeMat(src);
    src.delete();
});

// Image upload
uploadBtn.addEventListener('click', ()=>{
    if(fileInput.files.length===0){ alert("Select image"); return; }
    let img = new Image();
    img.onload = ()=>{
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img,0,0);
        let src = cv.imread(canvas);
        analyzeMat(src);
        src.delete();
    };
    img.src = URL.createObjectURL(fileInput.files[0]);
});
