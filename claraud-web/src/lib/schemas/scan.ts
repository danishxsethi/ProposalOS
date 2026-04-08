import { z } from "zod";

export const scanInputSchema = z.object({
    url: z.string().url("Please enter a valid URL").optional().or(z.literal('')),
    placeId: z.string().optional(),
    industry: z.string().optional(),
    competitors: z.array(z.string().url()).optional(),
    includeEmail: z.boolean().default(true),
    includeSocial: z.boolean().default(true),
});

export const emailGateSchema = z.object({
    email: z.string().email("Invalid email address"),
});

export type ScanInputType = z.infer<typeof scanInputSchema>;
export type EmailGateInput = z.infer<typeof emailGateSchema>;
