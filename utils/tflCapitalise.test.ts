// utils/tflCapitalise.test.ts
import { tflCapitalise } from './tflCapitalise';

describe('tflCapitalise', () => {
  it('title-cases a plain station name', () => {
    expect(tflCapitalise('oxford circus')).toBe('Oxford Circus');
  });

  it('preserves lowercase function words', () => {
    expect(tflCapitalise('museum of london')).toBe('Museum of London');
  });

  it('applies the TfL exceptions map', () => {
    expect(tflCapitalise("king's cross st. pancras")).toBe("King's Cross St. Pancras");
    expect(tflCapitalise('heathrow terminals 2 & 3')).toBe('Heathrow Terminals 2 & 3');
  });
});
