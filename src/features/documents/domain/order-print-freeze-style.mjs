export function copyComputedStyle(sourceStyle, targetStyle) {
  const length = Number(sourceStyle?.length) || 0;
  for (let index = 0; index < length; index += 1) {
    const name = sourceStyle.item(index);
    if (!name) continue;
    targetStyle.setProperty(
      name,
      sourceStyle.getPropertyValue(name),
      sourceStyle.getPropertyPriority(name),
    );
  }
}
