import {z} from 'zod';import {isValidId} from '../../utils/ids';
export const userIdParams=z.object({id:z.string().refine(isValidId,'Invalid user ID.')});
export const userListQuery=z.object({q:z.string().trim().max(100).optional(),role:z.enum(['customer','admin']).optional(),isBlocked:z.enum(['true','false']).transform(x=>x==='true').optional(),page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(100).default(20)});
export const profileBody=z.object({name:z.string().trim().min(2).max(80).optional(),image:z.string().url().max(2048).optional()}).strict().refine(x=>Object.keys(x).length>0,'At least one permitted profile field is required.');
