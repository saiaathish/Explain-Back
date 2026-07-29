function trimSentence(text, start, end) {
  let left = start;
  let right = end;
  while (left < right && /\s/.test(text[left])) left += 1;
  while (right > left && /\s/.test(text[right - 1])) right -= 1;
  return { start: left, end: right, text: text.slice(left, right) };
}

export function sentenceRanges(text) {
  const ranges = [];
  const pattern = /[^.!?\n]+(?:[.!?]+|$)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const range = trimSentence(text, match.index, match.index + match[0].length);
    if (range.text) ranges.push({ ...range, id: `sentence-${ranges.length}` });
  }
  return ranges;
}

export function rangesOverlap(left, right) {
  return left.start < right.end && right.start < left.end;
}

export function isConfident(flag, confidenceRanges) {
  return confidenceRanges.some((range) => rangesOverlap(flag, range));
}

export function calibrationSummary(flags, confidenceRanges = []) {
  const counts = {
    solid: 0,
    danger: 0,
    better: 0,
    known: 0,
  };
  const dangerIds = [];
  for (const flag of flags) {
    const confident = isConfident(flag, confidenceRanges);
    if (confident && flag.state === "green") counts.solid += 1;
    else if (confident) {
      counts.danger += 1;
      dangerIds.push(flag.prop_id);
    } else if (flag.state === "green") counts.better += 1;
    else counts.known += 1;
  }
  return { counts, dangerIds };
}
