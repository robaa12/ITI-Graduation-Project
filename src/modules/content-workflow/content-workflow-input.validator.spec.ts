import { BadRequestException } from '@nestjs/common';

import { validateContentWorkflowInput } from './content-workflow-input.validator';

const validInput = {
  brandName: 'Shark & Sprout',
  product: 'Organic cotton baby tees',
  targetAudience: 'Eco-conscious parents',
  campaignStrategy: { summary: 'A launch campaign' },
  platforms: ['instagram', 'linkedin'],
  duration: '2 weeks',
  postsPerWeek: 3,
  generateImages: true,
  requireApproval: false,
};

describe('validateContentWorkflowInput', () => {
  it('accepts a valid content workflow request', () => {
    expect(() => validateContentWorkflowInput(validInput)).not.toThrow();
  });

  it.each(['brandName', 'product', 'targetAudience'])(
    'rejects an empty %s before it reaches Mastra',
    (field) => {
      expect(() =>
        validateContentWorkflowInput({ ...validInput, [field]: '  ' }),
      ).toThrow(BadRequestException);
    },
  );

  it('rejects unsupported platforms', () => {
    expect(() =>
      validateContentWorkflowInput({ ...validInput, platforms: ['threads'] }),
    ).toThrow(BadRequestException);
  });

  it('rejects a non-boolean generateImages value', () => {
    expect(() =>
      validateContentWorkflowInput({ ...validInput, generateImages: 'yes' }),
    ).toThrow(BadRequestException);
  });

  it('rejects more posts than the workflow supports', () => {
    expect(() =>
      validateContentWorkflowInput({ ...validInput, postsPerWeek: 21 }),
    ).toThrow('postsPerWeek must be an integer between 1 and 20');
  });

  // The pipeline would derive these from the strategy, but they are the three
  // numbers that decide what a run costs, so an omission is a request to
  // generate an unknown — and therefore unbillable — amount of work.
  it.each(['platforms', 'duration', 'postsPerWeek'])(
    'rejects a request that omits %s, because its size cannot be priced',
    (field) => {
      const { [field]: _omitted, ...withoutField } = validInput as Record<
        string,
        unknown
      >;
      expect(() => validateContentWorkflowInput(withoutField)).toThrow(
        BadRequestException,
      );
    },
  );

  it('rejects an empty platform list', () => {
    expect(() =>
      validateContentWorkflowInput({ ...validInput, platforms: [] }),
    ).toThrow('at least one supported social platform');
  });
});
