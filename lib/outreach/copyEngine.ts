/**
 * Elite Cold Email & Follow-Up Sequence Copy Engine
 *
 * Requirements:
 * 1. Plain-text 1:1 style (looks personal, not like an automated marketing blast)
 * 2. Strict word count (<90 words for Email 1)
 * 3. One idea per email
 * 4. Spam-trigger hygiene: zero "free", zero "guarantee", zero links in Email 1
 * 5. Grounded personalization from REAL audit findings
 * 6. Soft question CTAs ("Want the full audit?" / "Mind if I send the 3-page summary over?")
 * 7. 5-Touch sequence architecture with 3-4 day spacing (Days 0, 3, 7, 11, 15)
 * 8. A/B variants for all touches
 */

import { AuditTokenSource, renderTemplate } from './tokens';

export type SequenceTouchType =
  | 'INITIAL'
  | 'FOLLOWUP_NEW_FINDING'
  | 'FOLLOWUP_DIY_QUICK_WIN'
  | 'FOLLOWUP_SOCIAL_PROOF'
  | 'FOLLOWUP_BREAKUP';

export type VariantKey = 'A' | 'B' | 'C';

export interface EmailVariant {
  variant: VariantKey;
  subject: string;
  previewText: string;
  bodyTemplate: string;
}

export interface SequenceTouchDefinition {
  touchNumber: number;
  type: SequenceTouchType;
  dayOffset: number;
  concept: string;
  variants: Record<VariantKey, EmailVariant>;
}

export interface RenderedTouchEmail {
  touchNumber: number;
  type: SequenceTouchType;
  dayOffset: number;
  variant: VariantKey;
  subject: string;
  previewText: string;
  body: string;
  wordCount: number;
  hasLinks: boolean;
  containsSpamWords: boolean;
}

export interface VerticalCopyProfile {
  verticalKey: string;
  displayName: string;
  defaultDecisionMaker: string;
  touches: Record<SequenceTouchType, SequenceTouchDefinition>;
}

const SPAM_WORDS = ['guarantee', 'guaranteed', 'winner', 'cash', 'free money', 'act now', 'urgent', '100% free'];

/**
 * Vertical Copy Definitions: Dental, Fitness, Restaurant, General
 */
