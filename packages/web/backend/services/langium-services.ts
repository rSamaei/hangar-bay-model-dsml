import { NodeFileSystem } from 'langium/node';
import { createAirfieldServices } from '../../../language/out/airfield-module.js';
import type { AirfieldServices } from '../../../language/out/airfield-module.js';

let servicesInstance: AirfieldServices | null = null;

export function getLangiumServices(): AirfieldServices {
  if (!servicesInstance) {
    const services = createAirfieldServices(NodeFileSystem);
    servicesInstance = services.Airfield;
  }
  return servicesInstance;
}