# Mosonic — User FAQ

Complete frequently asked questions for Mosonic users. Mosonic is an AI-driven digital content platform that helps you turn a campaign strategy into social posts, images, and videos, then publish them to connected channels.

---

## Getting started

### What is Mosonic?

Mosonic is a cloud SaaS platform for AI-assisted content creation and publishing. You define a campaign **Rule** (brand voice, audience, channels), build or generate a **Workflow**, run a **Pipeline** to generate content, review and approve it, then **Upload** (publish or schedule) to social channels.

### Who is Mosonic for?

Small and medium businesses, startups, marketing agencies, e-commerce teams, and enterprises that need multi-channel marketing content with consistent brand voice.

### How do I create an account?

Go to **Create account**, enter your name, username, email, password (phone optional), then verify your email with the code sent to you. After verification you can sign in and use the workspace.

### How do I sign in?

Open **Sign in** and enter your username and password. If your session expired, sign in again.

### I forgot my password. What should I do?

Use **Forgot password**, enter your email, verify the 6-digit OTP, then set a new password.

### My account says it is suspended. What now?

If you see **Your account has been suspended**, contact support at **support@mosonic.com**. You cannot use the workspace until the account is restored.

### Where do I change my profile or language?

Open **Account settings** (`Settings` → accounts). You can update contact details and choose the app language: **English**, **ไทย (Thai)**, or **简体中文**. Server system messages may still appear in English.

### What is the difference between Member and Admin?

Most users are **Members** and use Rules, Workflows, Content, Upload, and Posts. **Administrators** also see the Admin area for platform operations. Your role is shown on your profile strip.

---

## Home, Dashboard, and navigation

### What can I do from Home?

From **Home**, describe what you want to create, pick or set up a Rule, and jump into the content flow. Quick links go to Dashboard, Content, and Rules.

### What does the Dashboard show?

**Dashboard** summarizes recent activity and engagement highlights (reach, likes, comments, clicks, best channel/post where data is available). Use it for a high-level view; detailed publishing status lives under **Posts**.

### How do I find pages quickly?

Use the topbar search (**Search pages and routes…**) to jump to Dashboard, Rules, Content, Pipelines, Posts, Account settings, and similar destinations.

### What do the notification bell alerts mean?

Notifications cover pipeline progress (started, completed, step review), news auto-generate runs, and billing events such as credit refunds. You can mark all read, clear all, and optionally enable background alerts (browser / PWA).

---

## Rules (campaign strategy)

### What is a Rule?

A **Rule** is the reusable campaign strategy: brand voice, audience, goals, keywords, channels, and guidelines. It is set up once per campaign and reused across many generation runs. It is **not** the same as the per-run content prompt (“what to post about today”).

### How do I create a Rule?

From **Rules** (**Rule setup**) or **Home**:

1. **Create by prompt** — short text plus optional attachments, or  
2. **Create campaign rule** — either **Guided setup** (purpose → brand → audience → channels → campaign → guidelines → review) or **Express** (prompt + files only).

Mosonic extracts a structured Rule with AI (**Generate rule**). This may use credits; confirm the cost before continuing.

### What content purposes can I choose?

Social marketing, Thought leadership, Internal communications, Educational, E-commerce, or Other.

### What can I put in a Rule?

Typical sections include:

- **Brand** — name, industry, description, voice, tone tags, restrictions, call to action  
- **Audience** — description, age range, gender, locations, interests, pain points, primary and target languages  
- **Campaign** — goals, keywords, hashtags, formats, posting frequency, dates  
- **Channels** — platforms you plan to publish to  
- **Guidelines** — dos, don’ts, required elements, SEO keywords  
- **Autonomy** — publishing autonomy for the rule (off / review optional / full auto; subject to product limits)

### How do I edit a Rule after creation?

Open the Rule in **Manage** (structured editor) or inspect structure in **Tree**. Use **Save changes** or **Discard all** when you have pending edits. Status badges include Active, Draft, Archived, Processing, and Failed.

### Why do I need channels on my Rule?

Channel selection drives Branch / Adapt / Merge workflows and upload previews. Branch nodes need **at least two channels** on the campaign Rule.

### What is “News Auto-Generate” on a Rule?

