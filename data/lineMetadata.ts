// data/lineMetadata.ts
import { LINE_IDENTITY_COLORS } from '../constants/lineColors';

export const LINE_SHORT_NAMES: Record<string, string> = {
  bakerloo: 'Bakerloo',
  central: 'Central',
  circle: 'Circle',
  district: 'District',
  dlr: 'DLR',
  elizabeth: 'Elizabeth',
  'hammersmith-city': 'H&C',
  jubilee: 'Jubilee',
  metropolitan: 'Metropolitan',
  northern: 'Northern',
  overground: 'Overground',
  piccadilly: 'Piccadilly',
  victoria: 'Victoria',
  'waterloo-city': 'WL&City',
  // Overground branches
  weaver: 'Overground',
  mildmay: 'Overground',
  windrush: 'Overground',
  suffragette: 'Overground',
  lioness: 'Overground',
  liberty: 'Overground',
};

export const DARK_LINE_IDS = new Set(['northern', 'jubilee']);

export const LINE_BRAND_COLORS: Record<string, string> = { ...LINE_IDENTITY_COLORS };
