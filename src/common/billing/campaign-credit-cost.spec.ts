import { BadRequestException } from '@nestjs/common';

import { contentRunCreditCost } from './campaign-credit-cost';

describe('contentRunCreditCost', () => {
  it('charges one credit per post the run will produce', () => {
    expect(
      contentRunCreditCost({
        duration: '2 weeks',
        postsPerWeek: 4,
        platforms: ['instagram'],
      }),
    ).toBe(8);
  });

  it('multiplies by platform count, because each platform gets its own post', () => {
    expect(
      contentRunCreditCost({
        duration: '2 weeks',
        postsPerWeek: 4,
        platforms: ['instagram', 'x'],
      }),
    ).toBe(16);
  });

  it('reads a month as four weeks', () => {
    expect(
      contentRunCreditCost({
        duration: '1 month',
        postsPerWeek: 3,
        platforms: ['linkedin'],
      }),
    ).toBe(12);
  });

  it('rounds a part week up, since a part week still produces posts', () => {
    expect(
      contentRunCreditCost({
        duration: '10 days',
        postsPerWeek: 3,
        platforms: ['x'],
      }),
    ).toBe(5); // 10/7 * 3 = 4.28 -> 5
  });

  it('never charges less than one credit', () => {
    expect(
      contentRunCreditCost({
        duration: '1 day',
        postsPerWeek: 1,
        platforms: ['x'],
      }),
    ).toBe(1);
  });

  it.each([
    [{ postsPerWeek: 3, platforms: ['x'] }, 'duration'],
    [{ duration: 'soon', postsPerWeek: 3, platforms: ['x'] }, 'duration'],
    [{ duration: '1 week', platforms: ['x'] }, 'postsPerWeek'],
    [{ duration: '1 week', postsPerWeek: 0, platforms: ['x'] }, 'postsPerWeek'],
    [{ duration: '1 week', postsPerWeek: 2.5, platforms: ['x'] }, 'postsPerWeek'],
    [{ duration: '1 week', postsPerWeek: 3 }, 'platforms'],
    [{ duration: '1 week', postsPerWeek: 3, platforms: [] }, 'platforms'],
  ])('refuses to price a run whose size is unknown', (input, field) => {
    expect(() => contentRunCreditCost(input)).toThrow(BadRequestException);
    expect(() => contentRunCreditCost(input)).toThrow(field);
  });
});
