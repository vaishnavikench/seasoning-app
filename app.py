from flask import Flask, render_template, request, jsonify
import cv2
import numpy as np
import base64
from io import BytesIO
from PIL import Image

app = Flask(__name__)

def detect_triangle_and_seasoning(image):
    # Convert to HSV for color detection
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    # Mask for reddish/orange/light colors (seasoned)
    lower_orange = np.array([0, 50, 50])
    upper_orange = np.array([25, 255, 255])
    mask = cv2.inRange(hsv, lower_orange, upper_orange)

    # Detect contours to find the triangle
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY_INV)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    triangle_contour = None
    max_area = 0
    for cnt in contours:
        approx = cv2.approxPolyDP(cnt, 0.03 * cv2.arcLength(cnt, True), True)
        area = cv2.contourArea(approx)
        if len(approx) == 3 and area > max_area:
            triangle_contour = approx
            max_area = area

    if triangle_contour is None:
        return None, 0, image

    # Create mask for triangle
    triangle_mask = np.zeros_like(gray)
    cv2.drawContours(triangle_mask, [triangle_contour], -1, 255, -1)

    # Count seasoned pixels inside triangle
    seasoned_pixels = cv2.countNonZero(cv2.bitwise_and(mask, mask, mask=triangle_mask))
    total_pixels = cv2.countNonZero(triangle_mask)
    coverage = (seasoned_pixels / total_pixels) * 100 if total_pixels > 0 else 0

    # Prepare output image
    output = np.zeros_like(image)
    # Red for seasoned
    output[np.where(cv2.bitwise_and(mask, mask, mask=triangle_mask) > 0)] = [0, 0, 255]
    # Blue for unseasoned
    unseasoned_mask = cv2.bitwise_and(triangle_mask, cv2.bitwise_not(mask))
    output[np.where(unseasoned_mask > 0)] = [255, 0, 0]
    # Overlay triangle contour
    cv2.drawContours(output, [triangle_contour], -1, (0, 255, 0), 2)

    return output, coverage, triangle_contour

def read_image(file_stream):
    image = Image.open(file_stream)
    image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    return image

def encode_image_to_base64(img):
    _, buffer = cv2.imencode('.jpg', img)
    img_str = base64.b64encode(buffer).decode('utf-8')
    return img_str

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload():
    file = request.files['image']
    image = read_image(file)
    processed_image, coverage, _ = detect_triangle_and_seasoning(image)
    img_str = encode_image_to_base64(processed_image)
    return jsonify({'image': img_str, 'coverage': round(coverage, 2)})

@app.route('/capture', methods=['POST'])
def capture():
    data_url = request.json['imageBase64']
    header, encoded = data_url.split(",", 1)
    img_data = base64.b64decode(encoded)
    image = Image.open(BytesIO(img_data))
    image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    
    processed_image, coverage, _ = detect_triangle_and_seasoning(image)
    img_str = encode_image_to_base64(processed_image)
    return jsonify({'image': img_str, 'coverage': round(coverage, 2)})

if __name__ == '__main__':
    app.run(debug=True)
