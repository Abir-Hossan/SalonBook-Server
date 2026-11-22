import express, { Router } from 'express';
import { env } from '../../config/env';
import { authenticate, authorize, type PrincipalResolver } from '../../middleware/auth';
import { asyncHandler } from '../../utils/async-handler';
import { AppError } from '../../utils/errors';
import { success } from '../../utils/http';

const signatures: Record<string, (image: Buffer) => boolean> = {
  'image/png': (image) => image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
  'image/jpeg': (image) => image.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')),
  'image/webp': (image) => image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP',
};

export function imageRoutes(resolvePrincipal: PrincipalResolver, purpose: "service" | "profile" = "service") {
  const router = Router();
  router.post('/' + purpose, authenticate(resolvePrincipal), authorize(...(purpose === 'service' ? ['admin' as const] : ['admin' as const, 'customer' as const])),
    express.raw({ type: Object.keys(signatures), limit: '5mb' }),
    asyncHandler(async (req, res) => {
      const contentType = req.get('Content-Type')?.split(';', 1)[0]?.toLowerCase() ?? '';
      const matches = Object.hasOwn(signatures, contentType) ? signatures[contentType] : undefined;
      if (!Buffer.isBuffer(req.body) || !matches?.(req.body)) {
        throw new AppError(415, 'Upload a PNG, JPEG or WebP image.', 'INVALID_IMAGE');
      }
      if (!env.IMGBB_API_KEY) {
        throw new AppError(503, 'Image uploads are currently unavailable.', 'IMAGE_UPLOAD_UNAVAILABLE');
      }
      const form = new FormData();
      form.set('image', req.body.toString('base64'));
      const endpoint = new URL('https://api.imgbb.com/1/upload');
      endpoint.searchParams.set('key', env.IMGBB_API_KEY);
      let imageUrl: string;
      try {
        const response = await fetch(endpoint, {
          method: 'POST', body: form, signal: AbortSignal.timeout(15_000), redirect: 'error',
        });
        const result = await response.json() as { success?: boolean; data?: { url?: string } };
        if (!response.ok || !result.success || !result.data?.url) throw new Error('Upload rejected');
        const image = new URL(result.data.url);
        if (image.protocol !== 'https:' || image.hostname !== 'i.ibb.co') throw new Error('Invalid image URL');
        imageUrl = image.toString();
      } catch {
        throw new AppError(502, 'The image could not be uploaded. Please try again.', 'IMAGE_UPLOAD_FAILED');
      }
      success(res, 'Image uploaded.', { image: imageUrl }, 201);
    }),
  );
  return router;
}
