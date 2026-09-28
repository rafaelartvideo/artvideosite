export type LogoVisibleBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export function findLogoVisibleBounds(input: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}): LogoVisibleBounds | null;
