import { getRouteParam } from '../../utils/route-param';
import { Router } from 'express'; import type { AppointmentService } from './appointment.service'; import { appointmentIdParams,appointmentListQuery,availabilityQuery,createAppointmentBody } from './schemas'; import { authenticate,authorize,type PrincipalResolver } from '../../middleware/auth'; import { validate } from '../../middleware/validate'; import { asyncHandler } from '../../utils/async-handler'; import { success } from '../../utils/http';
export const appointmentRoutes=(service:AppointmentService,resolver:PrincipalResolver)=>{const r=Router();const auth=authenticate(resolver);
 r.get('/availability', asyncHandler(async (req, res) => {
   const query = availabilityQuery.parse(req.query);
   res.setHeader('Cache-Control', 'no-store');
   success(res, 'Available appointment times.', await service.availability(query.serviceId, query.date));
 }));
 r.post('/',auth,authorize('customer'),validate(createAppointmentBody,'body'),asyncHandler(async(req,res)=>success(res,'Appointment request created successfully.',await service.create(req.principal!,req.body),201)));
 r.get('/my',auth,authorize('customer'),validate(appointmentListQuery,'query'),asyncHandler(async(req,res)=>{const result=await service.listMine(req.principal!,req.query as never);success(res,'Appointments retrieved successfully.',result.items,200,result.meta);}));
 r.get('/:id',auth,validate(appointmentIdParams,'params'),asyncHandler(async(req,res)=>success(res,'Appointment retrieved successfully.',await service.get(req.principal!,getRouteParam(req, 'id')))));
 r.patch('/:id/cancel',auth,authorize('customer'),validate(appointmentIdParams,'params'),asyncHandler(async(req,res)=>success(res,'Appointment cancelled successfully.',await service.cancelByCustomer(req.principal!,getRouteParam(req, 'id')))));return r;};
export const adminAppointmentRoutes=(service:AppointmentService,resolver:PrincipalResolver)=>{const r=Router();const auth=authenticate(resolver);r.use(auth,authorize('admin'));
 r.get('/',validate(appointmentListQuery,'query'),asyncHandler(async(req,res)=>{const result=await service.listAll(req.query as never);success(res,'Appointments retrieved successfully.',result.items,200,result.meta);}));
 r.patch('/:id/confirm',validate(appointmentIdParams,'params'),asyncHandler(async(req,res)=>success(res,'Appointment confirmed successfully.',await service.confirm(getRouteParam(req, 'id')))));
 r.patch('/:id/cancel',validate(appointmentIdParams,'params'),asyncHandler(async(req,res)=>success(res,'Appointment cancelled successfully.',await service.cancelByAdmin(getRouteParam(req, 'id')))));return r;};
