const video = document.getElementById("cameraView");
const uploadedImg = document.getElementById("uploadedImg");
const canvas = document.getElementById("outputCanvas");
const ctx = canvas.getContext("2d");

const startCameraBtn = document.getElementById("startCameraBtn");
const captureBtn = document.getElementById("captureBtn");
const fileInput = document.getElementById("fileInput");

const seasonedValue = document.getElementById("seasonedValue");
const unseasonedValue = document.getElementById("unseasonedValue");

let stream = null;

// Start Camera
startCameraBtn.addEventListener("click", async () => {
  video.style.display = "block";
  uploadedImg.style.display = "none";

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;
  } catch (err) {
    alert("Camera access denied. Enable camera permission in browser settings.");
  }
});

// Capture / Analyze Live Camera
captureBtn.addEventListener("click", () => {
  video.style.display = "block";
  uploadedImg.style.display = "none";

  if (video.readyState < 2) return;

  analyzeFrame(video);
});

// Upload Image
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  uploadedImg.src = url;
  uploadedImg.style.display = "block";
  video.style.display = "none";

  uploadedImg.onload = () => analyzeFrame(uploadedImg);
});

// MAIN ANALYSIS FUNCTION
function analyzeFrame(source) {
  canvas.width = source.videoWidth || source.naturalWidth;
  canvas.height = source.videoHeight || source.naturalHeight;

  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  let seasoned = 0, unseasoned = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];

    // seasoning color detection: RED to ORANGE tolerance
    const isSeasoned = (r > 150 && g > 60 && b < 80); // auto-tunable

    if (isSeasoned) {
      seasoned++;
      data[i] = 255; data[i+1] = 0; data[i+2] = 0; // Show mask overlay (red)
    } else {
      unseasoned++;
      // keep original pixel (white stays white)
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const total = seasoned + unseasoned;
  seasonedValue.innerText = ((seasoned / total) * 100).toFixed(1) + "%";
  unseasonedValue.innerText = ((unseasoned / total) * 100).toFixed(1) + "%";
}
