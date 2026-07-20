export function animalCountLabel(count: number) {
  const safeCount = Math.max(0, Math.floor(count));
  return `${safeCount} ${safeCount === 1 ? "animal" : "animals"}`;
}

export function friendCountLabel(count: number) {
  const safeCount = Math.max(0, Math.floor(count));
  return `${safeCount} ${safeCount === 1 ? "friend" : "friends"}`;
}

export function riderCountLabel(animalCount: number) {
  const riders = Math.max(0, Math.floor(animalCount)) + 1;
  return `${riders} ${riders === 1 ? "rider" : "riders"}`;
}

export function companionStatus(count: number) {
  return `${friendCountLabel(count).toUpperCase()} FOLLOWING`;
}
