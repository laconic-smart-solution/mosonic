from pathlib import Path

def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'{label}: pattern not found in {path}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')
    print('ok', label)

# 1) dependency-resolver: cinematic also heygen
replace_once(
    r'D:\Projects\work\neutral-tex\server\src\orchestration\dependency-resolver.service.ts',
    "    const videoProvider = isPresenter ? 'heygen' : 'sora';",
    "    // Presenter + cinematic both use HeyGen (Sora only for legacy in-flight jobs).\n    const videoProvider = 'heygen';",
    'dependency-resolver provider',
)

# 2) media-node-completion default + failure label
replace_once(
    r'D:\Projects\work\neutral-tex\server\src\orchestration\media-node-completion.service.ts',
    "    const videoProvider =\n      context?.videoProvider ?? (mode === 'presenter' ? 'heygen' : 'sora');",
    "    const videoProvider =\n      context?.videoProvider ?? 'heygen';",
    'media-node-completion provider',
)
replace_once(
    r'D:\Projects\work\neutral-tex\server\src\orchestration\media-node-completion.service.ts',
    "    const label =\n      videoProvider === 'heygen' ? 'Presenter video' : 'Cinematic video';",
    "    const label =\n      videoProvider === 'sora'\n        ? 'Cinematic video (legacy Sora)'\n        : 'HeyGen video';",
    'media-node-completion label',
)

# 3) video-check defaults
replace_once(
    r'D:\Projects\work\neutral-tex\server\src\orchestration\processors\video-check.processor.ts',
    "      videoProvider = 'sora',",
    "      videoProvider = 'heygen',",
    'video-check default provider',
)
replace_once(
    r'D:\Projects\work\neutral-tex\server\src\orchestration\processors\video-check.processor.ts',
    "    const intervalMs = videoPollIntervalMs(payload.videoProvider ?? 'sora');",
    "    const intervalMs = videoPollIntervalMs(payload.videoProvider ?? 'heygen');",
    'video-check interval default',
)

# 4) stale executeCinematic comment
replace_once(
    r'D:\Projects\work\neutral-tex\server\src\nodes\services\video-generation.service.ts',
    '  /** `video_cinematic` node: always Sora, regardless of stored config.mode. */',
    '  /** `video_cinematic` node: HeyGen (cinematic_avatar | heygen_video), regardless of stored config.mode. */',
    'executeCinematic comment',
)

# 5) chat tool descriptions Sora → HeyGen
replace_once(
    r'D:\Projects\work\neutral-tex\server\src\rule\tools\generate-more.tools.ts',
    'or generate_cinematic_video (Sora scene)',
    'or generate_cinematic_video (HeyGen cinematic_avatar / heygen_video)',
    'generate-more image desc',
)
replace_once(
    r'D:\Projects\work\neutral-tex\server\src\rule\tools\workflow-edit.tools.ts',
    'video_cinematic (Sora scene)',
    'video_cinematic (HeyGen cinematic_avatar / heygen_video)',
    'workflow-edit add node desc',
)

# 6) cost.service: drop sora fallbacks as primary; keep last-resort only via heygen
replace_once(
    r'D:\Projects\work\neutral-tex\server\src\cost\cost.service.ts',
    """        const modelKey = dto.providerModel ?? 'heygen_video_1';
        const p =
          OPENAI_VIDEO_PRICING[modelKey] ??
          OPENAI_VIDEO_PRICING['heygen_video_1'] ??
          OPENAI_VIDEO_PRICING['sora-2'] ??
          OPENAI_VIDEO_PRICING['sora'];""",
    """        const modelKey = dto.providerModel ?? 'heygen_video_1';
        const p =
          OPENAI_VIDEO_PRICING[modelKey] ??
          OPENAI_VIDEO_PRICING['heygen_video_1'] ??
          OPENAI_VIDEO_PRICING['heygen-presenter'];""",
    'cost.service defaults',
)

# 7) billable comment + keep USD as HeyGen cinematic reference
replace_once(
    r'D:\Projects\work\neutral-tex\server\src\credit\lib\billable-node-credit-types.ts',
    '/** OpenAI Sora reference USD. */',
    '/** HeyGen cinematic reference USD (fresh installs without legacy row). */',
    'billable cinematic comment',
)

# 8) operation-reference-costs: cinematic → heygen
replace_once(
    r'D:\Projects\work\neutral-tex\server\src\credit\lib\operation-reference-costs.ts',
    """  {
    nodeType: 'video_generation_cinematic',
    provider: 'openai',
    costUsd: 0.48,
  },
  { nodeType: 'video_generation_cinematic', provider: 'runway', costUsd: 0.5 },""",
    """  {
    nodeType: 'video_generation_cinematic',
    provider: 'heygen',
    costUsd: 0.48,
  },
  // Legacy / optional alternate providers kept for admin tables.
  { nodeType: 'video_generation_cinematic', provider: 'openai', costUsd: 0.48 },
  { nodeType: 'video_generation_cinematic', provider: 'runway', costUsd: 0.5 },""",
    'operation-reference cinematic heygen',
)

# 9) credit.module seed model for heygen cinematic vs presenter
replace_once(
    r'D:\Projects\work\neutral-tex\server\src\credit\credit.module.ts',
    """            model:
              op.provider === 'heygen'
                ? 'heygen-av3'
                : op.provider === 'runway'
                  ? 'runway-gen4'
                  : 'sora',""",
    """            model:
              op.provider === 'heygen'
                ? op.nodeType.includes('presenter')
                  ? 'heygen-av3'
                  : 'heygen_video_1'
                : op.provider === 'runway'
                  ? 'runway-gen4'
                  : 'sora',""",
    'credit.module seed models',
)

# Also add heygen_video_1 row beside sora in DEFAULT service rates if only sora exists for openai video
# (leave openai/sora row for legacy)
print('all patches applied')
