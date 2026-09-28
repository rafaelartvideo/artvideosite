import test from "node:test";
import assert from "node:assert/strict";
import { findLogoVisibleBounds } from "./logo-visible-bounds.mjs";

function imageData(width, height, fill = [255, 255, 255, 0]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) data.set(fill, index * 4);
  return data;
}

function setPixel(data, width, x, y, rgba) {
  data.set(rgba, (y * width + x) * 4);
}

test("ignores transparent margins around visible logo content", () => {
  const width = 10;
  const height = 8;
  const data = imageData(width, height);

  for (let y = 2; y <= 5; y++) {
    for (let x = 3; x <= 7; x++) setPixel(data, width, x, y, [0, 87, 231, 255]);
  }

  assert.deepEqual(findLogoVisibleBounds({ data, width, height }), {
    left: 3,
    top: 2,
    right: 7,
    bottom: 5,
  });
});

test("ignores near-white solid margins for logos exported on white canvas", () => {
  const width = 12;
  const height = 10;
  const data = imageData(width, height, [255, 255, 255, 255]);

  for (let y = 3; y <= 6; y++) {
    for (let x = 2; x <= 9; x++) setPixel(data, width, x, y, [13, 27, 46, 255]);
  }

  assert.deepEqual(findLogoVisibleBounds({ data, width, height }), {
    left: 2,
    top: 3,
    right: 9,
    bottom: 6,
  });
});
