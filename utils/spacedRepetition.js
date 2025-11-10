// SuperMemo-2 (SM-2) Algorithm Implementation
exports.calculateNextReview = (quality, oldEF, oldInterval) => {
  // Quality: 0-5 rating of how well the user remembered
  // EF: Easiness Factor, minimum 1.3
  // Interval: gap between reviews in days
  
  let newEF = oldEF + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  newEF = Math.max(1.3, newEF);

  let nextInterval;
  if (quality < 3) {
    nextInterval = 1; // Reset interval if poor recall
  } else {
    if (oldInterval === 0) {
      nextInterval = 1;
    } else if (oldInterval === 1) {
      nextInterval = 6;
    } else {
      nextInterval = Math.round(oldInterval * newEF);
    }
  }

  return {
    nextInterval,
    newEasinessFactor: newEF
  };
};