export function primaryWordDropWord(words: readonly string[]): string {
  return [...words].sort((left, right) => {
    const lengthDifference = right.length - left.length;
    if (lengthDifference !== 0) return lengthDifference;
    const normalizedLeft = left.toUpperCase();
    const normalizedRight = right.toUpperCase();
    if (normalizedLeft < normalizedRight) return -1;
    if (normalizedLeft > normalizedRight) return 1;
    return 0;
  })[0]?.toUpperCase() ?? "";
}
