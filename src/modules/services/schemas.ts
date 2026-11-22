import { z } from 'zod';
import { isValidId } from '../../utils/ids';
const imageUrl = z.string().max(2048).refine(value => /^https?:\/\//i.test(value) && z.string().url().safeParse(value).success || /^\/images\/[a-z0-9_.-]+$/i.test(value), "Use an HTTP(S) image URL or a bundled image path.");
export const serviceIdParams = z.object({ id: z.string().refine(isValidId, 'Invalid service ID.') });
export const listServicesQuery = z.object({ q:z.string().trim().max(100).optional(), category:z.string().trim().max(60).optional(), minPrice:z.coerce.number().min(0).optional(), maxPrice:z.coerce.number().min(0).optional(), sort:z.enum(['price_asc','price_desc','newest']).optional(), includeInactive:z.enum(['true','false']).transform(x=>x==='true').optional(), page:z.coerce.number().int().min(1).default(1), limit:z.coerce.number().int().min(1).max(100).default(12) }).refine(x=>x.minPrice===undefined||x.maxPrice===undefined||x.minPrice<=x.maxPrice,'minPrice cannot exceed maxPrice');
export const createServiceBody = z.object({ serviceName:z.string().trim().min(2).max(120), category:z.string().trim().min(2).max(60), description:z.string().trim().min(10).max(2000), price:z.number().finite().positive().max(1000000), duration:z.number().int().positive().max(1440), image:imageUrl, status:z.enum(['active','inactive']).default('active') }).strict();
export const updateServiceBody = createServiceBody.partial().strict().refine((value)=>Object.keys(value).length>0,'At least one service field must be provided.');

export const serviceDetailQuery = z.object({ includeInactive:z.enum(['true','false']).transform(x=>x==='true').optional() });
