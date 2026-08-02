import {
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';

/**
 * Measures a value the way it will actually be stored: serialised, in bytes
 * rather than characters, so multi-byte content cannot slip several times its
 * apparent size past the cap. Anything JSON cannot serialise (a cycle, a
 * BigInt) is treated as oversized — it has no valid size, and it would blow up
 * later in Prisma anyway.
 */
export function jsonByteLength(value: unknown): number {
  let serialised: string | undefined;

  try {
    serialised = JSON.stringify(value);
  } catch {
    return Number.POSITIVE_INFINITY;
  }

  return serialised === undefined ? 0 : Buffer.byteLength(serialised, 'utf8');
}

/**
 * Caps a free-form JSON property by its serialised byte length. Use on fields
 * typed loosely enough that no other class-validator rule bounds them —
 * `unknown` and `object` payloads in particular, which are otherwise limited
 * only by whatever the HTTP body parser happens to allow.
 */
export function MaxJsonSize(
  maxBytes: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'maxJsonSize',
      target: object.constructor,
      propertyName,
      constraints: [maxBytes],
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return jsonByteLength(value) <= maxBytes;
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must serialise to at most ${maxBytes} bytes of JSON`;
        },
      },
    });
  };
}
