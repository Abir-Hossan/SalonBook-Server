import {z} from 'zod';import {isValidId} from '../../utils/ids';
export const transactionIdParams=z.object({id:z.string().refine(isValidId,'Invalid transaction ID.')});
export const transactionListQuery=z.object({status:z.enum(['paid','failed']).optional(),appointmentId:z.string().refine(isValidId).optional(),page:z.coerce.number().int().min(1).default(1),limit:z.coerce.number().int().min(1).max(100).default(20)});
