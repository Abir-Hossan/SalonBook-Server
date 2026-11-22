import { randomBytes } from 'node:crypto';
export const createId = (): string => randomBytes(12).toString('hex');
export const isValidId = (value: string): boolean => /^[a-f\d]{24}$/i.test(value);
