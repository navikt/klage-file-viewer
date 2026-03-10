/** Observe the canvas for resize / DPI changes using `devicePixelContentBoxSize` when available. */
export const observeCanvasResize = (canvas: HTMLCanvasElement, callback: (scale: number) => void): ResizeObserver => {
  const observer = new ResizeObserver((entries) => {
    const entry = entries[0];

    if (entry !== undefined) {
      callback(computeOutputScale(getDevicePixelRatio(entry)));
    }
  });

  try {
    observer.observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    // `device-pixel-content-box` is not supported — fall back to `window.devicePixelRatio`.
    observer.observe(canvas);
    console.warn('ResizeObserver does not support device-pixel-content-box. Falling back to window.devicePixelRatio.');
  }

  return observer;
};

const getDevicePixelRatio = (entry: ResizeObserverEntry): number => {
  const [devicePixelSize] = entry.devicePixelContentBoxSize;
  const [cssSize] = entry.contentBoxSize;

  if (devicePixelSize !== undefined && cssSize !== undefined && cssSize.inlineSize > 0 && cssSize.blockSize > 0) {
    // Use the larger axis to ensure sufficient resolution in both dimensions.
    const ratio = Math.max(
      devicePixelSize.inlineSize / cssSize.inlineSize,
      devicePixelSize.blockSize / cssSize.blockSize,
    );
    console.debug(
      `Observed devicePixelRatio: ${ratio} (devicePixelSize: ${devicePixelSize.inlineSize}x${devicePixelSize.blockSize}, cssSize: ${cssSize.inlineSize}x${cssSize.blockSize})`,
    );
    return ratio;
  }

  console.debug(`Using window.devicePixelRatio: ${window.devicePixelRatio}`);

  return window.devicePixelRatio;
};

const computeOutputScale = (observedDevicePixelRatio: number): number => Math.max(1, observedDevicePixelRatio);
