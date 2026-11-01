import { z } from 'zod';

export const insightsRecipientSchema = z
  .object({
    keyId: z.string().regex(/^[0-9a-f]{64}$/),
    publicKey: z
      .string()
      .min(1)
      .max(1024)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export type InsightsRecipient = z.infer<typeof insightsRecipientSchema>;
