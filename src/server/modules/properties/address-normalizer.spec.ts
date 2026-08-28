import { describe, expect, it } from 'vitest';

import {
  normalizeAddress,
  normalizeStructuredAddress,
  parseAddressComponents,
} from './address-normalizer';

describe('normalizeAddress', () => {
  it.each([
    ['10 Example Street, Amsterdam, 1012 AB', '1012AB', 'amsterdam', '10'],
    ['10 Downing Street, London SW1A 2AA', 'SW1A2AA', 'london', '10'],
    ['1600 Pennsylvania Avenue NW, Washington, DC 20500', '20500', 'washington', '1600'],
    ['10 Main Street, Berlin, 10115', '10115', 'berlin', '10'],
    ['Drottninggatan 10, 111 51 Stockholm', '11151', 'stockholm', '10'],
  ])('normalizes %s', (rawAddress, postcode, city, houseNumber) => {
    expect(normalizeAddress(rawAddress)).toMatchObject({
      normalizedPostcode: postcode,
      normalizedCity: city,
      normalizedHouseNumber: houseNumber,
    });
  });

  it('does not treat a long house number as a generic numeric postcode', () => {
    expect(normalizeAddress('12345 Main Street, Springfield')).toMatchObject({
      normalizedPostcode: null,
      normalizedHouseNumber: '12345',
    });
  });

  it('normalizes city-first addresses', () => {
    expect(normalizeAddress('Amsterdam, Prinsengracht 263, 1016 GV')).toEqual({
      normalizedStreet: 'prinsengracht',
      normalizedHouseNumber: '263',
      normalizedCity: 'amsterdam',
      normalizedPostcode: '1016GV',
    });
  });

  it('uses structured components without guessing their order', () => {
    const address = parseAddressComponents('Amsterdam, Prinsengracht 263, 1016 GV');
    expect(address).toEqual({
      country: null,
      city: 'Amsterdam',
      street: 'Prinsengracht',
      houseNumber: '263',
      unit: null,
      postcode: '1016GV',
    });
    expect(
      normalizeStructuredAddress({
        country: 'Netherlands',
        city: 'Amsterdam',
        street: 'Prinsengracht',
        houseNumber: '263',
        unit: 'A',
        postcode: '1016 GV',
      }),
    ).toEqual({
      normalizedStreet: 'prinsengracht',
      normalizedHouseNumber: '263',
      normalizedCity: 'amsterdam',
      normalizedPostcode: '1016GV',
    });
  });
});