From the Rule toolbar, **News auto-generate** opens settings to fetch news and generate content on a schedule (see [News Auto-Generate](#news-auto-generate)).

### What is Autonomous publishing on a Rule?

Autonomy settings control how hands-off publishing can be for that Rule. News Auto-Generate still recommends **Draft — review before publishing** for most users; full auto-publish may be limited depending on product version.

---

## Workflows and the canvas

### What is a Workflow?

A **Workflow** is the generation pipeline for a Rule: an ordered graph of AI and structural nodes. The per-run **content prompt** (topic) is entered when you run; the Rule stays reusable.

### How do I open a Workflow?

Select a Rule and continue to **Workflow**, or open **Workflows** (Library), find a workflow, then edit on the canvas at `/workflow/:ruleId`.

### How do I get a default workflow structure?

When the canvas is empty, Mosonic can apply a free default structure (no Generate Workflow charge), typically along the lines of:

**Keyword Planner → Intelligence → Text Generation → Branch → Adapt (per channel) → Merge**

You can also rebuild or generate a workflow from guided questions when available.

### What node types exist?

| Node | What it does |
|------|----------------|
| **Keyword Planner** | Plans keywords for the run |
| **Intelligence** | Web research (trends, market, competitors, or custom) |
| **Text Generation** | Core written content |
| **Image Generation** | Visuals from context |
| **Video Generation** | Cinematic (Sora-style) or Presenter (HeyGen) video |
| **Translation** | Translate to another language |
| **Transcription** | Speech/audio to text |
| **Summarization** | Shorten content |
| **Adapt** | Rewrite for a specific channel lane |
| **Branch** | Split into parallel channel lanes |
| **Merge** | Wait for all lanes before finishing |

**Branch** and **Merge** are structural (no AI credit charge). Adapt is assigned from the lane/channel, not as a free-floating trunk node when using multi-channel layout.

### How do I add or remove nodes?

Open the **Nodes** panel, drag nodes onto the canvas, and connect them. Select a node for **Properties / Configuration**. Use the delete control on a selected node when editing is allowed. Save with **Save Changes**.

### Can I rename a Workflow?

Yes. Click the workflow name in the toolbar (look for the rename / pencil affordance) and edit **Untitled Workflow** or your current name.

### What is Rebuild nodes?

**Rebuild nodes** refreshes layout from the Rule and related notes when the graph needs to be realigned after Rule or structure changes.

### What is the content prompt vs a node prompt?

- **Content prompt** — “What do you want to post about?” for this run (entered in the prompt bar).  
- **Node settings / optional instructions** — configuration on each node (model, tone, languages, video mode, etc.).

### What does the Run cost card show?

The canvas **Run cost** estimate shows credits for the current graph, your balance, and a per-node-type breakdown. Estimates update from the live canvas (not only after save).

### Why do I see a “No live web research” warning?

That freshness warning appears when the workflow has no **Intelligence** node. Generation can still run; research simply won’t be injected unless you add Intelligence.

### What are Used Pipelines?

**Used Pipelines** lists past runs for this workflow. You can preview a past structure, rename a pipeline, or **Apply to workflow** to restore that graph onto the canvas.

### How do Branch, Adapt, and Merge work together?

1. **Branch** fans the flow into one lane per selected channel.  
2. **Adapt** (and other lane nodes) run per channel.  
3. **Merge** waits until lanes finish (completed or skipped) before the pipeline finalizes content for upload.

Media nodes usually belong on a channel lane when using the branch layout.

---

## Video: Cinematic vs Presenter

### What video modes are available?

On a **Video Generation** node:

- **Cinematic** — short clip generation (aspect ratio, duration, resolution, negative prompt, etc.).  
- **Presenter** — avatar speaking video via HeyGen (avatar, voice, orientation, expressiveness, motion prompt, optional background).

### How do I set up Presenter video?

1. Choose **Presenter** mode.  
2. Pick an **Avatar** from the library or **Upload new avatar** (PNG/JPEG, front-facing; size limits apply).  
3. Pick a **Voice** (filter by gender/language; preview available).  
4. Configure orientation, expressiveness, motion prompt, and optional background.  
5. **Save the workflow** before uploading assets or running.

Avatar and voice are required for Presenter runs; validation will block the run if they are missing.

---

## Running pipelines

### What is a Pipeline?

A **Pipeline** is one execution of a Workflow: nodes run in order (or in parallel lanes), produce outputs, and end in content ready for review/upload. Track runs under **Pipelines** (**Runs**).

### How do I start a run?

On the workflow canvas, enter your topic in the prompt bar and start **Run Pipeline** (or **Generate content** depending on mode). Confirm in **Run workflow?** after reviewing cost and execution mode.

### What is Auto vs Step mode?

- **Auto** — run all nodes without pausing for review.  
- **Step** — pause at each reviewable node. On the canvas, choose **Review** (open the review dialog) or **Skip** (continue without editing). You do not pre-select which nodes to review before the run.

### Which nodes can pause for review in Step mode?

Reviewable types include Keyword Planner, Text, Image, Video, Translation, Transcription, Summarization, Adapt, and Intelligence. Structural nodes (Branch, Merge) do not pause for review.

### What can I do in the Review dialog?

View the node output, edit text where supported, **Continue**, **Regenerate** (may cost extra credits), or replace image/video where offered. Open **Review** from the node chip, or click the waiting node.

### What does Skip mean on a running or failed node?

While a node is **Running** or **Failed**, **Skip** abandons that node’s generation and marks it **Skipped** so the pipeline can continue. This is different from Step-mode **Skip** on a waiting review (which keeps the generated output and continues).

### Can I Retry a failed node?

Yes. On a failed node, use **Retry**. Progress may show **Retrying… attempt N/M**.

### Can I stop a pipeline mid-run?

Yes. Use **Stop pipeline**. Finished steps are kept as a draft; credits for unfinished steps are refunded where applicable. Confirm in **Stop this pipeline?**

### How do I find past runs?

Open **Pipelines**. Filter by status (All, Running, Paused, Completed, Failed), workflow, and sort by started/completed time. Cards may show **Campaign** vs **News**, step counts, **Open run**, and **Stop**.

### Pipeline finished but I don’t see content. What happened?

Rarely a run completes without resolvable content artifacts. Refresh **Pipelines** / **Content**, retry from the run if available, or contact support with the pipeline ID. Check notifications for completion or failure messages.

---

## Credits, plans, and top-up

### What are credits?

Credits are the unit of billing for AI work (rules, workflows, pipeline nodes, regenerations, some unlocks). Your remaining balance appears in the topbar (**X credits remaining**).

### Where do I see usage?

Open **Usage & billing** (`/usage`):

- **Overview** — plan banner, credits used/remaining, reset date, charts, activity log (charges and refunds)  
- **Top up** — buy credit packages  
- **Plans** — subscription plans

### How do I top up credits?

In **Usage → Top up**, choose a package and **Pay with Payni** (PayNow / bank transfer in a new window). Balance updates after successful payment. From a run dialog with insufficient credits, use **Refill credits**.

### Which actions use credits?

Typical billable operations include:

- Rule generation  
- Workflow generation (when using paid generate; default empty-canvas structure is free)  
- Keyword Planner, Intelligence, Text, Adapt, Translation, Transcription, Summarization  
- Image generation  
- Presenter video (HeyGen) and Cinematic video (Sora)  
- Social account unlock (small fee when unlocking a channel)  
- Regenerating a node during Step review  

**Branch** and **Merge** do not charge AI credits.

Exact amounts come from the live estimate and your plan’s credit pricing—not fixed public dollars in this FAQ.

### What happens if I don’t have enough credits?

The run confirm dialog blocks start until the balance covers the estimate. Top up, then try again. Low balance warnings also appear on Usage.

### Do I get credits back if I stop a pipeline?

Credits for steps that did **not** finish are refunded when you stop a pipeline (as stated in the stop confirmation). Finished steps remain.

### What does “X credits ≈ $1.00” mean?

Usage tooltips show an approximate public conversion rate for context. Your plan’s actual credit grant and pricing are shown on **Plans** / checkout.

---

## Content review and versions

### Where is my generated content?

- **Content** library — all generated content across campaigns (filter by status, media, sort).  
- **Workflow Contents** drawer on the canvas — content for the current workflow.  
- Opening an item typically takes you to the unified **Upload** review workspace (`/upload/:uploadId`).

### What do Draft / In review / Approved / Rejected mean?

Those are content review statuses. Drafts await your decision; Approved is ready for upload/publish; Rejected stays out of the publish path until you revise.

### How do I edit generated text or media?

In the upload/review workspace:

- Edit text inline.  
- Replace image (JPG/PNG) or video (MP4) via upload.  
- Re-run a node, copy output, or add/generate additional outputs when offered.  

Native pixel-level image/video editors are not the focus; replace or regenerate instead.

### How do Approve and Reject work?

Use the **Review Decision** sidebar:

- **Approve & Send to Upload** / approve steps as presented  
- **Reject Draft**  
- **Save changes**  
- **Version History** — browse and **Restore** earlier versions  

Versions are kept for history; restoring brings back a prior snapshot.

### What if content was generated from news?

Items may show a **Generated from news** banner with a link to **View source**.

---

## Upload, publish, and channels

### Which channels does Mosonic support?

**Facebook**, **Instagram**, **YouTube**, **LinkedIn**, **TikTok**, and **RedNote** (Xiaohongshu).

### How do I connect a social account?

In **Account settings**:

1. **Unlock** the channel if required (may cost a small credit amount).  
2. **Connect** via the OAuth provider (Zernio for Meta, Google, LinkedIn, TikTok).  
3. For **RedNote**, scan the QR code with the RedNote/WeChat app and verify the session.  

Use **Create Zernio profile** / **Sync accounts** if the UI asks after OAuth return.

### Why does it say my account is not connected or session expired?

Connect or reconnect the channel in **Account settings**. RedNote sessions can expire and need QR reconnect. Publishing is blocked until the account is healthy.

### How do I publish content?

Open the upload workspace for an approved package:

1. Review per-channel tabs (or **All channels**).  
2. Set caption source (Primary text, Translation, Summary, or Custom).  
3. Attach image(s) or video as allowed.  
4. Include only the channels you want.  
5. **Publish now** / **Publish all included**, or **Schedule** / **Schedule all included** (future date/time).

Use **Preview** to see how the post will look on each platform.

### Can I schedule RedNote posts?

RedNote supports **publish now** only; scheduling is not available for RedNote in the current product.

### Any channel-specific tips?

- **TikTok** — vertical 9:16 preview; slideshow title length limits apply.  
- **YouTube** — set a separate video title when required.  
- **RedNote** — QR session; reconnect if expired.  

### What if publishing fails?

Use **Retry** on the failed channel. Check connection status, caption requirements, and media constraints. Status banners show publishing, published, scheduled, or failed states.

### Where do I manage published or scheduled posts?

Open **Posts**. Filter by Pending, Scheduled, Published, Failed, Cancelled, or Partial. You can search, filter by channel, bulk schedule/publish/delete, and open a post to edit caption/title/schedule (when the provider allows) or **Publish now** / **Retry publish**.

### What is “Limited edit on Zernio”?

Some edits after publish/schedule are constrained by the external provider API. Follow on-screen warnings and use Save when sync is available.

---

## Analytics and performance

### Does Mosonic have a full Analytics page?

Campaign-level Analytics UI may be limited depending on release. Today you can:

- Use **Dashboard** highlights.  
- Open a **Post** and refresh **Analytics** / metrics for connected Zernio channels.  

**RedNote does not support analytics** in the current integration.

### Can I sync metrics manually?

On post analytics, use **Refresh metrics** where offered to pull the latest platform data.

---

## News Auto-Generate

### What is News Auto-Generate?

For a Rule with a saved Workflow, Mosonic can fetch news and start content generation on a schedule or on demand (**Run now**).

### How do I configure it?

On **News Auto-Generate** for a Rule:

- Enable auto-generate — **Daily** (e.g. 8:00 AM) or **Twice daily** (e.g. 8:00 AM & 6:00 PM server time)  
- News source — country, language, category  
- Optional headline **Keywords**  
- **Max posts per day** (1–3)  
- **Min relevance score** (60–90; **70 — Balanced** is recommended)  
- Content review — **Draft — review before publishing** (recommended) or **Auto-approve — skip manual review** (still subject to publish limits)

### Why did a news run skip?

Common skip reasons shown in the UI:

- **No match** / **Keyword filter** / **Low relevance**  
- **Daily limit**  
- **No articles**  
- **No workflow** (save a workflow first)  
- **Busy** (another run in progress)  
- **Failed** (check notifications / retry later)

### Does Run now count toward my daily cap?

Yes. Manual **Run now** counts toward the max posts per day setting.

---

## Intelligence and research

### What does the Intelligence node do?

It runs web research (All / Trend / Market / Competitor / Custom) and feeds context into downstream **Text Generation** so posts reflect fresher market or topic signals.

### Should every workflow include Intelligence?

Recommended when you want live research. Without it, you may see the freshness warning, but the pipeline can still run.

---

## Languages and translation

### Can I use Mosonic in Thai or Chinese?

Yes. Switch UI language in Account settings. Content languages for campaigns and Translation nodes include options such as Thai, English, Japanese, Chinese, Korean, Spanish, French, and German (plus news-source languages where applicable).

### How does the Translation node work?

Configure source and target language, formality (formal/casual), and preserve-formatting options. It translates pipeline text for multilingual posts.

---

## Pricing and plans

### Where do I see subscription plans?

**Usage & billing → Plans**, or the public **Pricing** page (**Pick the plan that fits your pipeline**). Plans show monthly credit grants; Enterprise may use **Contact sales**.

### Is there a free tier?

Marketing may offer **Start free** / Free plan entry. Exact quotas depend on the live Plans catalog after signup.

---

## Troubleshooting

### Invalid username or password

Check credentials, or use Forgot password. Ensure email verification was completed after signup.

### Invalid or expired verification / OTP code

Request a new code and enter it promptly. Codes expire for security.

### Could not save or run the workflow

- Save the workflow first.  
- Fix validation errors (disconnected nodes, Branch needing ≥2 channels, Presenter avatar/voice required, lane assignment for media nodes).  
- Confirm you have enough credits.  
- Check network connectivity and try again.

### Not enough credits / could not calculate estimate

Top up on Usage, or wait for plan reset. If estimate fails, refresh the page and retry; contact support if it persists.

### Pipeline retry or skip failed

Confirm the pipeline is still active (Running/Paused) and the node is in a skippable or retryable state. Refresh the run and try again.

### Publishing failed / caption required

Ensure the channel is connected, caption is non-empty where required, media meets platform rules, and retry. For RedNote, verify the QR session.

### Network error / service temporarily unavailable

Retry after a moment. If auth or generation stays down, check status with support.

### We can’t find that page (404)

Use the sidebar or topbar search to open a valid route, or return to Home.

---

## Privacy, support, and safety

### Who owns my brand strategy and content?

Mosonic is designed so campaign Rules and generated content stay under your account/workspace. Do not share login credentials. Contact support for account or data questions.

### How do I contact support?

Email **support@mosonic.com**. Include your username, approximate time of the issue, and Rule / Workflow / Pipeline / Upload IDs when possible.

### Are there admin-managed help articles?

Operators may maintain FAQ entries for the in-product or support FAQ service. This document is the full user-oriented FAQ source for Mosonic product behavior.

---

## Quick end-to-end checklist

1. **Sign up / sign in** and unlock + connect channels in Account settings.  
2. **Create a Rule** (guided or express) and confirm brand, audience, and channels.  
3. Open **Workflow**, use the default or custom graph, enter what you want to post about.  
4. **Run Pipeline** in Auto or Step mode; review, skip, or retry as needed.  
5. Open the **Upload** workspace, edit if needed, **Approve**, then **Publish** or **Schedule**.  
6. Track results in **Posts** and **Dashboard**; manage credits under **Usage & billing**.  
7. Optionally enable **News Auto-Generate** for recurring news-based drafts.

---

*Last aligned with Mosonic product surfaces: Rules, Workflows, Pipelines, Content, Upload, Posts, Usage, News Auto-Generate, and Account settings. Features marked as limited (full campaign Analytics, cost budgets, workflow templates UI) may expand in later releases.*
