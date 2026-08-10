/** Merchant-friendly count + noun, e.g. pluralize(1, "redirect") → "1 redirect". */
export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Capitalizes the first letter — for enum values shown in badges. */
export function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}