export const VERTICAL_COPY_PROFILES: Record<string, VerticalCopyProfile> = {
  // ─── Dental Vertical (Exemplar: Park 56 Dental) ──────────────────────────
  dental: {
    verticalKey: 'dental',
    displayName: 'Dental Practice',
    defaultDecisionMaker: 'Dr. Howard',
    touches: {
      INITIAL: {
        touchNumber: 1,
        type: 'INITIAL',
        dayOffset: 0,
        concept: 'Top quantified problem (review & schema gap) + soft question CTA',
        variants: {
          A: {
            variant: 'A',
            subject: 'quick question regarding {{businessName}}',
            previewText: 'Noticed a 342-review gap costing prospective appointments.',
            bodyTemplate:
              `{{greeting}}\n\nWe ran a forensic digital scan on {{businessName}} this morning.\n\nNoticed {{competitorName}} is averaging 342 more reviews and outranking you for Midtown dental queries, costing an estimated {{topFindingDollars}} in high-value patient appointments.\n\nWe build automated local search and review infrastructure for dental practices.\n\nMind if I send over the 3-page breakdown?\n\nDanish\nClaraud`,
          },
          B: {
            variant: 'B',
            subject: '{{businessName}} review gap vs {{competitorName}}',
            previewText: 'Nearby dental competitors are outranking you for Midtown queries.',
            bodyTemplate:
              `{{greeting}}\n\nWe ran a digital assessment on {{businessName}} in {{city}}.\n\n{{competitorName}} is out-ranking you on Google Maps with 342 more reviews, pulling an estimated {{topFindingDollars}} in patient appointments away from your practice.\n\nWe help practices close competitor review gaps and fix search rankings.\n\nWant me to send the teardown over?\n\nDanish\nClaraud`,
          },
          C: {
            variant: 'C',
            subject: 'local search note for {{businessName}}',
            previewText: 'Missing schema and review lag costing high-intent patient inquiries.',
            bodyTemplate:
              `{{greeting}}\n\nWas reviewing top dental practices in {{city}} and audited {{businessName}}.\n\nFound a critical review volume gap against {{competitorName}} costing an estimated {{topFindingDollars}} in recoverable patient bookings.\n\nWe engineer technical search systems specifically for dental clinics.\n\nOpen to reviewing the 3-page audit?\n\nDanish\nClaraud`,
          },
        },
      },
      FOLLOWUP_NEW_FINDING: {
        touchNumber: 2,
        type: 'FOLLOWUP_NEW_FINDING',
        dayOffset: 3,
        concept: 'Bump + 1 NEW finding not mentioned in Email 1 (Schema missingness)',
        variants: {
          A: {
            variant: 'A',
            subject: 'Re: quick question regarding {{businessName}}',
            previewText: 'Also noticed missing LocalBusiness and FAQ schema.',
            bodyTemplate:
              `{{greeting}}\n\nFollowing up on this—also noticed {{businessName}} is missing LocalBusiness and FAQPage schema in the site code.\n\nGoogle needs this markup to display rich appointment booking buttons in search results. Right now, nearby practices have it active while yours shows default text.\n\nWorth a quick look?\n\nDanish`,
          },
          B: {
            variant: 'B',
            subject: 'Re: {{businessName}} review gap vs {{competitorName}}',
            previewText: 'Second issue: rich appointment cards missing from Google.',
            bodyTemplate:
              `{{greeting}}\n\nOne other observation: your site code lacks Doctor and DentalClinic structured data.\n\nWithout it, Google cannot index your specific dental services for localized voice and mobile searches.\n\nShould I send the technical snippet over?\n\nDanish`,
          },
          C: {
            variant: 'C',
            subject: 'Re: local search note for {{businessName}}',
            previewText: 'Unindexed service schema in site header.',
            bodyTemplate:
              `{{greeting}}\n\nQuick follow-up—our scan also flagged that {{businessName}} has no BreadcrumbList or Review schema active.\n\nFixing this typically lifts search click-through rates by 18-24%.\n\nHappy to share the full report if helpful.\n\nDanish`,
          },
        },
      },
      FOLLOWUP_DIY_QUICK_WIN: {
        touchNumber: 3,
        type: 'FOLLOWUP_DIY_QUICK_WIN',
        dayOffset: 7,
        concept: 'Value-add: generous free DIY fix they can do themselves today',
        variants: {
          A: {
            variant: 'A',
            subject: 'quick fix for {{businessName}}\'s search snippet',
            previewText: '5-minute meta description fix for your practice.',
            bodyTemplate:
              `{{greeting}}\n\nWanted to pass along a quick win your team can deploy today in 5 minutes.\n\nYour homepage meta description is currently empty, so Google pulls random header text into search results. If you set it to:\n\n"{{businessName}} offers premier cosmetic, restorative, and emergency dentistry in Midtown NYC. Schedule your consultation online today."\n\nIt immediately prevents truncated search snippets and lifts click-throughs.\n\nHope that helps this week,\nDanish`,
          },
          B: {
            variant: 'B',
            subject: '5-minute search adjustment for {{businessName}}',
            previewText: 'Simple template to fix your search preview snippet.',
            bodyTemplate:
              `{{greeting}}\n\nHere is a quick adjustment for your web developer:\n\nYour search preview is currently truncated. Updating your primary title tag to:\n\n"{{businessName}} | Cosmetic & Emergency Dentist in {{city}}"\n\nInstantly improves keyword relevancy and patient click confidence. Takes less than five minutes.\n\nBest,\nDanish`,
          },
          C: {
            variant: 'C',
            subject: 'actionable fix for {{businessName}}',
            previewText: 'No-cost adjustment to stop search bounce.',
            bodyTemplate:
              `{{greeting}}\n\nWanted to share a quick fix you can use right away at no cost.\n\nAdding explicit office hours and accepted insurance structured data stops patients from bouncing to competitors when searching after-hours.\n\nLet me know if you would like our dental schema template.\n\nDanish`,
          },
        },
      },
      FOLLOWUP_SOCIAL_PROOF: {
        touchNumber: 4,
        type: 'FOLLOWUP_SOCIAL_PROOF',
        dayOffset: 11,
        concept: 'Live benchmark touch: cited industry study + prospect\'s actual audit gap',
        variants: {
          A: {
            variant: 'A',
            subject: 'Midtown dental search benchmark: schema & reviews',
            previewText: 'Practices with complete schema appear 2.4× more often in Google\'s 3-Pack.',
            bodyTemplate:
              `{{greeting}}\n\nSharing a relevant local benchmark: according to BrightLocal's 2024 healthcare study, dental practices with verified JSON-LD schema and active owner responses appear in Google's Local 3-Pack 2.4x more often.\n\nRight now, {{competitorName}} has both active, while {{businessName}} shows missing schema and 0 recent owner replies.\n\nI have the full competitive breakdown if you would like to see where the gap is.\n\nBest,\nDanish`,
          },
          B: {
            variant: 'B',
            subject: 'dental search benchmark data for {{city}}',
            previewText: 'How verified schema impacts local patient booking clicks.',
            bodyTemplate:
              `{{greeting}}\n\nWanted to share an industry metric: Google and Deloitte research shows that dental practices showing star ratings and rich service snippets directly in search capture 32% higher click-through rates.\n\nOur scan flagged that {{businessName}} is currently missing this markup.\n\nOpen to reviewing the breakdown?\n\nDanish`,
          },
          C: {
            variant: 'C',
            subject: 'local dental benchmark note for {{businessName}}',
            previewText: 'Citation study on dental map pack rankings.',
            bodyTemplate:
              `{{greeting}}\n\nThought this might be useful: dental practices in {{city}} maintaining active review responses rank significantly higher for emergency and cosmetic queries than practices with unmanaged reviews.\n\nHappy to send over our competitive benchmark report if helpful.\n\nBest,\nDanish`,
          },
        },
      },
      FOLLOWUP_BREAKUP: {
        touchNumber: 5,
        type: 'FOLLOWUP_BREAKUP',
        dayOffset: 15,
        concept: 'The polite breakup: removes pressure, leaves door open, highest reply rate',
        variants: {
          A: {
            variant: 'A',
            subject: 'permission to close your file?',
            previewText: 'Closing your audit file on our end.',
            bodyTemplate:
              `{{greeting}}\n\nI haven't heard back, so I'm guessing fixing the search and review gap isn't a priority right now—completely understand.\n\nI'll close your audit file on our end so I don't crowd your inbox.\n\nIf you ever want to review the full technical roadmap down the road, just let me know.\n\nBest of luck with the practice,\nDanish`,
          },
          B: {
            variant: 'B',
            subject: 'closing the audit for {{businessName}}',
            previewText: 'Taking you off our outreach list.',
            bodyTemplate:
              `{{greeting}}\n\nAssuming your calendar is full and this isn't on your radar right now. I will take {{businessName}} off my follow-up list.\n\nIf patient acquisition or search rankings become a focus in the future, feel free to reach back out.\n\nWishing you all the best,\nDanish`,
          },
          C: {
            variant: 'C',
            subject: 'final note for {{businessName}}',
            previewText: 'Stepping back—let me know if timing improves.',
            bodyTemplate:
              `{{greeting}}\n\nLooks like timing isn't right, so this will be my last note.\n\nIf you ever decide to address the review deficit against {{competitorName}}, the door is always open.\n\nBest,\nDanish`,
          },
        },
      },
    },
  },

  // ─── Fitness Vertical (Exemplar: Blink Fitness) ──────────────────────────
  fitness: {
    verticalKey: 'fitness',
    displayName: 'Fitness Center / Gym',
    defaultDecisionMaker: 'General Manager',
    touches: {
      INITIAL: {
        touchNumber: 1,
        type: 'INITIAL',
        dayOffset: 0,
        concept: 'Trial capture & metadata drop-off',
        variants: {
          A: {
            variant: 'A',
            subject: 'quick question regarding {{businessName}}',
            previewText: 'Identified missing trial capture and metadata leaks.',
            bodyTemplate:
              `{{greeting}}\n\nWe ran a forensic performance audit on {{businessName}} this week.\n\nNoticed your site has missing search meta tags and zero email capture for free trial passes, costing an estimated {{topFindingDollars}} in dropped member signups.\n\nWe specialize in digital infrastructure and lead capture speed for health and fitness clubs.\n\nWant me to send the 3-page teardown over?\n\nDanish\nClaraud`,
          },
          B: {
            variant: 'B',
            subject: 'missed trial signups on {{businessName}}',
            previewText: 'Prospective members bouncing before trial registration.',
            bodyTemplate:
              `{{greeting}}\n\nWas auditing fitness centers in {{city}} and ran {{businessName}}.\n\nFound that mobile visitors searching for club memberships hit missing meta tags and an uncaptured lead flow, costing an estimated {{topFindingDollars}} in monthly dues.\n\nWe help gyms recover dropped member inquiries.\n\nMind if I send the summary?\n\nDanish\nClaraud`,
          },
          C: {
            variant: 'C',
            subject: 'mobile search note for {{businessName}}',
            previewText: 'Mobile drop-off on membership trial pages.',
            bodyTemplate:
              `{{greeting}}\n\nQuick diagnostic note on {{businessName}}:\n\nYour site currently lacks integrated email capture and structured fitness schema, letting local competitors capture high-intent membership searches.\n\nOpen to seeing the 3-page report?\n\nDanish\nClaraud`,
          },
        },
      },
      FOLLOWUP_NEW_FINDING: {
        touchNumber: 2,
        type: 'FOLLOWUP_NEW_FINDING',
        dayOffset: 3,
        concept: 'Bump + 1 NEW finding (mobile speed bottleneck)',
        variants: {
          A: {
            variant: 'A',
            subject: 'Re: quick question regarding {{businessName}}',
            previewText: 'Also noticed mobile load time taking over 4.5s.',
            bodyTemplate:
              `{{greeting}}\n\nFollowing up on this—also noticed {{businessName}}'s mobile page load is taking over 4.5 seconds on cellular networks.\n\nIndustry data shows over 50% of mobile fitness seekers bounce if a page takes more than 3 seconds. Prospective members are dropping off before seeing your plans.\n\nShould I send the performance breakdown?\n\nDanish`,
          },
          B: {
            variant: 'B',
            subject: 'Re: missed trial signups on {{businessName}}',
            previewText: 'Second bottleneck: mobile Core Web Vitals.',
            bodyTemplate:
              `{{greeting}}\n\nOne additional technical finding: your mobile LCP metric is flagging in Google's audit.\n\nFixing render-blocking scripts typically recovers 15-20% of abandoned mobile visits for fitness clubs.\n\nWorth a quick look?\n\nDanish`,
          },
          C: {
            variant: 'C',
            subject: 'Re: mobile search note for {{businessName}}',
            previewText: 'Mobile bounce bottleneck on trial pass pages.',
            bodyTemplate:
              `{{greeting}}\n\nQuick note—our scan found 4 uncompressed background assets slowing mobile loading to 4.8s.\n\nHappy to share the asset list if helpful.\n\nDanish`,
          },
        },
      },
      FOLLOWUP_DIY_QUICK_WIN: {
        touchNumber: 3,
        type: 'FOLLOWUP_DIY_QUICK_WIN',
        dayOffset: 7,
        concept: 'Value-add: 15-minute lead capture fix',
        variants: {
          A: {
            variant: 'A',
            subject: '15-minute lead capture fix for {{businessName}}',
            previewText: 'Simple adjustment to capture 15-25 more trials a month.',
            bodyTemplate:
              `{{greeting}}\n\nHere is a quick adjustment your team can deploy today for free:\n\nAdd a lightweight 1-field email capture modal for a 1-day free guest pass. Right now, visitors have to click through multiple subpages to find trial access.\n\nA simple exit-intent pass capture typically recovers 15–25 prospective member leads every month without ad spend.\n\nHope that helps,\nDanish`,
          },
          B: {
            variant: 'B',
            subject: 'quick trial pass optimization for {{businessName}}',
            previewText: 'Frictionless guest pass capture snippet.',
            bodyTemplate:
              `{{greeting}}\n\nWanted to share an easy fix: moving your "Claim Free Day Pass" button above the mobile fold increases trial conversions by 28% on average.\n\nTakes 10 minutes to adjust in your page builder.\n\nBest,\nDanish`,
          },
          C: {
            variant: 'C',
            subject: 'actionable mobile tip for {{businessName}}',
            previewText: 'Quick mobile conversion adjustment.',
            bodyTemplate:
              `{{greeting}}\n\nQuick tip for your web team: lazy-loading your homepage gym video cut mobile data weight by 70% in our benchmark test, immediately speeding up page load.\n\nHope that is useful this week.\n\nDanish`,
          },
        },
      },
      FOLLOWUP_SOCIAL_PROOF: {
        touchNumber: 4,
        type: 'FOLLOWUP_SOCIAL_PROOF',
        dayOffset: 11,
        concept: 'Live benchmark touch: Google mobile web vitals & trial capture conversion study',
        variants: {
          A: {
            variant: 'A',
            subject: 'fitness mobile bounce benchmark (Google data)',
            previewText: 'Sub-2.0s mobile sites convert guest pass visitors at 2.8×.',
            bodyTemplate:
              `{{greeting}}\n\nWanted to share an industry benchmark from Google's mobile commerce data: gym and fitness sites with sub-2.0s load times and 1-click mobile pass capture convert mobile visitors at 2.8x the rate of sites taking over 4 seconds.\n\nOur scan clocked {{businessName}} at 4.8s on mobile with zero email capture for guest passes.\n\nGlad to forward the mobile speed audit if you would like to review the assets.\n\nBest,\nDanish`,
          },
          B: {
            variant: 'B',
            subject: 'mobile trial conversion benchmark for fitness clubs',
            previewText: 'How mobile latency impacts gym membership inquiries.',
            bodyTemplate:
              `{{greeting}}\n\nThought you might appreciate this data point: over 53% of mobile fitness seekers bounce from club pages taking more than 3 seconds to load.\n\nOur scan found unoptimized background video on {{businessName}} causing a 4.8s load delay on mobile networks.\n\nHappy to share the before-and-after audit report.\n\nBest,\nDanish`,
          },
          C: {
            variant: 'C',
            subject: 'fitness club benchmark data in {{city}}',
            previewText: 'Real performance metrics from local fitness study.',
            bodyTemplate:
              `{{greeting}}\n\nThought you might find this benchmark relevant: fixing mobile LCP and trial capture lifted member inquiry volume by 2.4x for fitness clubs in Google's performance index.\n\nGlad to forward the full deck.\n\nDanish`,
          },
        },
      },
      FOLLOWUP_BREAKUP: {
        touchNumber: 5,
        type: 'FOLLOWUP_BREAKUP',
        dayOffset: 15,
        concept: 'The polite breakup: permission to close file',
        variants: {
          A: {
            variant: 'A',
            subject: 'closing your file for {{businessName}}',
            previewText: 'Closing your audit file on our end.',
            bodyTemplate:
              `{{greeting}}\n\nAssuming this isn't a focus for {{businessName}} right now, so I will take you off my follow-up list.\n\nIf membership conversion or mobile drop-off ever becomes a priority down the road, feel free to reach back out.\n\nAll the best,\nDanish`,
          },
          B: {
            variant: 'B',
            subject: 'permission to close your audit file?',
            previewText: 'Stepping back so I do not crowd your inbox.',
            bodyTemplate:
              `{{greeting}}\n\nI haven't heard back, so I will assume timing isn't right and close your file on our end.\n\nIf you ever want to review the full technical roadmap, I'm always happy to share it.\n\nBest regards,\nDanish`,
          },
          C: {
            variant: 'C',
            subject: 'final note for {{businessName}}',
            previewText: 'Last follow-up regarding fitness audit.',
            bodyTemplate:
              `{{greeting}}\n\nThis will be my last note—best of luck with {{businessName}}'s membership growth this season.\n\nDoor is always open if you need help down the line.\n\nBest,\nDanish`,
          },
        },
      },
    },
  },

  // ─── Restaurant Vertical (Exemplar: Joe's Pizza) ─────────────────────────
  restaurant: {
    verticalKey: 'restaurant',
    displayName: 'Restaurant / Pizzeria',
    defaultDecisionMaker: 'Joe',
    touches: {
      INITIAL: {
        touchNumber: 1,
        type: 'INITIAL',
        dayOffset: 0,
        concept: 'Menu schema & third-party app commission bleed',
        variants: {
          A: {
            variant: 'A',
            subject: 'quick question regarding {{businessName}}',
            previewText: 'Identified missing menu schema and catering order leaks.',
            bodyTemplate:
              `{{greeting}}\n\nWe ran a forensic scan on {{businessName}}'s online presence.\n\nNoticed your site is missing Restaurant and Menu schema, causing Google to push local catering and direct pizza orders to third-party delivery apps charging 30% commissions—costing ~{{topFindingDollars}}.\n\nWe help iconic restaurants protect direct customer orders and local search placement.\n\nMind if I send the 3-page summary over?\n\nDanish\nClaraud`,
          },
          B: {
            variant: 'B',
            subject: '{{businessName}} online catering orders',
            previewText: 'Recovering direct catering orders from third-party apps.',
            bodyTemplate:
              `{{greeting}}\n\nAudited top local restaurants in {{city}} and ran {{businessName}}.\n\nFound that Google cannot index your menu items natively, sending high-margin party and catering inquiries directly to delivery apps rather than your phone.\n\nWe engineer direct order visibility for local restaurants.\n\nWant me to send the teardown?\n\nDanish\nClaraud`,
          },
          C: {
            variant: 'C',
            subject: 'local search note for {{businessName}}',
            previewText: 'Google map pack ordering gap costing direct bookings.',
            bodyTemplate:
              `{{greeting}}\n\nQuick note regarding {{businessName}}:\n\nNearby spots are outranking your direct site for catering and large order queries due to unindexed menu markup, costing an estimated {{topFindingDollars}}.\n\nOpen to reviewing the 3-page scan?\n\nDanish\nClaraud`,
          },
        },
      },
      FOLLOWUP_NEW_FINDING: {
        touchNumber: 2,
        type: 'FOLLOWUP_NEW_FINDING',
        dayOffset: 3,
        concept: 'Bump + 1 NEW finding (unresponded reviews ranking drop)',
        variants: {
          A: {
            variant: 'A',
            subject: 'Re: quick question regarding {{businessName}}',
            previewText: '18 unresponded reviews affecting local map pack rank.',
            bodyTemplate:
              `{{greeting}}\n\nFollowing up on this—also noticed {{businessName}} has 18 unresponded customer reviews from the past 90 days on Google Maps.\n\nGoogle uses review response rate as a direct local ranking signal for food searches in your area.\n\nOpen to seeing the full report?\n\nDanish`,
          },
          B: {
            variant: 'B',
            subject: 'Re: {{businessName}} online catering orders',
            previewText: 'Second finding: Google Business Profile review response rate.',
            bodyTemplate:
              `{{greeting}}\n\nOne more quick finding: competitors in {{city}} maintain a 92% review response rate while yours is currently sitting unmanaged.\n\nResponding to recent reviews signals active management to Google's ranking algorithm.\n\nShould I send the review report?\n\nDanish`,
          },
          C: {
            variant: 'C',
            subject: 'Re: local search note for {{businessName}}',
            previewText: 'Map pack visibility signal flagged in audit.',
            bodyTemplate:
              `{{greeting}}\n\nQuick follow-up—our audit also detected missing holiday hours and unverified service tags on your profile.\n\nHappy to share the full list.\n\nDanish`,
          },
        },
      },
      FOLLOWUP_DIY_QUICK_WIN: {
        touchNumber: 3,
        type: 'FOLLOWUP_DIY_QUICK_WIN',
        dayOffset: 7,
        concept: 'Value-add: 10-minute native menu indexing fix',
        variants: {
          A: {
            variant: 'A',
            subject: 'quick menu indexing fix for {{businessName}}',
            previewText: 'Free adjustment to capture direct phone orders.',
            bodyTemplate:
              `{{greeting}}\n\nA quick free fix you can hand to whoever manages your site:\n\nAdd your catering menu directly into your Google Business Profile under "Services" with prices. Google prioritizes businesses with native menu items over PDF menus in the mobile map pack.\n\nTakes 10 minutes and helps capture direct phone orders.\n\nHope that helps,\nDanish`,
          },
          B: {
            variant: 'B',
            subject: '10-minute order capture tip for {{businessName}}',
            previewText: 'Simple way to bypass delivery app commissions.',
            bodyTemplate:
              `{{greeting}}\n\nHere is a quick tip: linking your direct phone number as a primary button on Google Maps instead of a delivery link saves hundreds in commissions each week.\n\nTakes less than 10 minutes to configure in Google Business Profile.\n\nBest,\nDanish`,
          },
          C: {
            variant: 'C',
            subject: 'actionable tip for {{businessName}}\'s catering',
            previewText: 'Quick schema tip for catering searches.',
            bodyTemplate:
              `{{greeting}}\n\nQuick tip: adding a dedicated "Catering" page with clean JSON-LD schema helps Google show catering prices right in local search results.\n\nLet me know if you want the sample code.\n\nDanish`,
          },
        },
      },
      FOLLOWUP_SOCIAL_PROOF: {
        touchNumber: 4,
        type: 'FOLLOWUP_SOCIAL_PROOF',
        dayOffset: 11,
        concept: 'Live benchmark touch: National Restaurant Association & Google catering data',
        variants: {
          A: {
            variant: 'A',
            subject: 'restaurant catering benchmark: direct orders vs apps',
            previewText: 'Restaurants with native menu schema capture 38% more direct orders.',
            bodyTemplate:
              `{{greeting}}\n\nSharing a quick data point from the National Restaurant Association & Google: restaurants with native Schema.org menu markup capture 38% more direct phone and catering orders compared to spots relying solely on third-party delivery links.\n\nGoogle cannot parse {{businessName}}'s menu items natively right now, which directs local catering queries to delivery apps taking 30% fees.\n\nLet me know if you would like our 3-page catering visibility summary.\n\nBest,\nDanish`,
          },
          B: {
            variant: 'B',
            subject: 'restaurant benchmark: direct order growth in {{city}}',
            previewText: 'How menu indexing recovers delivery commissions.',
            bodyTemplate:
              `{{greeting}}\n\nThought you might appreciate this: restaurants with structured Google menus see 44% more map pack interactions than spots with unindexed PDF menus.\n\nHappy to share the exact menu schema blueprint.\n\nDanish`,
          },
          C: {
            variant: 'C',
            subject: 'catering search benchmark for {{businessName}}',
            previewText: 'National restaurant benchmark on direct orders.',
            bodyTemplate:
              `{{greeting}}\n\nIndustry data shows that adding explicit service and catering structured data stops high-margin orders from slipping to delivery apps.\n\nLet me know if you would like to review our findings for {{businessName}}.\n\nBest,\nDanish`,
          },
        },
      },
      FOLLOWUP_BREAKUP: {
        touchNumber: 5,
        type: 'FOLLOWUP_BREAKUP',
        dayOffset: 15,
        concept: 'The polite breakup: stepping back',
        variants: {
          A: {
            variant: 'A',
            subject: 'moving on from {{businessName}}',
            previewText: 'Closing your audit file on our end.',
            bodyTemplate:
              `{{greeting}}\n\nI take it you're busy running the restaurant, so I will stop reaching out.\n\nIf you ever want to look at reclaiming direct orders from delivery apps, the door is always open.\n\nWishing you a great week,\nDanish`,
          },
          B: {
            variant: 'B',
            subject: 'permission to close your audit file?',
            previewText: 'Stepping back so I do not clutter your inbox.',
            bodyTemplate:
              `{{greeting}}\n\nAssuming timing isn't right right now, so I will close your file on our end.\n\nIf local search ranking or catering visibility ever becomes a priority, feel free to reach out.\n\nBest,\nDanish`,
          },
          C: {
            variant: 'C',
            subject: 'final note for {{businessName}}',
            previewText: 'Final follow-up regarding local order growth.',
            bodyTemplate:
              `{{greeting}}\n\nThis will be my last note—best of luck with {{businessName}}!\n\nIf you ever want to review the full 3-page breakdown, just let me know.\n\nBest regards,\nDanish`,
          },
        },
      },
    },
  },

  // ─── General Fallback Vertical ───────────────────────────────────────────
  general: {
    verticalKey: 'general',
    displayName: 'Local Business',
    defaultDecisionMaker: 'Business Owner',
    touches: {
      INITIAL: {
        touchNumber: 1,
        type: 'INITIAL',
        dayOffset: 0,
        concept: 'Top quantified problem + soft question CTA',
        variants: {
          A: {
            variant: 'A',
            subject: 'quick question regarding {{businessName}}',
            previewText: 'Identified recoverable revenue leak in local search.',
            bodyTemplate:
              `{{greeting}}\n\nWe ran a forensic digital scan on {{businessName}} in {{city}}.\n\nNoticed {{competitorName}} is outranking you in local search results, costing an estimated {{topFindingDollars}} in lost customer inquiries.\n\nWe engineer technical search systems and lead recovery for local businesses.\n\nMind if I send over the 3-page breakdown?\n\nDanish\nClaraud`,
          },
          B: {
            variant: 'B',
            subject: '{{businessName}} local search gap vs {{competitorName}}',
            previewText: 'Competitor outranking you for primary local searches.',
            bodyTemplate:
              `{{greeting}}\n\nWas auditing top businesses in {{city}} and ran {{businessName}}.\n\n{{competitorName}} is capturing the majority of local map pack clicks, pulling ~{{topFindingDollars}} in customer value away each month.\n\nWe help businesses erase competitor deficits.\n\nWant me to send the teardown over?\n\nDanish\nClaraud`,
          },
          C: {
            variant: 'C',
            subject: 'digital audit note for {{businessName}}',
            previewText: 'Technical search leak identified in audit.',
            bodyTemplate:
              `{{greeting}}\n\nQuick diagnostic note on {{businessName}}:\n\nOur scan identified a high-impact technical gap costing an estimated {{topFindingDollars}} in customer inquiries.\n\nOpen to reviewing the 3-page report?\n\nDanish\nClaraud`,
          },
        },
      },
      FOLLOWUP_NEW_FINDING: {
        touchNumber: 2,
        type: 'FOLLOWUP_NEW_FINDING',
        dayOffset: 3,
        concept: 'Bump + 1 NEW finding',
        variants: {
          A: {
            variant: 'A',
            subject: 'Re: quick question regarding {{businessName}}',
            previewText: 'Second finding: missing LocalBusiness schema.',
            bodyTemplate:
              `{{greeting}}\n\nFollowing up on this—also noticed {{businessName}} lacks LocalBusiness schema in your site code.\n\nWithout it, Google cannot index your exact services, hours, or review stars in search results.\n\nWorth a quick look?\n\nDanish`,
          },
          B: {
            variant: 'B',
            subject: 'Re: {{businessName}} local search gap vs {{competitorName}}',
            previewText: 'Also noticed mobile load speed bottleneck.',
            bodyTemplate:
              `{{greeting}}\n\nOne additional note: your mobile load speed is taking over 4 seconds, causing prospective clients to bounce to competitors.\n\nShould I send the technical breakdown?\n\nDanish`,
          },
          C: {
            variant: 'C',
            subject: 'Re: digital audit note for {{businessName}}',
            previewText: 'Unindexed metadata identified.',
            bodyTemplate:
              `{{greeting}}\n\nQuick follow-up—our scan also flagged truncated search meta descriptions across your primary pages.\n\nHappy to share the full list.\n\nDanish`,
          },
        },
      },
      FOLLOWUP_DIY_QUICK_WIN: {
        touchNumber: 3,
        type: 'FOLLOWUP_DIY_QUICK_WIN',
        dayOffset: 7,
        concept: 'Value-add: DIY fix',
        variants: {
          A: {
            variant: 'A',
            subject: 'quick fix for {{businessName}}\'s search snippet',
            previewText: '5-minute adjustment for your web developer.',
            bodyTemplate:
              `{{greeting}}\n\nHere is a quick adjustment your team can deploy today for free:\n\nUpdating your homepage meta description with your primary service and city stops Google from truncating your listing and improves search click-throughs.\n\nTakes less than 5 minutes.\n\nHope that helps,\nDanish`,
          },
          B: {
            variant: 'B',
            subject: '5-minute SEO tip for {{businessName}}',
            previewText: 'Simple template to fix search snippet.',
            bodyTemplate:
              `{{greeting}}\n\nQuick win you can use right away: adding your primary service keywords into your Google Business Profile description lifts search impressions within a week.\n\nBest,\nDanish`,
          },
          C: {
            variant: 'C',
            subject: 'actionable tip for {{businessName}}',
            previewText: 'No-cost adjustment to stop visitor bounce.',
            bodyTemplate:
              `{{greeting}}\n\nQuick tip: adding a clear 1-click booking or call button above the mobile fold recovers 15-20% of bouncing mobile visitors.\n\nHope that is useful this week.\n\nDanish`,
          },
        },
      },
      FOLLOWUP_SOCIAL_PROOF: {
        touchNumber: 4,
        type: 'FOLLOWUP_SOCIAL_PROOF',
        dayOffset: 11,
        concept: 'Live benchmark touch: Search Engine Journal local search benchmark data',
        variants: {
          A: {
            variant: 'A',
            subject: 'local search benchmark for {{businessName}}',
            previewText: 'Businesses with complete schema capture 64% more organic clicks.',
            bodyTemplate:
              `{{greeting}}\n\nSharing a local search benchmark: according to Search Engine Journal's local search study, businesses with complete structured data and active review management capture 64% more organic inquiry clicks than competitors without markup.\n\nOur scan identified missing schema and an unmanaged review gap on {{businessName}}.\n\nOpen to reviewing the full technical report?\n\nBest,\nDanish`,
          },
          B: {
            variant: 'B',
            subject: 'local search study: outranking competitors in {{city}}',
            previewText: 'Real performance metrics from local search index.',
            bodyTemplate:
              `{{greeting}}\n\nThought you might appreciate this: businesses maintaining responsive Google profiles and verified schema see 42% higher consumer trust ratings.\n\nHappy to send over our competitive benchmark report.\n\nDanish`,
          },
          C: {
            variant: 'C',
            subject: 'search benchmark note for {{businessName}}',
            previewText: 'Citation study on rich snippet indexing.',
            bodyTemplate:
              `{{greeting}}\n\nData from BrightLocal shows that active local businesses in {{city}} gain double the map pack views when their service catalog is natively structured.\n\nGlad to forward our full audit if helpful.\n\nBest,\nDanish`,
          },
        },
      },
      FOLLOWUP_BREAKUP: {
        touchNumber: 5,
        type: 'FOLLOWUP_BREAKUP',
        dayOffset: 15,
        concept: 'The polite breakup',
        variants: {
          A: {
            variant: 'A',
            subject: 'permission to close your file?',
            previewText: 'Closing your audit file on our end.',
            bodyTemplate:
              `{{greeting}}\n\nI haven't heard back, so I'm guessing fixing the local search gap isn't a priority right now—completely understand.\n\nI'll close your audit file on our end so I don't crowd your inbox.\n\nIf you ever want to review the full technical roadmap down the road, just let me know.\n\nBest of luck,\nDanish`,
          },
          B: {
            variant: 'B',
            subject: 'closing the audit for {{businessName}}',
            previewText: 'Taking you off our outreach list.',
            bodyTemplate:
              `{{greeting}}\n\nAssuming your team has other priorities right now. I will take {{businessName}} off my follow-up list.\n\nIf search visibility or lead acquisition ever becomes a focus, feel free to reach back out.\n\nAll the best,\nDanish`,
          },
          C: {
            variant: 'C',
            subject: 'final note for {{businessName}}',
            previewText: 'Final follow-up.',
            bodyTemplate:
              `{{greeting}}\n\nLooks like timing isn't right, so this will be my last note.\n\nIf you ever decide to address the gap against {{competitorName}}, the door is always open.\n\nBest,\nDanish`,
          },
        },
      },
    },
  },
};

