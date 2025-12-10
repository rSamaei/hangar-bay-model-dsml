import { createAirfieldServices } from '../../../language/out/airfield-module.js';
import { NodeFileSystem } from 'langium/node';
import type { AirfieldServices } from '../../../language/out/airfield-module.js';

let servicesInstance: AirfieldServices | null = null;

export function getServices(): AirfieldServices {
  if (!servicesInstance) {
    servicesInstance = createAirfieldServices(NodeFileSystem).Airfield;
  }
  return servicesInstance;
}