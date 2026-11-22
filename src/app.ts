import { authRoutes, mongoPrincipalResolver, revokeLegacySession } from './modules/auth/auth.routes';
import { betterAuthPath, getBetterAuth } from './modules/auth/better-auth';
import { AppError } from './utils/errors';
import { paymentRoutes, stripeWebhook } from './modules/payments/payment.routes';
import { demoCatalog } from './repositories/demo-catalog';
import express from 'express';import helmet from 'helmet';import rateLimit from 'express-rate-limit';import pinoHttp from 'pino-http';import type {Express} from 'express';import {env} from './config/env';import {logger} from './config/logger';import {corsMiddleware} from './config/cors';import {requestContext} from './middleware/request-context';import {errorHandler,notFound} from './middleware/error-handler';import {phase04PrincipalResolver,type PrincipalResolver} from './middleware/auth';import {apiRoutes,type Repositories} from './routes';import {MemoryAppointmentRepository,MemoryServiceRepository,MemoryTransactionRepository,MemoryUserRepository} from './repositories/memory';
export interface AppOptions{repositories?:Repositories;principalResolver?:PrincipalResolver;enableMongoAuth?:boolean}
export function createApp(options:AppOptions={}):Express{const app=express();const memoryAppointments=new MemoryAppointmentRepository();const memoryServices=new MemoryServiceRepository(env.NODE_ENV === "development" && env.SEED_DEMO_CATALOG === "true" ? demoCatalog : []);memoryServices.setAppointmentLookup((serviceId)=>memoryAppointments.hasServiceAppointments(serviceId));const repos=options.repositories??{services:memoryServices,appointments:memoryAppointments,users:new MemoryUserRepository(),transactions:new MemoryTransactionRepository()};const resolver=options.principalResolver??(options.enableMongoAuth?mongoPrincipalResolver:phase04PrincipalResolver);
 app.disable('x-powered-by');app.use(requestContext);app.use(helmet());app.use(corsMiddleware);app.use(pinoHttp({logger,quietReqLogger:true,customProps:(_req,res)=>({requestId:res.getHeader('X-Request-Id')})}));
 app.get('/api/health',(_req,res)=>res.status(200).json({success:true,message:'SalonBook API is healthy.',data:{status:'ok',application:'SalonBook API',environment:env.NODE_ENV,timestamp:new Date().toISOString()},meta:null}));
 app.use('/api/admin',rateLimit({windowMs:15*60*1000,limit:60,standardHeaders:'draft-7',legacyHeaders:false,message:{success:false,message:'Too many administrative requests. Please try again later.',errors:[{code:'ADMIN_RATE_LIMITED'}]}}));
 app.use('/api/appointments',rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:'draft-7',legacyHeaders:false,message:{success:false,message:'Too many appointment requests. Please try again later.',errors:[{code:'BOOKING_RATE_LIMITED'}]}}));
 app.use('/api',rateLimit({windowMs:15*60*1000,limit:300,standardHeaders:'draft-7',legacyHeaders:false,message:{success:false,message:'Too many requests. Please try again later.',errors:[{code:'RATE_LIMITED'}]}}));
 if (options.enableMongoAuth) app.post('/api/payments/webhook', ...stripeWebhook);
 if (options.enableMongoAuth) {
   app.use('/api', (req, _res, next) => {
     if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
         (req.path.startsWith('/auth/') || req.path.startsWith('/better-auth/') ||
          /(?:^|;[ ]*)(?:__Secure-)?salonbook(?:_session|\.session_token)=/.test(req.headers.cookie ?? '')) &&
         !env.allowedOrigins.includes(req.get('origin') ?? '')) {
       next(new AppError(403, 'The request origin is not allowed.', 'ORIGIN_REQUIRED'));
       return;
     }
     next();
   });
   const auth = getBetterAuth();
   if (auth) {
     const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
     app.all(betterAuthPath + '/*', (req, res, next) => {
       const route = req.path.slice(betterAuthPath.length);
       const credentialRoutes = ['/sign-up/email', '/sign-in/email', '/sign-in/social', '/sign-out'];
       const permitted = (req.method === 'POST' && credentialRoutes.includes(route)) ||
         (req.method === 'GET' && ['/get-session', '/callback/google'].includes(route));
       if (!permitted) return next();
       res.setHeader('Cache-Control', 'no-store');
       const handle = () => {
         void (async () => {
           if (route === '/get-session' && (await mongoPrincipalResolver(req))?.isBlocked) {
             throw new AppError(403, 'This account is blocked.', 'ACCOUNT_BLOCKED');
           }
           if (route === '/sign-out') await revokeLegacySession(req);
           await auth.handler(req, res);
         })().catch(next);
       };
       if (route === '/get-session' || route === '/sign-out') handle();
       else authLimit(req, res, handle);
     });
   }
 }
 app.use(express.json({limit:env.REQUEST_BODY_LIMIT}));app.use(express.urlencoded({extended:false,limit:env.REQUEST_BODY_LIMIT}));
 if (options.enableMongoAuth) {
   app.use('/api/auth', authRoutes());
   app.use('/api/payments', paymentRoutes());
 }
 app.use('/api',apiRoutes(repos,resolver));app.use(notFound);app.use(errorHandler);return app;}
