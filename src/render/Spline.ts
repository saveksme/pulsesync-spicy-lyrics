// Ported from Spicy Lyrics (AGPL-3.0, github.com/Spikerko/spicy-lyrics):
// src/utils/Lyrics/Animator/Lyrics/LyricsAnimator.ts (GetSpline)
import Spline from "cubic-spline";

export interface AnimationPoint {
  Time: number;
  Value: number;
}

export function getSpline(points: AnimationPoint[]): { at(x: number): number } {
  return new Spline(
    points.map((point) => point.Time),
    points.map((point) => point.Value),
  );
}
