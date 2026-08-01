/**
 * True when an update DTO carries anything worth writing.
 *
 * Every field on these DTOs is optional, so an empty body still arrives as a
 * perfectly valid instance. class-transformer keeps unset properties as
 * `undefined` keys, which is why the values are checked and not the key count —
 * `Object.keys(dto).length` is never 0 here.
 *
 * `null` counts as a value: clearing a field is a real edit.
 */
export function hasAnyValue(dto: object): boolean {
  return Object.values(dto).some((value) => value !== undefined);
}
