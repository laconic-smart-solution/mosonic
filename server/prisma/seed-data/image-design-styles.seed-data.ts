/**
 * Seed content for `image_design_styles`. Each prompt describes concrete,
 * visible characteristics (composition, palette, texture, light) — never
 * marketing language ("premium", "eye-catching") and never subject matter.
 * The AI Style Selector picks one of these by `key`; the Prompt Composer
 * applies its `prompt` on top of whatever the Template already decided.
 */
export type ImageDesignStyleSeed = {
  key: string;
  name: string;
  description: string;
  prompt: string;
};

export const IMAGE_DESIGN_STYLE_SEEDS: ImageDesignStyleSeed[] = [
  {
    key: 'minimalism',
    name: 'Minimalism',
    description:
      'Restrained, uncluttered visual language built on negative space and simple geometry.',
    prompt:
      'Restrained composition with generous negative space. Simple, clean geometric forms. A small number of visual elements, each with clear purpose — remove anything non-essential. Subtle, even lighting. A restrained, limited color palette, often neutral or monochromatic with at most one accent color. Flat or softly graduated surfaces rather than busy texture.',
  },
  {
    key: 'maximalism',
    name: 'Maximalism',
    description:
      'Dense, layered, richly detailed visual language that embraces abundance.',
    prompt:
      'Dense composition with many layered visual elements filling the frame — pattern, texture, and detail throughout, with little empty space. Bold, saturated, varied color combinations used together rather than a restrained palette. Ornate or intricate surface detail. Multiple focal points that reward closer looking, while still resolving into one coherent scene.',
  },
  {
    key: 'surrealism',
    name: 'Surrealism',
    description:
      'Dreamlike, illogical juxtapositions rendered with photographic or painterly realism.',
    prompt:
      'Combine ordinary elements in physically impossible or dreamlike arrangements — unexpected scale, floating or displaced objects, improbable settings — while rendering each individual element with realistic detail and lighting. Use soft, atmospheric, often theatrical lighting. Favor a slightly uncanny, quiet mood rather than chaotic or comedic.',
  },
  {
    key: 'swiss_design',
    name: 'Swiss Design',
    description: 'Grid-based, highly structured, objective visual language.',
    prompt:
      'Strict grid-based composition with strong horizontal and vertical alignment. Asymmetric but balanced layout. Bold, flat blocks of color — often red, black, and white as a primary palette — used in clean geometric shapes. No decorative ornamentation. Precise, objective, mechanical-feeling composition with sharp edges and clean lines.',
  },
  {
    key: 'y2k',
    name: 'Y2K',
    description:
      'Late-1990s/early-2000s futurism: chrome, gradients, and optimistic tech aesthetics.',
    prompt:
      'Glossy, chrome, and metallic surfaces with reflective highlights. Bright, saturated gradient color transitions — cyan, magenta, silver, electric blue. Bubble-like rounded forms and translucent, glassy layered shapes. A bright, optimistic, slightly futuristic and synthetic visual mood, evocative of early digital-era technology.',
  },
  {
    key: 'editorial',
    name: 'Editorial',
    description:
      'Considered, magazine-style composition with intentional negative space for layout.',
    prompt:
      'Composed like a magazine feature photograph: deliberate framing, considered negative space reserved for layout, and a clear single subject shot with intent rather than snapshot spontaneity. Natural but controlled lighting. A restrained, cohesive color grade. Composition should feel curated and art-directed, not candid.',
  },
  {
    key: 'pixel_art',
    name: 'Pixel Art',
    description:
      'Low-resolution, grid-aligned blocks of flat color evoking retro digital graphics.',
    prompt:
      'Render forms from visible, grid-aligned square pixels rather than smooth continuous surfaces. Flat blocks of color with hard edges, no gradients or anti-aliasing. Limited, deliberately chosen color palette. Simple, iconic silhouettes readable even at small size, evocative of retro video game graphics.',
  },
  {
    key: 'clay_style',
    name: 'Clay Style',
    description: 'Soft, matte, hand-molded clay-like 3D forms.',
    prompt:
      'Render subjects as if sculpted from matte modeling clay — soft rounded edges, visible gentle imperfections and fingerprint-like texture, no sharp hard edges. Soft, diffused studio lighting with gentle shadows. Muted, matte, non-reflective color palette. Slightly exaggerated, toy-like proportions.',
  },
  {
    key: 'glassmorphism',
    name: 'Glassmorphism',
    description:
      'Frosted-glass translucency with soft blur and light refraction.',
    prompt:
      'Layered translucent, frosted-glass surfaces with soft background blur visible through them. Subtle light refraction and soft-edged highlights along translucent edges. Pastel or light, airy color palette with gentle gradients. Clean, rounded geometric shapes floating in layered depth.',
  },
  {
    key: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'High-tech, neon-lit, dystopian urban futurism.',
    prompt:
      'Dense urban or industrial environment with dramatic high contrast between deep shadow and glowing neon light. Neon color accents — electric blue, magenta, purple, acid green — against dark backgrounds. Reflective wet surfaces, rain, or atmospheric haze. Visible technology or screen-like light sources integrated into the environment. Moody, dramatic, high-tech atmosphere.',
  },
  {
    key: 'pop_art',
    name: 'Pop Art',
    description:
      'Bold flat color blocks and graphic, comic-inspired visual language.',
    prompt:
      'Bold, flat, highly saturated blocks of primary and secondary color with hard clean outlines. High contrast, graphic composition inspired by commercial print and comic illustration. Simplified forms rather than photographic detail. Repetition or bold single-subject framing. Playful, high-energy visual tone.',
  },
  {
    key: 'retro',
    name: 'Retro',
    description:
      'Warm, nostalgic color grading evoking mid-to-late 20th century print and photography.',
    prompt:
      'Warm, slightly desaturated or sepia-leaning color grading evocative of film photography from past decades. Soft grain or subtle texture rather than crisp digital clarity. Rounded, period-appropriate forms and props. Muted earth tones, mustard, burnt orange, and warm brown accents. A nostalgic, lived-in visual mood.',
  },
  {
    key: 'collage_art',
    name: 'Collage Art',
    description:
      'Layered, cut-and-assembled composition of disparate visual fragments.',
    prompt:
      'Compose the image as an assemblage of distinct layered fragments — visible edges, overlapping cut-out shapes, mixed scale and perspective between elements combined into one frame. Mix of textures and visual sources within a single composition. Intentional, expressive layering rather than a single seamless photographic scene.',
  },
  {
    key: 'vector_art',
    name: 'Vector Art',
    description:
      'Clean flat illustration with smooth curves and defined outlines.',
    prompt:
      'Flat, smooth illustrated shapes with clean defined outlines and no photographic texture or grain. Simplified, geometric forms with smooth curves. Solid or simply-graduated fills, minimal shading complexity. Crisp, scalable-looking clarity, like professional flat digital illustration.',
  },
  {
    key: 'futuristic',
    name: 'Futuristic',
    description: 'Sleek, advanced, forward-looking visual language.',
    prompt:
      'Sleek, smooth, minimal-ornament forms suggesting advanced technology — clean curved surfaces, integrated light lines, and a sense of engineered precision. Cool, controlled color palette: whites, silvers, cool blues, with occasional glowing accent light. Bright, clean environments rather than dark or gritty ones. A polished, optimistic sense of advancement.',
  },
  {
    key: 'handwritten',
    name: 'Handwritten',
    description:
      'Organic, human-made visual texture evoking hand-crafted or hand-drawn work.',
    prompt:
      'Visible organic, slightly imperfect linework and texture suggesting a human hand — uneven edges, natural variation in line weight, hand-drawn or hand-crafted quality rather than mechanically precise. Warm, approachable color palette. Compositions that feel personal and intimate rather than mass-produced or corporate.',
  },
  {
    key: 'bohemian',
    name: 'Bohemian',
    description: 'Relaxed, eclectic, naturally textured visual language.',
    prompt:
      'Warm, earthy, layered color palette — terracotta, cream, sage, muted gold. Natural textures: woven fabric, wood, plants, and organic materials featured prominently. Relaxed, informal composition rather than rigid symmetry. Soft, warm natural light. An eclectic mix of patterns and textures that still feels cohesive.',
  },
  {
    key: 'graffiti',
    name: 'Graffiti',
    description:
      'Bold urban street-art visual language with expressive mark-making.',
    prompt:
      'Bold, expressive, spray-paint-style mark-making with visible drips, texture, and layered application. High-contrast, vivid color combinations. Urban surfaces — brick, concrete, metal — as implied or actual background texture. Energetic, gestural composition rather than precise or restrained.',
  },
  {
    key: 'aurora',
    name: 'Aurora',
    description:
      'Luminous, flowing gradient light evocative of aurora borealis.',
    prompt:
      'Soft, flowing, luminous gradient color transitions — greens, purples, blues, and pinks blending smoothly across the frame. Ethereal, glowing light sources with soft diffusion rather than hard edges. Dark or night-toned base environment that lets the luminous color read as the dominant visual element. A calm, awe-inspiring, atmospheric mood.',
  },
  {
    key: 'victorian',
    name: 'Victorian',
    description:
      'Ornate, formal 19th-century visual language with rich detail and period styling.',
    prompt:
      'Ornate, richly detailed surfaces — intricate patterns, formal period-appropriate clothing, furniture, and architectural detail. Deep, saturated jewel-toned color palette: burgundy, forest green, gold, deep brown. Formal, symmetrical, composed staging reminiscent of period portraiture. Warm, dramatic, controlled lighting reminiscent of oil painting.',
  },
];
