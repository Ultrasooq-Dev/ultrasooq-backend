/**
 * @file registerValidateOtp.dto.ts — DTO for OTP Validation During Registration
 *
 * @intent
 *   Validates the request body for POST /user/registerValidateOtp. The user
 *   receives an OTP via email after registration and must submit it to verify
 *   their email address and activate their account.
 *
 * @idea
 *   Two-step registration: first create the user (pending state), then validate
 *   the OTP to confirm email ownership. This prevents fake email registrations.
 *
 * @usage
 *   - Used in UserController.registerValidateOtp(@Body() payload: RegisterValidateOtp)
 *   - Consumed by UserService.registerValidateOtp(payload)
 *   - Frontend: Registration flow → OTP input screen.
 *
 * @dataflow
 *   Frontend POST /user/registerValidateOtp → { email, otp }
 *   → UserService.registerValidateOtp() → verifies OTP against DB → activates user
 *
 * @depends
 *   - class-validator (IsEmail, IsNumber)
 *
 * @notes
 *   - `otp` uses the `Number` wrapper type (capital N) instead of `number`
 *     primitive — this is a TypeScript anti-pattern but functionally works
 *     with class-validator's @IsNumber().
 *   - IsString and MinLength are imported but unused.
 */

import { IsString, IsEmail, MinLength, IsNumber } from 'class-validator';

export class RegisterValidateOtp {
    @IsEmail()
    email: string;              // The email address used during registration

    @IsNumber()
    otp: Number;                // The one-time password sent via email
}