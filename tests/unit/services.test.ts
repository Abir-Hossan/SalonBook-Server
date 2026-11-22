import {describe,it,expect,beforeEach} from 'vitest';import {MemoryServiceRepository} from '../../src/repositories/memory';import {ServiceService} from '../../src/modules/services/service.service';import {serviceSeed,ids} from '../fixtures/data';import {AppError} from '../../src/utils/errors';
let repo:MemoryServiceRepository;let service:ServiceService;beforeEach(()=>{repo=new MemoryServiceRepository(serviceSeed);service=new ServiceService(repo);});
describe('ServiceService',()=>{
it('lists active services only',async()=>{const result=await service.list({page:1,limit:10});expect(result.items).toHaveLength(1);});
it('searches by service name',async()=>{const result=await service.list({page:1,limit:10,q:'blow'});expect(result.items[0]?.serviceName).toBe('Signature Blowout');});
it('filters category',async()=>{const result=await service.list({page:1,limit:10,category:'Hair'});expect(result.items).toHaveLength(1);});
it('sorts prices ascending',async()=>{const result=await service.list({page:1,limit:10,includeInactive:true,sort:'price_asc'});expect(result.items[0]?.price).toBe(165);});
it('paginates',async()=>{const result=await service.list({page:2,limit:1,includeInactive:true});expect(result.meta.total).toBe(2);expect(result.items).toHaveLength(1);});
it('retrieves active service detail',async()=>{expect((await service.get(ids.service)).serviceName).toBe('Signature Blowout');});
it('rejects inactive service detail for public use',async()=>{await expect(service.get(ids.service2)).rejects.toMatchObject({statusCode:404});});
it('creates service',async()=>{const created=await service.create({serviceName:'New Service',category:'Hair',description:'A detailed service description.',price:100,duration:30,image:'https://example.com/image.jpg',status:'active'});expect(created.id).toHaveLength(24);});
it('updates service',async()=>{const updated=await service.update(ids.service,{price:180});expect(updated.price).toBe(180);});
it('returns 404 for missing update',async()=>{await expect(service.update('999999999999999999999999',{price:2})).rejects.toBeInstanceOf(AppError);});
it('deletes service without appointment history',async()=>{await expect(service.remove(ids.service)).resolves.toBeUndefined();});
it('rejects delete when historical appointments exist',async()=>{repo.setAppointmentLookup(async()=>true);await expect(service.remove(ids.service)).rejects.toMatchObject({statusCode:409});});
});
