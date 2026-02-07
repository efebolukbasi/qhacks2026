"""Generate a simple test chalkboard image for demo/testing purposes."""

import cv2
import numpy as np

# Create a dark green "chalkboard" background
img = np.full((480, 640, 3), (50, 80, 50), dtype=np.uint8)

# Add some white "chalk" text
cv2.putText(img, "Lecture 1: Intro to ML", (30, 80), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (220, 220, 220), 2)
cv2.putText(img, "- Supervised Learning", (50, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)
cv2.putText(img, "- Unsupervised Learning", (50, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)
cv2.putText(img, "- Reinforcement Learning", (50, 250), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 2)
cv2.putText(img, "y = mx + b", (50, 340), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (230, 230, 230), 2)
cv2.putText(img, "Loss = sum(y - y_hat)^2", (50, 410), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (210, 210, 210), 2)

cv2.imwrite("test_chalkboard.jpg", img)
print("Created test_chalkboard.jpg")
