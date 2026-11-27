// Running costs of a home and vehicles. Electricity (PLN, household tariff per kWh): lights and
// plugged-in appliances every day, and the air conditioner for the hours it runs (at night while
// sleeping). In a kos the rent covers basic electricity; an AC is charged on top. Vehicles burn
// fuel by the kilometre (Pertalite) and need servicing at the workshop every few thousand km;
// when the tank runs low the rider fills up at the SPBU.

export interface ElectricityConfig {
  /** Rupiah per kWh (household tariff). */
  tariffPerKwh: number;
  /** Lights, phone charging, small things. */
  baseKwhPerDay: number;
  /** Daily use of each appliance (by object id) while it stands in the home. */
  objectKwhPerDay: Record<string, number>;
  /** Power of the air conditioner while it runs (kW). */
  acKw: number;
  /** Layouts whose rent includes basic electricity (only the AC is billed). */
  includedIn: string[];
}

export interface ElectricityUse {
  /** Days in the billing month. */
  days: number;
  /** Object ids standing in the home. */
  objects: readonly string[];
  /** Hours the AC ran this month. */
  acHours: number;
  layoutId: string;
}

export interface ElectricityBill {
  kwh: number;
  amount: number;
  /** Only the AC (rent covers the rest). */
  acOnly: boolean;
}

export function electricityBill(use: ElectricityUse, cfg: ElectricityConfig): ElectricityBill {
  const acKwh = use.acHours * cfg.acKw;
  const acOnly = cfg.includedIn.includes(use.layoutId);
  const daily = cfg.baseKwhPerDay + use.objects.reduce((sum, id) => sum + (cfg.objectKwhPerDay[id] ?? 0), 0);
  const kwh = acOnly ? acKwh : daily * use.days + acKwh;
  return { kwh: Math.round(kwh), amount: Math.round((kwh * cfg.tariffPerKwh) / 100) * 100, acOnly };
}

export type VehicleKind = 'motor' | 'car';

export interface VehicleConfig {
  /** Pertalite, rupiah per litre. */
  fuelPricePerLitre: number;
  kmPerLitre: Record<VehicleKind, number>;
  tankLitres: Record<VehicleKind, number>;
  /** Fill up when the tank falls below this share. */
  refuelBelow: number;
  serviceEveryKm: Record<VehicleKind, number>;
  serviceCost: Record<VehicleKind, number>;
  /** Real kilometres per metre driven on the neighbourhood map (the map is compressed). */
  kmPerMapMetre: number;
}

export interface VehicleState {
  /** Litres in the tank. */
  fuel: number;
  kmSinceService: number;
  odometer: number;
}

export function freshVehicle(kind: VehicleKind, cfg: VehicleConfig): VehicleState {
  return { fuel: cfg.tankLitres[kind], kmSinceService: 0, odometer: 0 };
}

export interface DriveResult {
  /** Filled up at the SPBU: rupiah paid and litres. */
  refuel?: { cost: number; litres: number };
  /** Taken in for its regular service. */
  service?: { cost: number };
}

/** Drives `km`: uses fuel, fills up when low, and gets serviced when due. Mutates `v`. */
export function drive(v: VehicleState, kind: VehicleKind, km: number, cfg: VehicleConfig): DriveResult {
  const out: DriveResult = {};
  v.fuel = Math.max(0, v.fuel - km / cfg.kmPerLitre[kind]);
  v.kmSinceService += km;
  v.odometer += km;
  if (v.fuel < cfg.tankLitres[kind] * cfg.refuelBelow) {
    const litres = cfg.tankLitres[kind] - v.fuel;
    v.fuel = cfg.tankLitres[kind];
    out.refuel = { cost: Math.round((litres * cfg.fuelPricePerLitre) / 500) * 500, litres: Math.round(litres * 10) / 10 };
  }
  if (v.kmSinceService >= cfg.serviceEveryKm[kind]) {
    v.kmSinceService = 0;
    out.service = { cost: cfg.serviceCost[kind] };
  }
  return out;
}
