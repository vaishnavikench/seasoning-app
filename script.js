let video = document.getElementById('video');
let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
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
    startVideoProcessing();
}

function analyzeFrame(src) {
    let triangleMask = new cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1);

    // Grayscale + edges
    let gray = new cv.Mat();
    let blur = new cv.Mat();
    let edges = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5,5), 0);
    cv.Canny(blur, edges, 50, 150);

    // Find contours
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // Detect largest triangle
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
                triangleContour = approx;
            }
        }
    }

    if(!triangleContour){
        // If no triangle, skip overlay
        gray.delete(); blur.delete(); edges.delete(); contours.delete(); hierarchy.delete();
        return;
    }

    cv.fillPoly(triangleMask, new cv.MatVector([triangleContour]), new cv.Scalar(255));

    // HSV conversion
    let hsv = new cv.Mat();
    cv.cvtColor(src, hsv, cv.COLOR_RGBA2HSV);

    // Masks for seasoned colors
    let lowerRed1 = new cv.Mat(hsv.rows,hsv.cols,hsv.type(),[0,50,50,0]);
    let upperRed1 = new cv.Mat(hsv.rows,hsv.cols,hsv.type(),[10,255,255,255]);
    let lowerRed2 = new cv.Mat(hsv.rows,hsv.cols,hsv.type(),[160,50,50,0]);
    let upperRed2 = new cv.Mat(hsv.rows,hsv.cols,hsv.type(),[180,255,255,255]);
    let lowerOrange = new cv.Mat(hsv.rows,hsv.cols,hsv.type(),[11,50,50,0]);
    let upperOrange = new cv.Mat(hsv.rows,hsv.cols,hsv.type(),[25,255,255,255]);
    let lowerYellow = new cv.Mat(hsv.rows,hsv.cols,hsv.type(),[26,50,50,0]);
    let upperYellow = new cv.Mat(hsv.rows,hsv.cols,hsv.type(),[35,255,255,255]);

    let maskRed1 = new cv.Mat(); cv.inRange(hsv, lowerRed1, upperRed1, maskRed1);
    let maskRed2 = new cv.Mat(); cv.inRange(hsv, lowerRed2, upperRed2, maskRed2);
    let maskOrange = new cv.Mat(); cv.inRange(hsv, lowerOrange, upperOrange, maskOrange);
    let maskYellow = new cv.Mat(); cv.inRange(hsv, lowerYellow, upperYellow, maskYellow);

    let seasonedMask = new cv.Mat();
    cv.bitwise_or(maskRed1, maskRed2, seasonedMask);
    cv.bitwise_or(seasonedMask, maskOrange, seasonedMask);
    cv.bitwise_or(seasonedMask, maskYellow, seasonedMask);

    cv.bitwise_and(seasonedMask, triangleMask, seasonedMask);

    let unseasonedMask = new cv.Mat();
    cv.bitwise_not(seasonedMask, unseasonedMask);
    cv.bitwise_and(unseasonedMask, triangleMask, unseasonedMask);

    // Count pixels
    let seasonedCount = cv.countNonZero(seasonedMask);
    let totalTriangle = cv.countNonZero(triangleMask);
    let percent = totalTriangle>0 ? (seasonedCount/totalTriangle*100).toFixed(2) : 0;
    percentageDiv.innerText = `Seasoning %: ${percent}%`;

    // Overlay colors
    for(let i=0;i<src.rows;i++){
        for(let j=0;j<src.cols;j++){
            if(triangleMask.ucharPtr(i,j)[0]===0) continue;
            if(seasonedMask.ucharPtr(i,j)[0]!==0){
                src.ucharPtr(i,j)[0]=255; src.ucharPtr(i,j)[1]=0; src.ucharPtr(i,j)[2]=0;
            } else {
                src.ucharPtr(i,j)[0]=255; src.ucharPtr(i,j)[1]=255; src.ucharPtr(i,j)[2]=0;
            }
        }
    }

    cv.imshow(canvas, src);

    // Cleanup
    gray.delete(); blur.delete(); edges.delete(); contours.delete(); hierarchy.delete();
    triangleContour.delete(); triangleMask.delete(); hsv.delete();
    maskRed1.delete(); maskRed2.delete(); maskOrange.delete(); maskYellow.delete();
    seasonedMask.delete(); unseasonedMask.delete();
}

function startVideoProcessing(){
    function processFrame(){
        if(video.readyState===video.HAVE_ENOUGH_DATA){
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video,0,0,canvas.width,canvas.height);
            let src = cv.imread(canvas);
            analyzeFrame(src);
            src.delete();
        }
        requestAnimationFrame(processFrame);
    }
    requestAnimationFrame(processFrame);
}

// Image upload
uploadBtn.addEventListener('click', ()=>{
    if(fileInput.files.length===0){ alert("Select image"); return; }
    let img = new Image();
    img.onload = ()=>{
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img,0,0);
        let src = cv.imread(canvas);
        analyzeFrame(src);
        src.delete();
    };
    img.src = URL.createObjectURL(fileInput.files[0]);
});
