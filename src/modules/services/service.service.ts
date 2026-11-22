import type { ServiceRepository } from '../../interfaces/repositories';
import { AppError } from '../../utils/errors';
import type { Service } from '../../types/domain';
export class ServiceService {
  constructor(private readonly repo:ServiceRepository){}
  listCategories() { return this.repo.listActiveCategories(); }
  list(query:Parameters<ServiceRepository['list']>[0], includeInactive=query.includeInactive ?? false){return this.repo.list({...query,includeInactive});}
  async get(id:string,includeInactive=false){const item=await this.repo.findById(id);if(!item||(!includeInactive&&item.status!=='active'))throw new AppError(404,'Service was not found.','SERVICE_NOT_FOUND');return item;}
  create(input:Omit<Service,'id'|'createdAt'>){return this.repo.create(input);}
  async update(id:string,patch:Partial<Omit<Service,'id'|'createdAt'>>){const current=await this.repo.findById(id);if(!current)throw new AppError(404,'Service was not found.','SERVICE_NOT_FOUND');const result=await this.repo.update(id,patch);if(!result)throw new AppError(404,'Service was not found.','SERVICE_NOT_FOUND');return result;}
  async remove(id:string){const current=await this.repo.findById(id);if(!current)throw new AppError(404,'Service was not found.','SERVICE_NOT_FOUND');if(await this.repo.hasAppointments(id))throw new AppError(409,'Service has appointment history and cannot be deleted. Deactivate it instead.','SERVICE_HAS_APPOINTMENTS');await this.repo.delete(id);}
}
