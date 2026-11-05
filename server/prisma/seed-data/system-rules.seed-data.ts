export interface SystemRuleSeed {
  ruleId: string;
  name: string;
  isSystem: boolean;
  isTemplate: boolean;
  templateCategory: string;
  brand: {
    brandName: string;
    industry: string;
    brandDescription: string;
    brandTone: string[];
    brandVoice: string;
    brandRestrictions: string[];
    callToAction: string;
  };
  audience: {
    description: string;
    ageRange: { min: number; max: number };
    gender: 'all' | 'male' | 'female';
    location: string[];
    interests: string[];
    painPoints: string[];
    language: string;
    targetLanguages: string[];
  };
  campaign: {
    goals: string[];
    keywords: string[];
    hashtagStrategy: string[];
    contentFormats: string[];
    duration: { startDate: string; endDate: string };
    postingFrequency: 'daily' | 'weekly' | 'custom';
    customSchedule: string[];
  };
  channels: Array<{
    channel: string;
    priority: 'high' | 'medium' | 'low';
    contentStyle: string;
    contentMapping: {
      caption: 'text' | 'translatedText' | 'summary';
      media: 'image' | 'video' | null;
    };
  }>;
  contentGuidelines: {
    dos: string[];
    donts: string[];
    requiredElements: string[];
    seoGuidelines: {
      primaryKeywords: string[];
      secondaryKeywords: string[];
      keywordDensity: string;
    };
  };
}

