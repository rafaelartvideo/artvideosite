import test from 'node:test';
import assert from 'node:assert/strict';
import { coverageForCep, bookingDates, slotsForDate, validateBookingConfig, mergeResolvedAddress } from './service-booking.mjs';
const config = { coverage_mode:'ranges', cep_ranges:[{start:'49000-001',end:'49099-999'}], schedule_enabled:true, weekdays:[1,2,3,4,5], slots:[{start:'08:00',end:'10:00'},{start:'14:00',end:'16:00'}], lead_days:0, horizon_days:7, blocked_dates:['2026-10-20'] };
const now = new Date('2026-10-19T12:00:00Z');
test('CEP boundaries and invalid CEPs',()=>{
 assert.equal(coverageForCep(config,'49000-001'),'available');
 assert.equal(coverageForCep(config,'49099-999'),'available');
 assert.equal(coverageForCep(config,'49100-000'),'unavailable');
 assert.equal(coverageForCep(config,'49000'),'invalid');
 assert.equal(coverageForCep({},'49000-001'),'consult');
 assert.equal(coverageForCep({...config,cep_ranges:[]},'49000-001'),'consult');
});
test('calendar respects Brazil time, disabled days, horizon and blocks',()=>{
 const dates=bookingDates(config,now);
 assert.ok(dates.includes('2026-10-19'));
 assert.ok(!dates.includes('2026-10-20'));
 assert.ok(!dates.includes('2026-10-24'));
 assert.ok(!dates.includes('2026-10-26'));
 assert.deepEqual(bookingDates({...config,schedule_enabled:false},now),[]);
});
test('past slots are excluded and blocked dates cannot be forced',()=>{
 assert.deepEqual(slotsForDate(config,'2026-10-19',now),[{start:'14:00',end:'16:00'}]);
 assert.deepEqual(slotsForDate(config,'2026-10-20',now),[]);
 assert.deepEqual(slotsForDate(config,'2026-10-18',now),[]);
 assert.deepEqual(slotsForDate(config,'2027-01-01',now),[]);
});
test('configuration rejects reversed CEP ranges and invalid time intervals',()=>{
 assert.match(validateBookingConfig({...config,cep_ranges:[{start:'49099-999',end:'49000-001'}]}),/CEP/);
 assert.match(validateBookingConfig({...config,slots:[{start:'16:00',end:'14:00'}]}),/horário/i);
 assert.match(validateBookingConfig({...config,weekdays:[]}),/dia/i);
 assert.equal(validateBookingConfig(config),null);
});
test('Brazil date is used across midnight UTC and invalid blocked dates are rejected',()=>{
 const midnight = new Date('2026-10-20T01:30:00Z');
 assert.ok(bookingDates(config,midnight).includes('2026-10-19'));
 assert.deepEqual(slotsForDate(config,'2026-10-19',midnight),[]);
 assert.match(validateBookingConfig({...config,blocked_dates:['2026-02-31']}),/datas bloqueadas/);
});

test('returning to address preserves user edits for generic CEPs',()=>{
 const entered={zip_code:'49000-001',street:'Rua digitada',number:'100',neighborhood:'Bairro corrigido',city:'Aracaju',state:'SE'};
 assert.deepEqual(mergeResolvedAddress(entered,{street:'',neighborhood:'Centro',city:'Aracaju',state:'SE'}),entered);
 assert.equal(mergeResolvedAddress({street:''},{street:'Rua encontrada'}).street,'Rua encontrada');
});
