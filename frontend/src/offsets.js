/* The backend reports spans as Python code-point offsets; JavaScript strings are
   indexed in UTF-16 code units, so astral characters shift every later offset. */
export function codePointOffsetToCodeUnit(text, offset) {
  if (!Number.isInteger(offset) || offset < 0) return null;
  let codePointOffset = 0;
  let codeUnitOffset = 0;
  for (const character of text) {
    if (codePointOffset === offset) return codeUnitOffset;
    codePointOffset += 1;
    codeUnitOffset += character.length;
  }
  return codePointOffset === offset ? codeUnitOffset : null;
}
