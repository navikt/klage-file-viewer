import type { Rotation } from '@embedpdf/models';

export const getRotationMatrix = (rotation: Rotation, width: number, height: number): string => {
  switch (rotation) {
    case 0:
      return 'none';
    case 1:
      return `rotate(90deg) translateY(-${height.toString(10)}px)`;
    case 2:
      return `rotate(180deg) translate(-${width.toString(10)}px, -${height.toString(10)}px)`;
    case 3:
      return `rotate(270deg) translateX(-${width.toString(10)}px)`;
    default:
      return 'none';
  }
};
