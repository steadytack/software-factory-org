/** UK postcode format, the same grammar the server enforces
 *  (`backend/app/schemas/site.py`,-8): outward code, then a
 *  digit and two unit letters. Letters that never occur in real postcodes are
 *  excluded, so `QQ1 1AA` is refused. `GIR 0AA` is the one special case. */
const UK_POSTCODE =
  /^(GIR0AA|[A-PR-UWYZ]([0-9]{1,2}|([A-HK-Y][0-9]([0-9ABEHMNPRV-Y])?)|[0-9][A-HJKPSTUW])[0-9][ABD-HJLNP-UW-Z]{2})$/;

export const POSTCODE_FORMAT_MESSAGE = "Enter a UK postcode, like SW1A 1AA";

/** True when `value` is a correctly formed UK postcode (spacing and case are ignored). */
export function isUkPostcode(value: string): boolean {
  return UK_POSTCODE.test(value.replace(/\s+/g, "").toUpperCase());
}
