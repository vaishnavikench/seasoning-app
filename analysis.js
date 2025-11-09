export function analyzeImage(ctx, overlayCtx, width, height, coverageLbl) {
    // Get raw image
    const src = new cv.Mat(height, width, cv.CV_8UC4);
    const imgData = ctx.getImageData(0, 0, width, height);
    src.data.set(imgData.data);

    // Convert to HSV
    let hsv = new cv.Mat();
    cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
    cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

    // --- STEP 1: Detect Triangle Shape (Chip Mask) ---
    let chipMask = new cv.Mat();
    let lowChip = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [5, 30, 50]);   // allow pale orange
    let highChip = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [30, 255, 255]);
    cv.inRange(hsv, lowChip, highChip, chipMask);

    // Clean noise
    let kernel = cv.Mat.ones(9, 9, cv.CV_8U);
    cv.morphologyEx(chipMask, chipMask, cv.MORPH_CLOSE, kernel);

    // Find contours
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(chipMask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let largest = null;
    let largestArea = 0;
    for (let i = 0; i < contours.size(); i++) {
        let cnt = contours.get(i);
        let area = cv.contourArea(cnt);
        if (area > largestArea) {
            largestArea = area;
            largest = cnt;
        }
    }

    // Approximate to triangle
    let triangle = new cv.Mat();
    if (largest) {
        let peri = cv.arcLength(largest, true);
        cv.approxPolyDP(largest, triangle, 0.04 * peri, true);
    }

    // Create final chip mask (exact triangle only)
    let finalChipMask = cv.Mat.zeros(height, width, cv.CV_8UC1);
    if (triangle.rows === 3) {
        let polyPoints = [];
        for (let i = 0; i < 3; i++) {
            polyPoints.push(new cv.Point(triangle.intAt(i, 0), triangle.intAt(i, 1)));
        }
        let pts = cv.matFromArray(1, 3, cv.CV_32SC2, polyPoints.flatMap(p=>[p.x,p.y]));
        cv.fillPoly(finalChipMask, pts, new cv.Scalar(255,255,255));
        pts.delete();
    }

    // --- STEP 2: Detect Seasoning inside triangle only ---
    let seasoningMask = new cv.Mat();
    let lowSeason = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [5, 60, 20]);
    let highSeason = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [30, 255, 255]);
    cv.inRange(hsv, lowSeason, highSeason, seasoningMask);

    cv.bitwise_and(seasoningMask, finalChipMask, seasoningMask);

    // Coverage %
    let chipPixels = cv.countNonZero(finalChipMask);
    let seasonPixels = cv.countNonZero(seasoningMask);
    let coverage = chipPixels ? ((seasonPixels / chipPixels) * 100).toFixed(1) : 0;
    coverageLbl.textContent = `Coverage: ${coverage}%`;

    // --- STEP 3: Draw Overlay ---
    overlayCtx.clearRect(0,0,width,height);
    let overlayImage = new ImageData(new Uint8ClampedArray(imgData.data), width, height);
    overlayCtx.putImageData(overlayImage, 0, 0);

    let red = overlayCtx.getImageData(0, 0, width, height);
    let rd = red.data;
    let sm = seasoningMask.data;

    for (let i = 0; i < sm.length; i++) {
        if (sm[i] > 0) {
            rd[i*4] = 255;
            rd[i*4+1] = 0;
            rd[i*4+2] = 0;
            rd[i*4+3] = 180;
        }
    }

    overlayCtx.putImageData(red, 0, 0);

    // Cleanup
    src.delete(); hsv.delete(); chipMask.delete(); seasoningMask.delete(); finalChipMask.delete();
    contours.delete(); hierarchy.delete(); kernel.delete(); triangle.delete();
}
