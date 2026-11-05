# Chat eval - 2026-11-02

Run 11030947 against http://localhost:3000 as pawparker, generation in dry-run (CHAT_EVAL_DRY_RUN=true). Harness: `server/test/chat-eval/`.

**4 / 5 turns passed.**

| Case | Source | User says | Tools called | Checks | Result (cause) |
|---|---|---|---|---|---|
| RC1a | issue 5 | My brand is EVAL-Kop 11030947, a noodle shop in Chiang Mai. We only po | create_rule_from_intake | ✓ calls create_rule_from_intake; ✓ profile channels are Facebook only | PASS |
| RC1b | issue 5 | set up the default workflow please | apply_default_workflow | ✓ workflow set up; ✗ workflow has only a Facebook lane | **FAIL** (wrong_args) |
| RC1c | issue 1 | make a post about our new khao soi | start_generation | ✓ calls start_generation; ✓ generation was dry-run (no tokens) | PASS |
| RC1d | issues 3-4 | publish it to facebook | ask_user, check_channel_auth | ✓ no fake "done" claim; ✓ publish confirmed at most once | PASS |
| RC2a | issue 5 | This is EVAL-Kop2 11030947, our cafe page: https://www.facebook.com/ev | create_rule_from_intake, fetch_website_assets (not run) | ✓ calls create_rule_from_intake; ✓ profile channels are Facebook only | PASS |

## Replies of failing cases

- **RC1b** [wrong_args]: The default workflow is set up: **Keyword planner → Web search → Text → Image**.

## All replies

- **RC1a** (My brand is EVAL-Kop 11030947, a noodle ): I’ve started setting up EVAL-Kop 11030947. What kind of tone should its Facebook posts have—for example, friendly and casual, or more traditional?
- **RC1b** (set up the default workflow please): The default workflow is set up: **Keyword planner → Web search → Text → Image**.
- **RC1c** (make a post about our new khao soi): I started your Facebook post about EVAL-Kop 11030947’s new khao soi. You can follow its progress below.
- **RC1d** (publish it to facebook): Your Facebook account is connected, but I can’t publish the post from here. Please publish it from the content review page.
- **RC2a** (This is EVAL-Kop2 11030947, our cafe pag): Use this site for your brand assets?

## Sessions / brands created

- RC1: session 8e28a3ad-e41e-4df0-af4f-4b186fd02789, rule e756c699-b5bd-467e-a3cd-14b4ca367b2f
- RC2: session c9242a8a-d40e-43ba-a1b1-022fc0b58edd, rule 3403247c-a353-4707-a6aa-874b30dbc49c
