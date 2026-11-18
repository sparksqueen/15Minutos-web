"use strict";

window.GameGeometry = (() => {
  function bounds(points) {
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  function translate([left, bottom, right, top], x, y) {
    return [left + x, bottom + y, right + x, top + y];
  }

  function overlaps([l, b, r, t], [left, bottom, right, top]) {
    return l < right && r > left && b < top && t > bottom;
  }

  function colliderPaths(entity) {
    const [a, b, c, d] = entity.matrix;
    return (entity.colliders || []).flatMap(({ trigger, edge, paths }) => paths.map(path => {
      const points = path.map(([x, y]) => [a * x + c * y, b * x + d * y]);
      return { trigger, edge: Boolean(edge), points, bounds: bounds(points) };
    }));
  }

  function clip(points, axis, edge, sign) {
    if (!points.length) return points;
    const inside = point => (point[axis] - edge) * sign >= 0;
    let from = points.at(-1);
    const result = [];
    for (const to of points) {
      if (inside(from) !== inside(to)) {
        const ratio = (edge - from[axis]) / (to[axis] - from[axis]);
        result.push([from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio]);
      }
      if (inside(to)) result.push(to);
      from = to;
    }
    return result;
  }

  function edgeOverlap(path, x, y, box) {
    const [left, bottom, right, top] = translate(box, -x, -y);
    let length = 0;
    for (let i = 1; i < path.points.length; i++) {
      const [ax, ay] = path.points[i - 1];
      const [bx, by] = path.points[i];
      const dx = bx - ax;
      const dy = by - ay;
      if ((dx === 0 && (ax <= left || ax >= right)) || (dy === 0 && (ay <= bottom || ay >= top))) continue;
      const xNear = dx ? Math.min((left - ax) / dx, (right - ax) / dx) : 0;
      const xFar = dx ? Math.max((left - ax) / dx, (right - ax) / dx) : 1;
      const yNear = dy ? Math.min((bottom - ay) / dy, (top - ay) / dy) : 0;
      const yFar = dy ? Math.max((bottom - ay) / dy, (top - ay) / dy) : 1;
      const fraction = Math.min(1, xFar, yFar) - Math.max(0, xNear, yNear);
      if (fraction > 0) length += fraction * Math.hypot(dx, dy);
    }
    return length;
  }

  function intersection(path, x, y, box) {
    if (!overlaps(translate(path.bounds, x, y), box)) return 0;
    if (path.edge) return edgeOverlap(path, x, y, box);
    const [l, b, r, t] = translate(box, -x, -y);
    let points = clip(path.points, 0, l, 1);
    points = clip(points, 0, r, -1);
    points = clip(points, 1, b, 1);
    points = clip(points, 1, t, -1);
    if (points.length < 3) return 0;
    let area = 0;
    let [lastX, lastY] = points.at(-1);
    for (const [nextX, nextY] of points) {
      area += lastX * nextY - nextX * lastY;
      lastX = nextX;
      lastY = nextY;
    }
    return Math.abs(area) / 2;
  }

  function pointInPolygon(points, [x, y]) {
    let inside = false;
    let [ax, ay] = points.at(-1);
    for (const [bx, by] of points) {
      if ((ay > y) !== (by > y) && x < ax + (bx - ax) * (y - ay) / (by - ay)) inside = !inside;
      ax = bx;
      ay = by;
    }
    return inside;
  }

  function segmentsCross(a, b, c, d) {
    const cross = ([ax, ay], [bx, by], [px, py]) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    const sideC = cross(a, b, c);
    const sideD = cross(a, b, d);
    const sideA = cross(c, d, a);
    const sideB = cross(c, d, b);
    return sideC * sideD < 0 && sideA * sideB < 0;
  }

  function shapesOverlap(a, ax, ay, b, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    if (!overlaps(translate(a.bounds, dx, dy), b.bounds)) return false;
    const points = a.points.map(([x, y]) => [x + dx, y + dy]);
    if (!b.edge && points.some(point => pointInPolygon(b.points, point))) return true;
    if (!a.edge && b.points.some(point => pointInPolygon(points, point))) return true;
    for (let i = a.edge ? 1 : 0; i < points.length; i++) {
      const from = points[(i + points.length - 1) % points.length];
      for (let j = b.edge ? 1 : 0; j < b.points.length; j++) {
        const start = b.points[(j + b.points.length - 1) % b.points.length];
        if (segmentsCross(from, points[i], start, b.points[j])) return true;
      }
    }
    return false;
  }

  function touchesCircle(path, x, y, offsetX, offsetY, radius) {
    x -= offsetX;
    y -= offsetY;
    if (!overlaps(path.bounds, [x - radius, y - radius, x + radius, y + radius])) return false;
    let inside = false;
    let [lx, ly] = path.points.at(-1);
    for (const [px, py] of path.points) {
      if ((ly > y) !== (py > y) && x < (px - lx) * (y - ly) / (py - ly) + lx) inside = !inside;
      const dx = px - lx;
      const dy = py - ly;
      const length = dx * dx + dy * dy;
      const fraction = length ? Math.max(0, Math.min(1, ((x - lx) * dx + (y - ly) * dy) / length)) : 0;
      if ((x - lx - dx * fraction) ** 2 + (y - ly - dy * fraction) ** 2 <= radius ** 2) return true;
      lx = px;
      ly = py;
    }
    return inside;
  }

  return { colliderPaths, translate, overlaps, intersection, shapesOverlap, touchesCircle };
})();
