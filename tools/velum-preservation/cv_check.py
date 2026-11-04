"""Independent local CV diagnostics, with explicit missing-evidence handling.

Haar rectangles and ORB correspondences do not measure personal identity.
No learned pose/segmentation model is downloaded or approximated by a rating.
"""
import argparse
import json
from pathlib import Path
import cv2
import numpy as np


def analyze(path):
    image = cv2.imread(str(path))
    if image is None: raise ValueError('decode-failed')
    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades+'haarcascade_frontalface_default.xml')
    faces = cascade.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=5, minSize=(24, 24))
    detector = cv2.HOGDescriptor()
    detector.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
    boxes, weights = detector.detectMultiScale(image, winStride=(8, 8), padding=(8, 8), scale=1.05)
    people = [{'box': [int(x) for x in box], 'svm_margin': float(weight)}
              for box, weight in zip(boxes, weights) if float(weight) >= .5]
    orb = cv2.ORB_create(nfeatures=2000)
    keypoints, descriptors = orb.detectAndCompute(gray, None)
    return {'width': width, 'height': height,
            'face_boxes_normalized': [[round(float(v)/d, 5) for v, d in zip(box, [width, height, width, height])]
                                      for box in faces],
            'person_detections': people}, (image, keypoints, descriptors)


def compare(source, target):
    source_image, kp1, des1 = source
    target_image, kp2, des2 = target
    unknown = {'matched_points': 0, 'homography_inliers': None,
               'scene_registration_inlier_fraction': None,
               'camera_viewpoint_uncertainty': 1., 'pose_score': None,
               'silhouette_score': None, 'identity_score': None}
    if des1 is None or des2 is None: return unknown
    pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(des1, des2, k=2)
    good = [a for pair in pairs if len(pair) == 2 for a, b in [pair] if a.distance < .7*b.distance]
    unknown['matched_points'] = len(good)
    if len(good) >= 8:
        first = np.float32([kp1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        second = np.float32([kp2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
        homography, inliers = cv2.findHomography(first, second, cv2.RANSAC, 4.)
        if homography is not None and inliers is not None:
            count = int(inliers.sum())
            unknown['homography_inliers'] = count
            unknown['scene_registration_inlier_fraction'] = round(count/len(good), 5)
            # Background matches cannot calibrate camera/pose confidence. Keep
            # uncertainty at 1 instead of turning this fraction into a rating.
    return unknown


def evaluate(source_path, candidates):
    original, source_data = analyze(source_path)
    results = {}
    for label, path in candidates.items():
        summary, data = analyze(path)
        results[label] = {'detections': summary, 'relative_to_source': compare(source_data, data)}
    return {'method': 'OpenCV Haar face, HOG person, ORB-RANSAC scene registration',
            'opencv_version': cv2.__version__, 'source': original, 'candidates': results,
            'calibrated_pose_model_installed': False, 'calibrated_silhouette_model_installed': False,
            'biometric_identity_measured': False, 'owner_accepted': False,
            'limitations': 'Seated subjects, clothing, camera/framing changes and small faces defeat these detectors. Null means unmeasured, not failure or zero. ORB matches may be background only.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('candidates', nargs='+', help='label=path')
    args = parser.parse_args()
    result = evaluate(args.source, dict(item.split('=', 1) for item in args.candidates))
    with Path(args.output).open('x', encoding='utf-8') as file: json.dump(result, file, indent=2, allow_nan=False)
    print('CV_CHECK_RECORDED; no identity or owner-acceptance rating')
