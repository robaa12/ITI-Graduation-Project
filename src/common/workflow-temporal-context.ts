import type { Campaign } from '@prisma/client';

export interface WorkflowTemporalContext {
  asOfDate: string;
  timeZone: string;
  campaignStartDate: string;
  campaignEndDate: string | null;
}

export function buildWorkflowTemporalContext(
  campaign: Pick<Campaign, 'startDate' | 'endDate'>,
  now = new Date(),
  timeZone = process.env.WORKFLOW_TIME_ZONE ?? 'Africa/Cairo',
): WorkflowTemporalContext {
  const asOfDate = dateInTimeZone(now, timeZone);
  const configuredStartDate = campaign.startDate
    ? campaign.startDate.toISOString().slice(0, 10)
    : null;
  const campaignStartDate =
    configuredStartDate && configuredStartDate > asOfDate
      ? configuredStartDate
      : asOfDate;
  const campaignEndDate = campaign.endDate
    ? campaign.endDate.toISOString().slice(0, 10)
    : null;

  if (campaignEndDate && campaignEndDate < campaignStartDate) {
    throw new Error(
      `Campaign end date ${campaignEndDate} is before the authoritative planning start ${campaignStartDate}; update the campaign dates before generating`,
    );
  }

  return {
    asOfDate,
    timeZone,
    campaignStartDate,
    campaignEndDate,
  };
}

function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
