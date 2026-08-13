import { buildWorkflowTemporalContext } from './workflow-temporal-context';

describe('buildWorkflowTemporalContext', () => {
  it('captures the Cairo date and advances a past campaign start to today', () => {
    expect(
      buildWorkflowTemporalContext(
        {
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2026-09-01T00:00:00.000Z'),
        },
        new Date('2026-08-12T22:30:00.000Z'),
        'Africa/Cairo',
      ),
    ).toEqual({
      asOfDate: '2026-08-13',
      timeZone: 'Africa/Cairo',
      campaignStartDate: '2026-08-13',
      campaignEndDate: '2026-09-01',
    });
  });

  it('keeps a configured future campaign start', () => {
    expect(
      buildWorkflowTemporalContext(
        {
          startDate: new Date('2026-09-10T00:00:00.000Z'),
          endDate: null,
        },
        new Date('2026-08-13T08:00:00.000Z'),
        'Africa/Cairo',
      ).campaignStartDate,
    ).toBe('2026-09-10');
  });

  it('rejects a campaign whose end date is already behind the planning start', () => {
    expect(() =>
      buildWorkflowTemporalContext(
        {
          startDate: new Date('2026-07-01T00:00:00.000Z'),
          endDate: new Date('2026-08-01T00:00:00.000Z'),
        },
        new Date('2026-08-13T08:00:00.000Z'),
        'Africa/Cairo',
      ),
    ).toThrow('update the campaign dates before generating');
  });
});
