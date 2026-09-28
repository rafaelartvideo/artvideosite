function cornerBackground(data, width, height) {
  const points = [
    [0, 0],
    [Math.max(0, width - 1), 0],
    [0, Math.max(0, height - 1)],
    [Math.max(0, width - 1), Math.max(0, height - 1)],
  ];
  const sum = [0, 0, 0, 0];

  for (const [x, y] of points) {
    const offset = (y * width + x) * 4;
    for (let channel = 0; channel < 4; channel++) {
      sum[channel] += data[offset + channel] || 0;
    }
  }

  return sum.map(value => value / points.length);
}

export function findLogoVisibleBounds({ data, width, height }) {
  if (!data || width <= 0 || height <= 0) return null;

  const [bgR, bgG, bgB, bgA] = cornerBackground(data, width, height);
  const transparentBackground = bgA < 32;
  const lightBackground = bgA > 220 && bgR > 238 && bgG > 238 && bgB > 238;

  if (!transparentBackground && !lightBackground) {
    return { left: 0, top: 0, right: width - 1, bottom: height - 1 };
  }

  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = data[offset + 3];

      let visible = false;
      if (transparentBackground) {
        visible = a > 24;
      } else if (a > 24) {
        const colorDelta = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
        visible = colorDelta > 36 || Math.abs(a - bgA) > 24;
      }

      if (!visible) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < left || bottom < top) {
    return { left: 0, top: 0, right: width - 1, bottom: height - 1 };
  }

  return { left, top, right, bottom };
}
