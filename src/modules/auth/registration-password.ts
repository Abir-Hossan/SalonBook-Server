import { z } from 'zod';

export const registrationPassword = z.string().min(8).max(128)
  .regex(/[a-z]/, 'Use a lowercase letter.')
  .regex(/[A-Z]/, 'Use an uppercase letter.')
  .regex(/[0-9]/, 'Use a numeric digit.')
  .regex(/[\p{P}\p{S}]/u, 'Use a special symbol.');
