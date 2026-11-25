import type { UnitSystem } from '../types';

const KG_TO_LB = 2.2046226218;
const CM_TO_IN = 0.3937007874;
const ML_TO_OZ = 0.0338140227;

export function weightLabel(unit: UnitSystem): string {
  return unit === 'imperial' ? 'lb' : 'kg';
}

export function lengthLabel(unit: UnitSystem): string {
  return unit === 'imperial' ? 'in' : 'cm';
}

export function volumeFluidLabel(unit: UnitSystem): string {
  return unit === 'imperial' ? 'oz' : 'ml';
}

export function displayWeight(weightKg: number, unit: UnitSystem, decimals = 1): number {
  const val = unit === 'imperial' ? weightKg * KG_TO_LB : weightKg;
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

export function inputToKg(value: number, unit: UnitSystem): number {
  const kg = unit === 'imperial' ? value / KG_TO_LB : value;
  return Math.round(kg * 100) / 100;
}

export function displayLength(cm: number, unit: UnitSystem, decimals = 1): number {
  const val = unit === 'imperial' ? cm * CM_TO_IN : cm;
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

export function inputToCm(value: number, unit: UnitSystem): number {
  const cm = unit === 'imperial' ? value / CM_TO_IN : value;
  return Math.round(cm * 100) / 100;
}

export function displayFluid(ml: number, unit: UnitSystem): number {
  return unit === 'imperial' ? Math.round(ml * ML_TO_OZ) : Math.round(ml);
}
