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

function analyzeMat(src) {
    let triangleMask = new cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC1);

    // Convert to grayscale & detect edges
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
        alert("Triangle not detected! Ensure collet is visible.");
        gray.delete(); blur.delete(); edges.delete(); contours.delete(); hierarchy.delete();
        return;
    }

    // Fill triangle mask
    cv.fillPoly(triangleMask, new cv.MatVector([triangleContour]), new cv.Scalar(255));

    // Convert to HSV for color masking
    let hsv = new cv.Mat();
    cv.cvtColor(src, hsv, cv.COLOR_RGBA2HSV);

    // Seasoned mask (red/orange/yellow)
    let lowerRed1 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 50, 50, 0]);
    let upperRed1 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [10, 255, 255, 255]);
    let lowerRed2 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [160, 50, 50, 0]);
    let upperRed2 = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, 255, 255, 255]);
    let lowerOrange = new cv
