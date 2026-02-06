export const snapUp = (current: number, step: number, max: number) => {
  if (current === max) {
    return current;
  }

  return current + step - (current % step);
};

export const snapDown = (current: number, step: number, min: number) => {
  if (current === min) {
    return current;
  }

  const rest = current % step;

  if (rest === 0) {
    return current - step;
  }

  return current - rest;
};
