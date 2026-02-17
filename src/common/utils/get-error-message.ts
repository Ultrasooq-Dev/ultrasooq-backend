/**
 * @file get-error-message.ts
 *
 * @intent  Provide a type-safe utility to extract error messages from unknown
 *          catch-block values. Required after enabling `strictNullChecks` in
 *          tsconfig.json (Phase B11) because `catch (error)` implicitly types
 *          `error` as `unknown`.
 *
 * @usage
 *   ```ts
 *   import { getErrorMessage } from 'src/common/utils/get-error-message';
 *
 *   try { ... } catch (error) {
 *     return { status: false, message: 'Something failed', error: getErrorMessage(error) };
 *   }
 *   ```
 *
 * @notes
 *   - Returns `error.message` when the value is an Error instance.
 *   - Returns the stringified value for non-Error throwables.
 *   - Returns a generic fallback for values that cannot be stringified.
 */

/**
 * Safely extracts a human-readable message from an unknown thrown value.
 *
 * @param error - The caught value (typed `unknown` under strict mode).
 * @returns A string message suitable for API response envelopes.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected error occurred';
}
