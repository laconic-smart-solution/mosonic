/**
 * Seed content for `image_templates`. `key` must match a `NodeImageTemplate`
 * enum value (server/src/nodes/schemas/workflow-node.schema.ts), excluding
 * `auto`. Prompts describe composition/structure only — never a specific
 * aesthetic, that's the job of `image_design_styles`.
 */
export type ImageTemplateSeed = {
  key: string;
  name: string;
  description: string;
  prompt: string;
};

export const IMAGE_TEMPLATE_SEEDS: ImageTemplateSeed[] = [
  {
    key: 'ad_creative',
    name: 'Product Advertisement',
    description:
      'Promotional creative for a specific offer, campaign, or call-to-action.',
    prompt:
      'The composition must have one dominant focal subject that reads instantly, even at small mobile sizes. Build a strong visual hierarchy: the subject occupies the primary visual weight, secondary elements stay clearly subordinate. Reserve roughly a third of the frame as clean, uncluttered negative space suitable for a headline overlay to be added afterward — do not place any text, logos, or captions inside the scene itself. Frame for high impact at a glance.',
  },
  {
    key: 'product_mockup',
    name: 'Product Mockup',
    description:
      'Clean, isolated presentation of a physical or digital product.',
    prompt:
      "The product itself must be the dominant visual element, centered or clearly the primary focal point. Use controlled, even studio-quality lighting that reveals true material, texture, and proportion. Keep the background simple, neutral, and uncluttered so nothing competes with the product. Show believable scale, reflections, and surface detail appropriate to the product's real materials.",
  },
  {
    key: 'infographic',
    name: 'Infographic',
    description:
      'Structured visual for presenting concrete data, steps, or comparisons.',
    prompt:
      'Use a clear, structured layout with generous spacing and an obvious visual hierarchy — the eye should move naturally from one element to the next. Every graphic element (shape, icon, section) must correspond to a real, specific piece of information provided in the source content; never fill space with abstract, unlabeled decoration. Favor clean geometric shapes, aligned grids, and legible structure over dense or busy detail.',
  },
  {
    key: 'photorealistic',
    name: 'Photorealistic Scene',
    description:
      'A physically believable photograph-style image with no specific promotional framing.',
    prompt:
      'Render as a physically believable photograph: realistic anatomy, accurate perspective, natural material response to light, and convincing depth of field. Favor natural photographic detail and imperfection over a smooth, artificial, CGI-rendered look. Compose as a single coherent scene rather than an assembled collage of unrelated elements.',
  },
  {
    key: 'lifestyle',
    name: 'Lifestyle Photograph',
    description:
      'An authentic, in-context photograph of people experiencing or using something.',
    prompt:
      'Show real people in a natural environment with believable expressions and body language — favor candid, in-the-moment interaction over posed, stock-photo composition. The environment should feel specific and lived-in, contributing real context to the scene rather than serving as a generic backdrop. Let the human moment carry the composition.',
  },
];
