import test from 'node:test';
import assert from 'node:assert/strict';
import { coverageForCep, bookingDates, slotsForDate, validateBookingConfig, mergeResolvedAddress, scheduleSlotsForDay, effectiveWeeklySlots } from './service-booking.mjs';
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

test('independent availability for each weekday and past hours are hidden',()=>{
 const weekly={...config,weekdays:[1,2,3],weekly_slots:{
  '1':[{start:'08:00',end:'10:00'},{start:'14:00',end:'17:00'}],
  '2':[{start:'10:00',end:'12:00'}],
  '3':[]
 }};
 const dates=bookingDates(weekly,now);
 assert.ok(dates.includes('2026-10-19'));
 assert.ok(dates.includes('2026-10-20')===false); // blocked by date-specific exception
 assert.ok(!dates.includes('2026-10-21')); // Wednesday has no schedule
 assert.deepEqual(slotsForDate(weekly,'2026-10-19',now),[{start:'14:00',end:'17:00'}]);
 assert.deepEqual(slotsForDate(weekly,'2026-10-21',now),[]);
 assert.deepEqual(slotsForDate({...weekly,blocked_dates:[]},'2026-10-20',now),[{start:'10:00',end:'12:00'}]);
 assert.deepEqual(slotsForDate({...weekly,weekdays:[2],blocked_dates:[]},'2026-10-19',now),[]);
});

test('legacy shared hours can be represented as weekday-specific hours',()=>{
 const migrated=effectiveWeeklySlots(config);
 assert.deepEqual(migrated['1'],config.slots);
 assert.deepEqual(migrated['6'],config.slots);
 assert.deepEqual(scheduleSlotsForDay({...config,weekly_slots:{'1':[ {start:'07:00',end:'11:00'} ]}},2),[]);
 assert.deepEqual(scheduleSlotsForDay({...config,weekly_slots:{'1':[ {start:'07:00',end:'11:00'} ]}},1),[{start:'07:00',end:'11:00'}]);
});

test('day-specific validation blocks invalid, empty and overlapping intervals',()=>{
 const weekly={...config,weekdays:[1,2],weekly_slots:{
  '1':[{start:'08:00',end:'12:00'}],
  '2':[{start:'13:00',end:'18:00'}]
 }};
 assert.equal(validateBookingConfig(weekly),null);
 assert.match(validateBookingConfig({...weekly,weekly_slots:{'1':weekly.weekly_slots['1'],'2':[]}}),/Terça-feira/);
 assert.match(validateBookingConfig({...weekly,weekly_slots:{'1':[{start:'08:00',end:'07:00'}],'2':weekly.weekly_slots['2']}}),/Segunda-feira/);
 assert.match(validateBookingConfig({...weekly,weekly_slots:{'1':[{start:'08:00',end:'12:00'},{start:'11:00',end:'13:00'}],'2':weekly.weekly_slots['2']}}),/sobrepostos/);
 assert.equal(validateBookingConfig({...weekly,weekdays:[1],weekly_slots:{'1':weekly.weekly_slots['1'],'2':[]}}),null);
});
