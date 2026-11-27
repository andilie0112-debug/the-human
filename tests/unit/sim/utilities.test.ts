import { describe, expect, it } from 'vitest';
import sim from '../../../src/data/sim.json';
import { drive, electricityBill, freshVehicle, type ElectricityConfig, type VehicleConfig } from '../../../src/sim/utilities';
import { GameSession } from '../../../src/sim/session';
import { simData } from '../../../src/sim/gameData';

const elec = sim.bills.electricity as ElectricityConfig;
const veh = sim.vehicles as unknown as VehicleConfig;

describe('electricity', () => {
  it('bills lights and appliances by the day, and the AC by the hours it ran', () => {
    const base = electricityBill({ days: 30, objects: ['fridge', 'tv_set'], acHours: 0, layoutId: 'kontrakan' }, elec);
    const withAc = electricityBill({ days: 30, objects: ['fridge', 'tv_set', 'ac_split'], acHours: 8 * 30, layoutId: 'kontrakan' }, elec);
    // Fridge + TV + lights: about 77 kWh, roughly Rp110.000.
    expect(base.kwh).toBeGreaterThan(60);
    expect(base.amount).toBeGreaterThan(80000);
    expect(base.amount).toBeLessThan(160000);
    // Eight hours of AC a night adds about 180 kWh (over Rp250.000).
    expect(withAc.amount - base.amount).toBeGreaterThan(250000);
  });

  it('in a kos the rent covers basic electricity: only the AC is billed', () => {
    expect(electricityBill({ days: 30, objects: ['fridge'], acHours: 0, layoutId: 'kos' }, elec).amount).toBe(0);
    const ac = electricityBill({ days: 30, objects: ['fridge'], acHours: 100, layoutId: 'kos' }, elec);
    expect(ac.acOnly).toBe(true);
    expect(ac.amount).toBeGreaterThan(0);
  });
});

describe('vehicles', () => {
  it('uses fuel by the kilometre and fills up at the SPBU when the tank is low', () => {
    const v = freshVehicle('motor', veh);
    expect(drive(v, 'motor', 100, veh).refuel).toBeUndefined();
    // 4.2 L at 45 km/L: about 160 km before filling up.
    const r = drive(v, 'motor', 70, veh);
    expect(r.refuel?.litres).toBeGreaterThan(3);
    expect(r.refuel?.cost).toBeGreaterThan(30000);
    expect(v.fuel).toBeCloseTo(veh.tankLitres.motor);
  });

  it('is serviced every 2,000 km (motorbike) and 10,000 km (car)', () => {
    const m = freshVehicle('motor', veh);
    let services = 0;
    for (let i = 0; i < 50; i++) if (drive(m, 'motor', 100, veh).service) services++;
    expect(services).toBe(2);
    const c = freshVehicle('car', veh);
    expect(drive(c, 'car', 9999, veh).service).toBeUndefined();
    expect(drive(c, 'car', 2, veh).service?.cost).toBe(veh.serviceCost.car);
  });

  it('the session charges fuel and service and tells the player', () => {
    const s = new GameSession(simData);
    s.character.ownsMotorbike = true;
    const before = s.wallet.balance;
    for (let i = 0; i < 25; i++) s.driven('motor', 100);
    expect(s.wallet.balance).toBeLessThan(before);
    const ev = s.simulate(1);
    expect(ev.some((e) => e.kind === 'vehicle' && e.textKey === 'veh.refuel')).toBe(true);
    expect(ev.some((e) => e.kind === 'vehicle' && e.textKey === 'veh.serviceMotor')).toBe(true);
  });
});