export const SYSTEM_RULE_SEEDS: SystemRuleSeed[] = [
  {
    ruleId: 'sys-rule-ecommerce-flash-sale',
    name: 'E-Commerce Flash Sale & High-Conversion Promo',
    isSystem: true,
    isTemplate: true,
    templateCategory: 'E-Commerce',
    brand: {
      brandName: 'Brand Promo',
      industry: 'Retail & E-Commerce',
      brandDescription: 'High-energy, conversion-optimized promotion strategy designed for flash sales and limited-time deals.',
      brandTone: ['energetic', 'urgent', 'persuasive', 'approachable'],
      brandVoice: 'Exciting, direct, and focused on unbeatable value and immediacy.',
      brandRestrictions: ['Do not use fake discounts', 'Do not sound desperate', 'Never omit expiration dates'],
      callToAction: 'Shop Now before stock runs out!',
    },
    audience: {
      description: 'Online deal hunters, modern shoppers, and budget-conscious consumers looking for quality discounts.',
      ageRange: { min: 18, max: 45 },
      gender: 'all',
      location: ['Global', 'Thailand', 'Southeast Asia'],
      interests: ['online shopping', 'special offers', 'lifestyle products', 'trending goods'],
      painPoints: ['High prices', 'Missing limited-time promotions', 'Fear of low quality'],
      language: 'en',
      targetLanguages: ['en', 'th'],
    },
    campaign: {
      goals: ['Drive direct online checkouts', 'Create strong purchase urgency', 'Boost conversion rate'],
      keywords: ['flash sale', 'limited time offer', 'best deal', 'exclusive discount', 'shop now'],
      hashtagStrategy: ['#FlashSale', '#SpecialOffer', '#LimitedTime', '#BestDeal', '#ShoppingSpree'],
      contentFormats: ['ad_copy', 'social_caption', 'promo_banner'],
      duration: { startDate: '2026-01-01', endDate: '2026-12-31' },
      postingFrequency: 'daily',
      customSchedule: [],
    },
    channels: [
      {
        channel: 'facebook',
        priority: 'high',
        contentStyle: 'promotional',
        contentMapping: { caption: 'text', media: 'image' },
      },
      {
        channel: 'instagram',
        priority: 'high',
        contentStyle: 'visual_promo',
        contentMapping: { caption: 'text', media: 'image' },
      },
      {
        channel: 'tiktok',
        priority: 'medium',
        contentStyle: 'short_video',
        contentMapping: { caption: 'text', media: 'video' },
      },
    ],
    contentGuidelines: {
      dos: [
        'Highlight discount percentage or cash savings upfront',
        'State clear deadline or scarcity ("Only 24 hours left")',
        'Include clear clickable call to action',
      ],
      donts: [
        'Do not write long walls of theoretical text',
        'Do not bury the discount at the bottom',
      ],
      requiredElements: ['Discount amount', 'Urgency trigger', 'CTA link'],
      seoGuidelines: {
        primaryKeywords: ['flash sale', 'special discount'],
        secondaryKeywords: ['save big', 'today only'],
        keywordDensity: 'natural',
      },
    },
  },
  {
    ruleId: 'sys-rule-b2b-thought-leadership',
    name: 'B2B Tech Authority & Thought Leadership',
    isSystem: true,
    isTemplate: true,
    templateCategory: 'B2B & SaaS',
    brand: {
      brandName: 'Tech Innovators',
      industry: 'B2B SaaS & Enterprise Technology',
      brandDescription: 'Executive-level insights and industry analysis designed to establish market authority and trust.',
      brandTone: ['authoritative', 'analytical', 'professional', 'insightful'],
      brandVoice: 'Thought leader, problem solver, data-grounded advisor.',
      brandRestrictions: ['No cheap clickbait', 'No exaggerated claims without evidence', 'Avoid informal slang'],
      callToAction: 'Read the full whitepaper and elevate your workflow today.',
    },
    audience: {
      description: 'Founders, CTOs, VP of Product, and Enterprise IT Decision Makers seeking scalable solutions.',
      ageRange: { min: 25, max: 60 },
      gender: 'all',
      location: ['Global'],
      interests: ['AI technology', 'cloud computing', 'SaaS productivity', 'digital transformation'],
      painPoints: ['Inefficient legacy workflows', 'High operational overhead', 'Security and scaling risks'],
      language: 'en',
      targetLanguages: ['en'],
    },
    campaign: {
      goals: ['Establish brand authority', 'Generate enterprise B2B inbound leads', 'Increase LinkedIn engagement'],
      keywords: ['enterprise software', 'AI automation', 'digital transformation', 'ROI', 'scalability'],
      hashtagStrategy: ['#B2BTech', '#Leadership', '#EnterpriseAI', '#DigitalTransformation', '#Productivity'],
      contentFormats: ['linkedin_article', 'case_study_summary', 'infographic_brief'],
      duration: { startDate: '2026-01-01', endDate: '2026-12-31' },
      postingFrequency: 'weekly',
      customSchedule: [],
    },
    channels: [
      {
        channel: 'linkedin',
        priority: 'high',
        contentStyle: 'executive_insight',
        contentMapping: { caption: 'summary', media: 'image' },
      },
      {
        channel: 'facebook',
        priority: 'medium',
        contentStyle: 'professional',
        contentMapping: { caption: 'text', media: 'image' },
      },
    ],
    contentGuidelines: {
      dos: [
        'Lead with a compelling business problem or statistical insight',
        'Provide actionable takeaways in clear bullet points',
        'Cite practical business benefits and ROI',
      ],
      donts: [
        'Do not use excessive emojis or hype words',
        'Do not write vague generalities without substance',
      ],
      requiredElements: ['Problem statement', 'Insight/Data point', 'Executive takeaway'],
      seoGuidelines: {
        primaryKeywords: ['AI workflow automation', 'enterprise scalability'],
        secondaryKeywords: ['operational efficiency', 'B2B SaaS'],
        keywordDensity: 'natural',
      },
    },
  },
  {
    ruleId: 'sys-rule-competition-event-promo',
    name: 'Competition & Hackathon Event Announcement',
    isSystem: true,
    isTemplate: true,
    templateCategory: 'Events & Competitions',
    brand: {
      brandName: 'Event Showcase',
      industry: 'Competitions & Hackathons',
      brandDescription: 'High-energy event announcement and participant recruitment for innovation challenges and contests.',
      brandTone: ['inspiring', 'dynamic', 'collaborative', 'welcoming'],
      brandVoice: 'Passionate community builder and challenger.',
      brandRestrictions: ['Do not omit entry rules', 'Never state incorrect prize amounts'],
      callToAction: 'Register your team now and compete for the grand prize!',
    },
    audience: {
      description: 'Developers, designers, college students, innovators, and startup founders ready to showcase their skills.',
      ageRange: { min: 18, max: 35 },
      gender: 'all',
      location: ['Global', 'Southeast Asia', 'Thailand'],
      interests: ['hackathons', 'coding competitions', 'creative challenges', 'networking', 'prizes'],
      painPoints: ['Missing registration deadlines', 'Uncertain team requirements', 'Lack of mentorship info'],
      language: 'en',
      targetLanguages: ['en', 'th'],
    },
    campaign: {
      goals: ['Drive participant team registrations', 'Raise sponsor visibility', 'Maximize viral social reach'],
      keywords: ['hackathon', 'competition', 'grand prize', 'register now', 'innovate'],
      hashtagStrategy: ['#Hackathon2026', '#InnovationChallenge', '#DevCommunity', '#TechEvent', '#WinPrizes'],
      contentFormats: ['event_announcement', 'poster_copy', 'rules_summary'],
      duration: { startDate: '2026-01-01', endDate: '2026-12-31' },
      postingFrequency: 'daily',
      customSchedule: [],
    },
    channels: [
      {
        channel: 'facebook',
        priority: 'high',
        contentStyle: 'community_promo',
        contentMapping: { caption: 'text', media: 'image' },
      },
      {
        channel: 'instagram',
        priority: 'high',
        contentStyle: 'visual_banner',
        contentMapping: { caption: 'text', media: 'image' },
      },
      {
        channel: 'linkedin',
        priority: 'high',
        contentStyle: 'professional_event',
        contentMapping: { caption: 'summary', media: 'image' },
      },
    ],
    contentGuidelines: {
      dos: [
        'Highlight total prize pool and recognition opportunities',
        'State deadline, dates, and registration URL clearly',
        'Encourage tagging teammates and sharing',
      ],
      donts: [
        'Do not make eligibility criteria confusing',
      ],
      requiredElements: ['Event dates', 'Prize pool', 'Registration link', 'Theme'],
      seoGuidelines: {
        primaryKeywords: ['tech competition', 'hackathon 2026'],
        secondaryKeywords: ['prize challenge', 'developer contest'],
        keywordDensity: 'natural',
      },
    },
  },
];