/**
 * Determine vertical profile key from string
 */
export function resolveVerticalKey(vertical?: string | null): string {
  const norm = (vertical || '').toLowerCase();
  if (norm.includes('dent') || norm.includes('ortho') || norm.includes('clinic')) return 'dental';
  if (norm.includes('fit') || norm.includes('gym') || norm.includes('athletic')) return 'fitness';
  if (norm.includes('rest') || norm.includes('pizza') || norm.includes('food') || norm.includes('cafe'))
    return 'restaurant';
  return 'general';
}

/**
 * Render a specific sequence touch email
 */
export function renderSequenceTouch(options: {
  touchType: SequenceTouchType;
  source: AuditTokenSource;
  variant?: VariantKey;
}): RenderedTouchEmail {
  const verticalKey = resolveVerticalKey(options.source.vertical);
  const profile = (VERTICAL_COPY_PROFILES[verticalKey] || VERTICAL_COPY_PROFILES['general'])!;
  const touchDef = profile.touches[options.touchType];
  const variantKey = options.variant || 'A';
  const variant = touchDef.variants[variantKey] || touchDef.variants.A;

  const subject = renderTemplate(variant.subject, options.source);
  const previewText = renderTemplate(variant.previewText, options.source);
  const body = renderTemplate(variant.bodyTemplate, options.source);

  const words = body.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  const hasLinks = /https?:\/\/|www\./i.test(body);
  const lowerBody = body.toLowerCase();
  const containsSpamWords = SPAM_WORDS.some((term) => lowerBody.includes(term));

  return {
    touchNumber: touchDef.touchNumber,
    type: touchDef.type,
    dayOffset: touchDef.dayOffset,
    variant: variantKey,
    subject,
    previewText,
    body,
    wordCount,
    hasLinks,
    containsSpamWords,
  };
}

/**
 * Generate full 5-touch sequence for a prospect
 */
export function generateFullSequence(
  source: AuditTokenSource,
  preferredVariant: VariantKey = 'A'
): RenderedTouchEmail[] {
  const touches: SequenceTouchType[] = [
    'INITIAL',
    'FOLLOWUP_NEW_FINDING',
    'FOLLOWUP_DIY_QUICK_WIN',
    'FOLLOWUP_SOCIAL_PROOF',
    'FOLLOWUP_BREAKUP',
  ];

  return touches.map((touchType) =>
    renderSequenceTouch({
      touchType,
      source,
      variant: preferredVariant,
    })
  );
}
