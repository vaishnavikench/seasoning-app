const fileInput = document.getElementById('fileInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const percentageDiv = document.getElementById('percentage');
const video = document.getElementById('video');
const captureBtn = document.getElementById('captureBtn');

// Start camera
navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => video.srcObject = stream)
  .catch(err => console.error("Camera error:", err));

// Convert RGB to HSV
function rgbToHsv(r, g, b){
  r/=255; g/=255; b/=255;
  let max = Math.max(r,g,b), min=Math.min(r,g,b);
  let h, s, v=max;
  let d = max-min;
  s = max === 0 ? 0 : d/max;
  if(max === min) h=0;
  else{
    switch(max){
      case r: h = (g-b)/d + (g<b?6:0); break;
      case g: h = (b-r)/d + 2; break;
      case b: h = (r-g)/d +4; break;
    }
    h /= 6;
  }
  return [h*360, s, v];
}

// Check if pixel is seasoned (red/orange)
function isSeasoned(r,g,b){
  const hsv = rgbToHsv(r,g,b);
  const h = hsv[0], s = hsv[1], v = hsv[2];
  return ((h >= 0 && h <= 30) || (h >= 330 && h <= 360)) && s > 0.35 && v > 0.25;
}

// Check if pixel is unseasoned (white/yellow)
function isUnseasoned(r,g,b){
  const hsv = rgbToHsv(r,g,b);
  const h = hsv[0], s = hsv[1], v = hsv[2];
  return ((h >= 25 && h <= 60 && s > 0.2 && v > 0.6) || (s < 0.2 && v > 0.7));
}

// Apply simple blur to reduce noise
function blurImage(imageData, w, h){
  let data = imageData.data;
  let copy = new Uint8ClampedArray(data);
  const kernel = [-1,0,1];
  for(let y=1; y<h-1; y++){
    for(let x=1; x<w-1; x++){
      let idx = (y*w + x)*4;
      let r=0,g=0,b=0;
      for(let ky=-1;ky<=1;ky++){
        for(let kx=-1;kx<=1;kx++){
          let kidx = ((y+ky)*w + (x+kx))*4;
          r += copy[kidx]; g += copy[kidx+1]; b += copy[kidx+2];
        }
      }
      data[idx]=r/9; data[idx+1]=g/9; data[idx+2]=b/9;
    }
  }
}

// Main analysis
function analyzeImage(img){
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img,0,0);
  let imageData = ctx.getImageData(0,0,canvas.width,canvas.height);

  blurImage(imageData, canvas.width, canvas.height);

  let data = imageData.data;
  let seasonedCount=0, unseasonedCount=0;

  for(let i=0;i<data.length;i+=4){
    let r=data[i], g=data[i+1], b=data[i+2];
    let brightness = (r+g+b)/3;
    if(brightness<20) continue; // ignore dark pixels (background/shadows)
    if(isSeasoned(r,g,b)){
      seasonedCount++;
      data[i]=255; data[i+1]=0; data[i+2]=0; // red overlay
    } else if(isUnseasoned(r,g,b)){
      unseasonedCount++;
      data[i]=255; data[i+1]=255; data[i+2]=0; // yellow overlay
    }
  }

  ctx.putImageData(imageData,0,0);

  let total = seasonedCount + unseasonedCount;
  let percent = total>0 ? (seasonedCount/total*100).toFixed(2) : 0;
  percentageDiv.innerText = `Seasoning %: ${percent}%`;
}

// Upload image
analyzeBtn.addEventListener('click', ()=>{
  if(fileInput.files.length===0){ alert("Select image"); return; }
  let img = new Image();
  img.onload = ()=> analyzeImage(img);
  img.src = URL.createObjectURL(fileInput.files[0]);
});

// Capture from camera
captureBtn.addEventListener('click', ()=>{
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  let img = new Image();
  img.onload = ()=> analyzeImage(img);
  img.src = canvas.toDataURL();
});
