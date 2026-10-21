// data/lineMetadata.ts
import { LINE_IDENTITY_COLORS } from '../constants/lineColors';

export const LINE_SHORT_NAMES: Record<string, string> = {
  bakerloo: 'BAK',
  central: 'CEN',
  circle: 'CIR',
  district: 'DIS',
  dlr: 'DLR',
  elizabeth: 'ELI',
  'hammersmith-city': 'H&C',
  jubilee: 'JUB',
  metropolitan: 'MET',
  northern: 'NOR',
  overground: 'OVR',
  piccadilly: 'PIC',
  victoria: 'VIC',
  'waterloo-city': 'W&C',
  // Overground branches
  weaver: 'WEA',
  mildmay: 'MLD',
  windrush: 'WND',
  suffragette: 'SUF',
  lioness: 'LIO',
  liberty: 'LIB',
};

export const DARK_LINE_IDS = new Set(['northern', 'jubilee']);

export const LINE_BRAND_COLORS: Record<string, string> = { ...LINE_IDENTITY_COLORS };
