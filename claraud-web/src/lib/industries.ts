export interface Industry {
  slug: string;
  name: string;
  icon: string;
  headline: string;
  subheadline: string;
  avgScore: number;
  topIssue: string;
  problems: { title: string; stat: string; description: string }[];
  sampleFindings: { severity: string; title: string; impact: string }[];
  benchmarks: { metric: string; average: string; topPerformer: string }[];
  keywords: string[];
}

export const industries: Industry[] = [
  {
    slug: 'dentists',
    name: 'Dental Practices',
    icon: '🦷',
    headline: 'Is your dental practice invisible to new patients?',
    subheadline:
      'Most dental websites lose 60% of potential patients before they even call. Claraud finds out why in 30 seconds.',
    avgScore: 4.1,
    topIssue: 'Incomplete Google Business Profile',
    problems: [
      {
        title: 'New patient booking flow is broken on mobile',
        stat: '73% of dental searches happen on mobile',
        description:
          "If your booking button is buried or your forms don't work on phones, you're losing patients to the practice down the street.",
      },
      {
        title: "Your Google reviews mention wait times but you haven't responded",
        stat: 'Practices that respond to reviews get 35% more calls',
        description:
          "Unaddressed negative reviews signal to Google that you don't care about patient experience.",
      },
      {
        title: 'Competitors are running Google Ads on your practice name',
        stat: '28% of dental practices lose branded traffic to competitors',
        description:
          "If you're not protecting your brand keywords, patients searching for YOU end up at their office.",
      },
      {
        title: "Your website doesn't mention specific services",
        stat: 'Service-specific pages rank 3x better than generic pages',
        description:
          'A page for "dental implants in [city]" will outrank a generic "services" page every time.',
      },
      {
        title: 'No after-hours contact option',
        stat: '42% of dental inquiries happen after 5 PM',
        description:
          "Emergency searches spike at night. If your site doesn't offer after-hours options, those patients go to urgent care.",
      },
    ],
    sampleFindings: [
      {
        severity: 'critical',
        title:
          'Google Business Profile only 58% complete — missing 16 photos, services list, and Q&A',
        impact: 'Practices with complete profiles get 7x more clicks from Google Maps',
      },
      {
        severity: 'high',
        title: 'Website loads in 5.2s on mobile — 74% slower than top competitor',
        impact: '53% of patients will leave and find another practice',
      },
      {
        severity: 'high',
        title: 'Only 12 Google reviews vs. competitor average of 89',
        impact: 'Low review count signals new or low-quality practice to potential patients',
      },
      {
        severity: 'medium',
        title: 'No FAQ schema markup — missing rich snippet opportunities',
        impact: 'FAQ snippets increase click-through rate by 30%',
      },
      {
        severity: 'medium',
        title: 'Social media profiles not linked from website',
        impact: 'Missed trust signals and engagement opportunities',
      },
    ],
    benchmarks: [
      { metric: 'Google Reviews', average: '23', topPerformer: '150+' },
      { metric: 'Page Speed (mobile)', average: '4.8s', topPerformer: '1.5s' },
      { metric: 'GBP Completeness', average: '61%', topPerformer: '95%+' },
      { metric: 'Overall Score', average: '4.1/10', topPerformer: '8.5+/10' },
    ],
    keywords: [
      'dental website audit',
      'dentist marketing audit',
      'dental practice SEO',
      'dentist Google reviews',
    ],
  },
  {
    slug: 'law-firms',
    name: 'Law Firms',
    icon: '⚖️',
    headline: 'Are high-value clients finding your competitors instead of you?',
    subheadline:
      "Legal services are a trust-first business. If your website looks like 2012, you're losing cases to firms with better AI optimization.",
    avgScore: 3.8,
    topIssue: 'Poor Mobile Performance & Trust Signals',
    problems: [
      {
        title: 'Click-to-call buttons are missing or non-functional',
        stat: '65% of legal leads call instead of email',
        description:
          "In a crisis, clients need to talk to you NOW. If they can't find your number in one click, they move to the next firm.",
      },
      {
        title: 'No "Proof of Success" detected on landing pages',
        stat: 'Testimonials increase legal conversion by 40%',
        description:
          'Clients want to see that you win. Missing case results or client testimonials is the #1 trust killer for law firms.',
      },
      {
        title: 'Your site isn\'t optimized for "Near Me" searches',
        stat: '70% of legal searches include a location modifier',
        description:
          'If you don\'t have localized content, you won\'t show up when someone searches "personal injury lawyer near me."',
      },
      {
        title: 'Page speed prevents "Urgent Matter" conversions',
        stat: 'Mobile conversion drops 12% for every second of delay',
        description:
          'Legal clients are often stressed and in a hurry. A slow site feels like an unprofessional office.',
      },
      {
        title: 'Missing practice-area specific schema',
        stat: 'Rich snippets boost CTR for lawyers by 25%',
        description:
          'Schema helps Google display your specific specialties (e.g., DUI, Divorce, Patent) directly in search results.',
      },
    ],
    sampleFindings: [
      {
        severity: 'critical',
        title: 'Missing SSL Certificate or mixed content errors',
        impact: 'Google Chrome marks your site as "Not Secure," destroying immediate trust',
      },
      {
        severity: 'high',
        title: 'No distinct landing pages for practice areas',
        impact: 'Lower Quality Score for ads and lower organic rankings for specific services',
      },
      {
        severity: 'high',
        title: 'Google Business Profile has 0 posts in the last 90 days',
        impact: 'Profile looks abandoned, leading to lower rankings in the Local Pack',
      },
      {
        severity: 'medium',
        title: 'Inconsistent NAP (Name, Address, Phone) across directories',
        impact: 'Confuses Google and lowers your local authority',
      },
      {
        severity: 'medium',
        title: 'No video content on homepage',
        impact: 'Legal clients engage 3x more with firms that use "Meet the Attorney" videos',
      },
    ],
    benchmarks: [
      { metric: 'Google Reviews', average: '14', topPerformer: '120+' },
      { metric: 'Lead Response Time', average: '4 hours', topPerformer: '< 5 mins' },
      { metric: 'Mobile Score', average: '32/100', topPerformer: '85+/100' },
      { metric: 'Overall Score', average: '3.8/10', topPerformer: '8.2/10' },
    ],
    keywords: [
      'law firm website audit',
      'lawyer SEO audit',
      'legal marketing strategy',
      'attorney Google profile',
    ],
  },
  {
    slug: 'hvac',
    name: 'HVAC & Plumbing',
    icon: '🛠️',
    headline: 'Stop losing emergency repair calls to the guy with the better Google Profile.',
    subheadline:
      "When an AC breaks in July, people don't scroll. They call the first 5-star business they see. Is that you?",
    avgScore: 4.5,
    topIssue: 'Missing Local Service Proof',
    problems: [
      {
        title: "Reviews don't mention specific neighborhoods",
        stat: 'Local keywords in reviews boost rankings by 15%',
        description:
          'Google looks for proof that you actually work in the areas you claim to serve.',
      },
      {
        title: 'No online booking or emergency chat option',
        stat: '38% of HVAC leads are lost after-hours',
        description:
          'Homeowners want to know their problem is being handled, even at 11 PM. Static "Contact Us" forms don\'t cut it.',
      },
      {
        title: 'Website images are all stock photos',
        stat: 'Real team photos increase trust by 80%',
        description:
          'In the home service industry, clients want to see who is coming to their door. Stock photos scream "impersonal corporation."',
      },
      {
        title: 'Google Business Profile missing service area settings',
        stat: 'Correct service areas increase map visibility by 300%',
        description:
          'Many HVAC companies accidentally limit themselves to just the town their office is in.',
      },
      {
        title: 'Technical SEO errors hiding your "emergency" keywords',
        stat: '50% of HVAC sites have broken meta titles',
        description:
          'If your site doesn\'t explicitly say "24/7 Emergency AC Repair," you won\'t rank for it.',
      },
    ],
    sampleFindings: [
      {
        severity: 'critical',
        title: 'Google Business Profile missing 24/7 hours setting',
        impact: 'You are filtered out of all emergency searches at night',
      },
      {
        severity: 'high',
        title: 'Only 3 photos of actual work/trucks on profile',
        impact: 'Lower conversion rate from profile visitors who want to see real proof',
      },
      {
        severity: 'high',
        title: "Contact form doesn't work on iPhone Safari",
        impact: 'Directly losing 40%+ of all potential mobile leads',
      },
      {
        severity: 'medium',
        title: 'Missing "LocalBusiness" schema',
        impact: 'Missing out on the Google knowledge panel and local search enhancements',
      },
      {
        severity: 'medium',
        title: 'Social media links are broken/empty',
        impact: 'Doubt cast on business legitimacy for younger homeowners',
      },
    ],
    benchmarks: [
      { metric: 'Review Count', average: '42', topPerformer: '350+' },
      { metric: 'Map Ranking', average: '#12', topPerformer: 'Top 3' },
      { metric: 'Site Load Time', average: '3.9s', topPerformer: '1.2s' },
      { metric: 'Overall Score', average: '4.5/10', topPerformer: '8.9/10' },
    ],
    keywords: [
      'hvac marketing audit',
      'plumber SEO audit',
      'home services website review',
      'contractor lead gen',
    ],
  },
  {
    slug: 'restaurants',
    name: 'Restaurants & Bars',
    icon: '🍕',
    headline: 'Your food is great. Your digital presence is costing you tables.',
    subheadline:
      "80% of diners check a menu online before visiting. If your menu is a slow-loading PDF, they're going to the place next door.",
    avgScore: 5.2,
    topIssue: 'Non-Indexed Menus & Slow Load Times',
    problems: [
      {
        title: "Your menu is a PDF that Google can't read",
        stat: 'HTML menus get 4x more traffic than PDFs',
        description:
          'If your menu isn\'t text-based, someone searching for "best carbonara near me" will never find you.',
      },
      {
        title: 'No "Order Online" or "Reserve" integration in Google Maps',
        stat: 'Direct booking buttons increase orders by 20%',
        description:
          'Friction kills sales. If a customer has to click 5 times to order, they give up.',
      },
      {
        title: 'GBP missing 100+ high-quality food photos',
        stat: 'Diners view photos 3x more than any other GBP element',
        description:
          'People eat with their eyes. A lack of recent, appetizing photos is a major conversion bottleneck.',
      },
      {
        title: 'Negative reviews for "wait times" are ignored',
        stat: 'Responding to negative reviews increases return visits by 25%',
        description: 'Ignoring complaints makes you look indifferent to customer experience.',
      },
      {
        title: 'Your website isn\'t optimized for "Best [Cuisine]" searches',
        stat: '75% of diners use cuisine-specific search terms',
        description: 'Generic site titles miss out on the most valuable local intent traffic.',
      },
    ],
    sampleFindings: [
      {
        severity: 'critical',
        title: 'Missing OpenGraph tags for social sharing',
        impact: 'When someone shares your link, it looks broken or unattractive',
      },
      {
        severity: 'high',
        title: 'Website images not compressed (avg 4MB per food photo)',
        impact: 'Painfully slow mobile browsing on cellular data',
      },
      {
        severity: 'high',
        title: 'Google Business Profile missing holiday hours',
        impact: 'Customers show up to a closed door, leading to 1-star reviews',
      },
      {
        severity: 'medium',
        title: 'No "Restaurant" schema for menu prices',
        impact: 'Missing out on price snippets in Google search results',
      },
      {
        severity: 'medium',
        title: 'Instagram feed on site is broken',
        impact: 'Makes the restaurant look "dead" or technically incompetent',
      },
    ],
    benchmarks: [
      { metric: 'Avg Rating', average: '3.9', topPerformer: '4.7+' },
      { metric: 'Photo Count', average: '45', topPerformer: '500+' },
      { metric: 'Menu Accessibility', average: 'PDF', topPerformer: 'Interactive' },
      { metric: 'Overall Score', average: '5.2/10', topPerformer: '9.1/10' },
    ],
    keywords: [
      'restaurant website audit',
      'food marketing SEO',
      'restaurant Google profile tips',
      'local diner search',
    ],
  },
  {
    slug: 'real-estate',
    name: 'Real Estate Agents',
    icon: '🏠',
    headline: 'Are you a local expert or just another agent with a slow website?',
    subheadline:
      "Buyers and sellers choose agents based on authority. If your site looks like an automated template, you're losing listings.",
    avgScore: 3.5,
    topIssue: 'Template Dependency & Poor Local SEO',
    problems: [
      {
        title: 'Your site is a generic corporate sub-domain',
        stat: 'Custom domains rank 5x better for local terms',
        description:
          'If your site is agent.bigbrokerage.com, you have zero SEO authority. You need your own digital brand.',
      },
      {
        title: 'No neighborhood-specific guides or landing pages',
        stat: 'Hyper-local content closes 3x more sellers',
        description:
          'Sellers want to know you understand THEIR specific market, not just the general city.',
      },
      {
        title: 'Missing Google Business Profile for your personal brand',
        stat: '90% of buyers search for an agent by name',
        description:
          "If you don't have your own profile, you lose the chance to collect reviews and show up in maps.",
      },
      {
        title: 'Lead capture forms are too long or intimidating',
        stat: 'Short forms have a 25% higher completion rate',
        description: 'Stop asking for their life story before giving them a home value estimate.',
      },
      {
        title: "Website doesn't highlight recent sales/reviews",
        stat: 'Social proof is the #1 factor in agent selection',
        description: "If your recent wins aren't front and center, you look like a rookie.",
      },
    ],
    sampleFindings: [
      {
        severity: 'critical',
        title: 'Zero Google reviews on personal agent profile',
        impact: 'Immediate loss of credibility when compared to veteran agents',
      },
      {
        severity: 'high',
        title: 'IDX feed causing massive site speed delays',
        impact: 'Mobile users leave before the first house listing even loads',
      },
      {
        severity: 'high',
        title: 'Missing "RealEstateAgent" schema markup',
        impact: "Google doesn't associate you with your specific service area",
      },
      {
        severity: 'medium',
        title: 'No blog content in the last 12 months',
        impact: 'Lowered search authority and lack of "local expert" status',
      },
      {
        severity: 'medium',
        title: 'Low-quality profile picture or header images',
        impact: 'First impression of "unprofessional" or "part-time" agent',
      },
    ],
    benchmarks: [
      { metric: 'Domain Authority', average: '12', topPerformer: '45+' },
      { metric: 'Review Score', average: '4.2', topPerformer: '4.9+' },
      { metric: 'Mobile Speed', average: '5.2s', topPerformer: '1.8s' },
      { metric: 'Overall Score', average: '3.5/10', topPerformer: '7.8/10' },
    ],
    keywords: [
      'real estate website audit',
      'realtor SEO strategy',
      'agent marketing review',
      'local listing SEO',
    ],
  },
  {
    slug: 'gyms',
    name: 'Gyms & Fitness Studios',
    icon: '💪',
    headline: 'Your members are searching for "gyms near me." Why aren\'t they seeing you?',
    subheadline:
      "Fitness is local and visual. If your website is slow and your Google profile is empty, you're losing memberships every single day.",
    avgScore: 4.8,
    topIssue: 'Missing Social Proof & Community Signals',
    problems: [
      {
        title: 'No "Free Trial" or "Class Pass" CTA above the fold',
        stat: 'Low-friction offers increase signups by 50%',
        description:
          "If users have to look for your pricing or intro offer, they'll go to the gym that makes it easy.",
      },
      {
        title: "Your site doesn't list your specific equipment or classes",
        stat: 'Niche searches (e.g., "Crossfit", "Squat Racks") convert 2x better',
        description:
          'Broad "Gym" keywords are competitive. Ranking for what you actually have is how you win.',
      },
      {
        title: 'Google Business Profile missing recent "Vibe" photos',
        stat: 'Members check 15+ photos before visiting a new gym',
        description:
          'People want to see the culture, the cleanliness, and the crowd before they walk in.',
      },
      {
        title: 'No internal links between classes and instructors',
        stat: 'Staff bios increase class booking rates by 30%',
        description:
          'Fitness is personal. Highlighting your trainers builds a connection before the first visit.',
      },
      {
        title: 'Your "Join Now" button is broken on mobile',
        stat: '60% of gym signups start on a smartphone',
        description:
          'Any technical glitch in the signup flow is a direct hit to your monthly recurring revenue.',
      },
    ],
    sampleFindings: [
      {
        severity: 'critical',
        title: 'Missing "Gym" or "FitnessCenter" schema',
        impact: "Google doesn't show your class schedule or hours in rich snippets",
      },
      {
        severity: 'high',
        title: 'Only 12 Google reviews with many unanswered 1-stars',
        impact: 'Signals a "toxic" or poorly managed gym environment',
      },
      {
        severity: 'high',
        title: 'Website takes 6+ seconds to load gym gallery',
        impact: 'Potential members lose interest and find a more modern studio',
      },
      {
        severity: 'medium',
        title: 'No localized keywords in page titles (e.g., "Gym in Downtown")',
        impact: 'Invisible to the most relevant local search traffic',
      },
      {
        severity: 'medium',
        title: 'Social media links lead to inactive profiles',
        impact: 'Suggests the gym might be closed or declining in popularity',
      },
    ],
    benchmarks: [
      { metric: 'Review Count', average: '58', topPerformer: '400+' },
      { metric: 'Conversion Rate', average: '2%', topPerformer: '8%+' },
      { metric: 'Mobile Load Time', average: '4.1s', topPerformer: '1.4s' },
      { metric: 'Overall Score', average: '4.8/10', topPerformer: '8.7/10' },
    ],
    keywords: [
      'gym marketing audit',
      'fitness SEO audit',
      'crossfit lead gen',
      'local yoga studio SEO',
    ],
  },
  {
    slug: 'veterinary',
    name: 'Veterinary Clinics',
    icon: '🐾',
    headline: 'Build trust with pet parents before they even walk in.',
    subheadline:
      'Pet owners are incredibly protective. If your website doesn\'t scream "compassion and expertise," they\'ll keep searching.',
    avgScore: 5.1,
    topIssue: 'Missing Trust Indicators & Educational Content',
    problems: [
      {
        title: 'No "Meet the Doctors" page with credentials',
        stat: 'Bios are the 2nd most visited page on vet sites',
        description:
          'Pet parents want to see the people who will be caring for their family members.',
      },
      {
        title: 'Missing "Emergency" contact information on homepage',
        stat: '40% of vet traffic is looking for urgent care info',
        description:
          'If someone is panicking about their dog, they need your number and address instantly.',
      },
      {
        title: 'GBP missing photos of the facility/exam rooms',
        stat: 'Clean facility photos increase bookings by 20%',
        description:
          'Transparency reduces anxiety for pet owners. Show them where their pet will be.',
      },
      {
        title: 'No localized service pages (e.g., "Pet dental in [City]")',
        stat: 'Specific service pages rank 4x higher than generic ones',
        description: "Don't just list services; explain your approach to show expertise.",
      },
      {
        title: 'Online booking is buried or requires a phone call',
        stat: '55% of millennials prefer booking vet visits online',
        description: 'Friction in the booking process leads to fewer preventative care visits.',
      },
    ],
    sampleFindings: [
      {
        severity: 'critical',
        title: 'No "VeterinaryCare" schema markup',
        impact: 'Missing out on specialized Google Maps features for medical providers',
      },
      {
        severity: 'high',
        title: 'Website is not accessible for users with disabilities',
        impact: 'Potential legal issues and loss of an underserved market segment',
      },
      {
        severity: 'high',
        title: 'Google Profile has 0 posts about pet health tips',
        impact: 'Missed opportunity to build authority as a local health expert',
      },
      {
        severity: 'medium',
        title: 'Page speed is bogged down by uncompressed animal photos',
        impact: 'High bounce rate from impatient pet owners on mobile',
      },
      {
        severity: 'medium',
        title: 'Inconsistent hours listed on Yelp vs. Google',
        impact: 'Confused customers and lower local search rankings',
      },
    ],
    benchmarks: [
      { metric: 'Review Score', average: '4.3', topPerformer: '4.9' },
      { metric: 'Lead Volume', average: '15/mo', topPerformer: '60+/mo' },
      { metric: 'Mobile Speed', average: '3.8s', topPerformer: '1.2s' },
      { metric: 'Overall Score', average: '5.1/10', topPerformer: '8.8/10' },
    ],
    keywords: [
      'vet marketing audit',
      'veterinary SEO clinic',
      'animal hospital website review',
      'pet clinic SEO',
    ],
  },
  {
    slug: 'salons',
    name: 'Beauty Salons & Spas',
    icon: '💇‍♀️',
    headline: 'Your portfolio is beautiful. Your website should be too.',
    subheadline:
      'Beauty is a visual industry. If your website is ugly or slow, clients assume your work is too. Turn your site into a booking machine.',
    avgScore: 4.3,
    topIssue: 'Visual Performance & Booking Friction',
    problems: [
      {
        title: 'No "Before & After" gallery detected on the homepage',
        stat: 'Galleries increase salon conversions by 65%',
        description: 'Proof of work is the #1 driver for new hair and skin clients.',
      },
      {
        title: 'Instagram integration is broken or outdated',
        stat: '90% of beauty clients check Instagram before booking',
        description:
          "If your site shows photos from 2019, you look like you aren't keeping up with trends.",
      },
      {
        title: 'Google Business Profile missing "Book Online" button',
        stat: 'Direct booking from search results increases leads by 40%',
        description: 'Make it as easy as possible for someone to find you and commit immediately.',
      },
      {
        title: 'Service list is a flat list without descriptions',
        stat: 'Detailed service pages increase ticket value by 20%',
        description:
          'Explain the benefits of your premium treatments to upsell before they arrive.',
      },
      {
        title: 'Website is not optimized for "Best Hair Colorist [City]"',
        stat: 'Cuisine-specific searches work for salons too',
        description: 'Be the authority in your specific niche, not just a generic "salon."',
      },
    ],
    sampleFindings: [
      {
        severity: 'critical',
        title: 'Missing "BeautySalon" or "NailSalon" schema',
        impact: "Google doesn't show your price list or service menu in search",
      },
      {
        severity: 'high',
        title: 'Website font is too small for mobile reading',
        impact: 'Older, higher-ticket clients struggle to navigate your site',
      },
      {
        severity: 'high',
        title: 'Only 15 photos on GBP (avg competitor has 80)',
        impact: 'Lower visual authority and map ranking',
      },
      {
        severity: 'medium',
        title: 'No localized keywords in "About Us" page',
        impact: "Missing out on Google's local relevance signals",
      },
      {
        severity: 'medium',
        title: 'Social media icons lead to personal accounts',
        impact: 'Looks unprofessional compared to branded studio profiles',
      },
    ],
    benchmarks: [
      { metric: 'Photo Count', average: '22', topPerformer: '250+' },
      { metric: 'Review Velocity', average: '2/mo', topPerformer: '15+/mo' },
      { metric: 'Mobile Score', average: '45/100', topPerformer: '90+/100' },
      { metric: 'Overall Score', average: '4.3/10', topPerformer: '8.9/10' },
    ],
    keywords: [
      'salon marketing audit',
      'hair stylist SEO',
      'spa website review',
      'beauty business marketing',
    ],
  },
  {
    slug: 'contractors',
    name: 'General Contractors',
    icon: '🏗️',
    headline: 'Win bigger projects by proving your professionalism online.',
    subheadline:
      "For large renovations, homeowners research for weeks. If your site looks unprofessional, they won't even ask for a quote.",
    avgScore: 3.2,
    topIssue: 'Extreme Lack of Trust Signals & Proof',
    problems: [
      {
        title: 'No "Verified Project" gallery with addresses/dates',
        stat: 'Project histories increase quote requests by 75%',
        description: 'Homeowners need to know you actually finish the jobs you start.',
      },
      {
        title: 'Website is not mobile-friendly for onsite quotes',
        stat: '45% of contractor leads are submitted via mobile',
        description:
          "If a client tries to show you a photo and your site breaks, you look like you aren't tech-savvy.",
      },
      {
        title: 'Google Business Profile has zero posts of work-in-progress',
        stat: 'Transparency in the "messy middle" builds 2x more trust',
        description:
          'Show the process, not just the finished result, to prove you do quality work.',
      },
      {
        title: 'Missing licensing and insurance badges on footer',
        stat: 'Security logos increase lead trust by 50%',
        description: 'In a high-risk industry, silence on legal protections is a major red flag.',
      },
      {
        title: 'No "Request a Quote" button on service pages',
        stat: 'Every service should have a direct path to a quote',
        description: "Don't make them go to a separate contact page to start a conversation.",
      },
    ],
    sampleFindings: [
      {
        severity: 'critical',
        title: 'Google Business Profile marked as "Closed" or missing hours',
        impact: 'Total loss of all map-based leads',
      },
      {
        severity: 'high',
        title: 'Website uses uncompressed images (avg 8MB per project photo)',
        impact: 'Site takes 10+ seconds to load, losing users on mobile',
      },
      {
        severity: 'high',
        title: 'No "GeneralContractor" schema detected',
        impact: "Google doesn't understand the scale of your business",
      },
      {
        severity: 'medium',
        title: 'Broken links in "Portfolio" section',
        impact: 'Signals "poor attention to detail" to potential high-end clients',
      },
      {
        severity: 'medium',
        title: 'Missing Meta Descriptions on key pages',
        impact: 'Lower click-through rate from search results',
      },
    ],
    benchmarks: [
      { metric: 'Google Reviews', average: '8', topPerformer: '85+' },
      { metric: 'Quote Conversion', average: '5%', topPerformer: '18%+' },
      { metric: 'Site Load Time', average: '5.8s', topPerformer: '1.5s' },
      { metric: 'Overall Score', average: '3.2/10', topPerformer: '7.5/10' },
    ],
    keywords: [
      'contractor marketing audit',
      'renovation SEO tips',
      'construction website review',
      'builder lead gen',
    ],
  },
  {
    slug: 'retail',
    name: 'Local Retail Shops',
    icon: '🛍️',
    headline: 'Bring more foot traffic to your store with local search.',
    subheadline:
      '78% of local mobile searches result in an in-store purchase within 24 hours. Are you catching that traffic?',
    avgScore: 4.6,
    topIssue: 'Missing Local Inventory & Real-Time Info',
    problems: [
      {
        title: "Your products aren't listed on your Google Profile",
        stat: '"Product" posts increase in-store visits by 35%',
        description: 'Show people exactly what you have in stock before they get in their car.',
      },
      {
        title: 'No "Get Directions" button prominent on mobile site',
        stat: 'Local retail is 90% intent-driven',
        description:
          "If a customer can't find you in two taps, they'll go to the shop that's easier to find.",
      },
      {
        title: 'Google Business Profile missing current interior photos',
        stat: 'Members check 15+ photos before visiting a new shop',
        description: 'Help customers visualize the shopping experience and the products you carry.',
      },
      {
        title: 'No mention of "Buy Online, Pick Up In-Store" (BOPIS)',
        stat: 'BOPIS services increase retail revenue by 25%',
        description: 'Modern shoppers want convenience. If you offer it, tell Google about it.',
      },
      {
        title: 'Your store hours are inconsistent across the web',
        stat: 'Inconsistent hours are the #1 reason for 1-star reviews',
        description:
          "If someone drives to your shop and it's closed, you've lost a customer for life.",
      },
    ],
    sampleFindings: [
      {
        severity: 'critical',
        title: 'Missing "Store" or "LocalBusiness" schema',
        impact: 'You don\'t show up in "Open Now" filters on Google Maps',
      },
      {
        severity: 'high',
        title: "Website doesn't use a responsive design for phones",
        impact: 'Impossible to browse your products on the go',
      },
      {
        severity: 'high',
        title: 'Only 5 reviews on Google in the last 2 years',
        impact: 'Store looks like it might be out of business',
      },
      {
        severity: 'medium',
        title: 'Missing alt-text on product images',
        impact: "Your products don't show up in Google Image search",
      },
      {
        severity: 'medium',
        title: 'No internal links to "Best Sellers" or "Sale" items',
        impact: 'Lower average order value from site visitors',
      },
    ],
    benchmarks: [
      { metric: 'Foot Traffic Leads', average: '12/wk', topPerformer: '80+/wk' },
      { metric: 'Google Rating', average: '4.1', topPerformer: '4.8+' },
      { metric: 'Mobile Page Speed', average: '3.5s', topPerformer: '1.1s' },
      { metric: 'Overall Score', average: '4.6/10', topPerformer: '9.0/10' },
    ],
    keywords: [
      'retail marketing audit',
      'local shop SEO',
      'boutique website review',
      'ecommerce local search',
    ],
  },
];

export function getIndustry(slug: string): Industry | undefined {
  return industries.find((i) => i.slug === slug);
}

export function getAllIndustrySlugs(): string[] {
  return industries.map((i) => i.slug);
}
