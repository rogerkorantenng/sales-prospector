# Demo Builder — Design Spec

**Date:** 2026-04-05
**Author:** Roger Koranten-Ng
**Status:** Approved

## Overview

An AI-powered demo builder integrated into Brownshift Prospector that generates full, production-quality Next.js applications as sales demos for prospects. The AI builds proper multi-page dashboards or landing pages, populated with realistic demo data, tailored to each prospect's industry and needs.

Think: a mini ICS PayScale built on-demand for any prospect, in minutes.

## User Flow

1. User clicks "Build Demo" on a prospect in the Prospects page
2. Chooses demo type: **Landing Page** or **SaaS Dashboard Mockup**
3. Split-view opens: **Chat (40% left)** + **Preview iframe (60% right)**
4. AI greets with prospect context and asks 3-5 guided questions with quick-reply buttons
5. User answers → AI generates a full Next.js app (15-30 files)
6. Progress shown in real-time: "Designing layout... Creating pages... Populating data... Building..."
7. Build completes (2-5 min) → preview loads in iframe
8. User types feedback in chat → AI modifies files → rebuilds → preview updates
9. Iterate until satisfied
10. Click "Deploy" → uploads to public S3 → returns shareable URL
11. Share link with prospect as part of the pitch
12. Chat persists — come back anytime for modifications

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────┐
│  Demo Builder UI (Next.js page)                         │
│  ┌──────────────────┬──────────────────────────────────┐│
│  │  Chat Panel (40%)│  Preview Panel (60%)             ││
│  │                  │                                   ││
│  │  AI messages     │  iframe: preview URL              ││
│  │  Quick replies   │  Top bar: URL, Refresh, Deploy    ││
│  │  User messages   │  Loading: progress + status       ││
│  │  File list       │                                   ││
│  └──────────────────┴──────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
         │ API calls
┌────────▼────────────────────────────────────────────────┐
│  FastAPI Backend                                        │
│                                                         │
│  POST /api/demos                     Create new demo    │
│  GET  /api/demos                     List all demos     │
│  GET  /api/demos/{id}                Get demo details   │
│  POST /api/demos/{id}/generate       AI generates code  │
│  POST /api/demos/{id}/message        Chat message       │
│  GET  /api/demos/{id}/messages       Get chat history   │
│  GET  /api/demos/{id}/build-status   Poll build status  │
│  POST /api/demos/{id}/deploy         Deploy to public   │
│  DELETE /api/demos/{id}              Delete demo        │
└────────┬────────────┬───────────────────────────────────┘
         │            │
    ┌────▼────┐  ┌────▼──────────┐
    │ Bedrock │  │ CodeBuild     │
    │ Opus4.6 │  │               │
    │         │  │ Pre-baked     │
    │ Generates│ │ Docker image  │
    │ 15-30   │  │ with node_    │
    │ files   │  │ modules       │
    └─────────┘  │               │
                 │ Builds Next.js│
                 │ static export │
                 └──────┬────────┘
                        │
                   ┌────▼────┐
                   │ S3      │
                   │         │
                   │ /source │
                   │ /build  │
                   │ /public │
                   └────┬────┘
                        │
                   ┌────▼────────┐
                   │ CloudFront  │
                   │             │
                   │ Preview URL │
                   │ Public URL  │
                   └─────────────┘
```

### Database Tables

```sql
-- Demo projects
demo_projects:
  id (uuid PK)
  prospect_id (FK -> companies)
  name (text)                    -- "Korle Bu Patient Management System"
  demo_type (text)               -- "landing_page" | "saas_dashboard"
  status (text)                  -- "configuring" | "generating" | "building" | "preview" | "deployed" | "failed"
  config (jsonb)                 -- answers to guided questions
  s3_prefix (text)               -- "projects/{id}"
  preview_url (text)             -- CloudFront preview URL
  live_url (text)                -- public deployed URL (after deploy)
  codebuild_id (text)            -- current CodeBuild build ID
  created_at, updated_at

-- Chat messages
demo_messages:
  id (uuid PK)
  project_id (FK -> demo_projects)
  role (text)                    -- "system" | "assistant" | "user"
  content (text)                 -- message text
  metadata (jsonb)               -- quick_replies, file_changes, progress updates
  created_at

-- Generated files
demo_files:
  id (uuid PK)
  project_id (FK -> demo_projects)
  file_path (text)               -- "src/app/page.tsx"
  content (text)                 -- full file content
  version (int)                  -- increments on each modification
  created_at, updated_at
```

## AI Code Generation

### Template (Fixed Boilerplate — Not AI Generated)

These files are identical for every demo project:

- `package.json` — fixed deps: next 16, react 19, tailwindcss 4, shadcn/ui, recharts, lucide-react
- `next.config.ts` — `output: "export"`, `images: { unoptimized: true }`
- `tsconfig.json` — standard Next.js config
- `postcss.config.mjs` — Tailwind postcss plugin
- `src/lib/utils.ts` — `cn()` helper
- `next-env.d.ts` — type references
- All `src/components/ui/*.tsx` — pre-installed shadcn components (button, card, table, badge, tabs, chart, etc.)

Total template size: ~50 files (mostly shadcn components). Stored in a Docker image with `node_modules` pre-installed.

### AI-Generated Files (Per Project)

For a **SaaS Dashboard Mockup**, the AI generates:

```
src/app/globals.css              -- theme colors matching prospect's brand
src/app/layout.tsx               -- root layout with sidebar navigation
src/app/page.tsx                 -- redirect to /dashboard
src/app/dashboard/page.tsx       -- main dashboard with stats, charts
src/app/(routes)/[feature1]/page.tsx  -- feature pages (3-5 based on recommendations)
src/app/(routes)/[feature2]/page.tsx
src/app/(routes)/reports/page.tsx
src/app/(routes)/settings/page.tsx
src/components/sidebar.tsx       -- navigation sidebar with prospect branding
src/components/stats-card.tsx    -- reusable stat card
src/components/data-table.tsx    -- reusable data table with demo data
src/lib/demo-data.ts             -- realistic fake data for all pages
```

Typically **15-25 AI-generated files** producing a **5-8 page application**.

For a **Landing Page**, the AI generates:

```
src/app/globals.css              -- brand colors
src/app/layout.tsx               -- clean layout (no sidebar)
src/app/page.tsx                 -- hero, features, testimonials, pricing, CTA, footer
src/components/header.tsx        -- navigation header
src/components/footer.tsx        -- footer
```

Typically **5-8 AI-generated files** producing a single-page or 2-3 page site.

### AI Prompt Structure

```
SYSTEM: You are building a production-quality Next.js application as a sales demo.

Output format — return files as XML:
<file path="src/app/page.tsx">
complete file contents
</file>

Rules:
- Next.js 16 App Router, TypeScript, Tailwind CSS 4
- Use shadcn/ui components (they're pre-installed): Button, Card, Table, Badge, Tabs, etc.
- Use recharts for charts (pre-installed)
- Use lucide-react for icons (pre-installed)
- "use client" only where needed (interactive components)
- Populate with REALISTIC demo data — not "Lorem ipsum"
- Use industry-appropriate terminology and data
- Make it look PROFESSIONAL — this is going to a real client
- Include working navigation between all pages
- Every page should have real content, not placeholders
- Always return COMPLETE file contents, never partial

Available shadcn components: button, card, table, badge, tabs, input, select,
dialog, separator, progress, dropdown-menu, skeleton, tooltip, popover
```

**User prompt includes:**
- Prospect name, industry, region, size
- AI analysis: recommended services, pain points, confidence
- Competitor intelligence: current tech, gaps
- Demo type (landing page vs SaaS)
- User's answers to guided questions
- For modifications: current file contents + change request

### Generation Strategy

1. **Initial generation**: AI generates all 15-25 files in one response. Large context output (could be 5000-15000 tokens). Uses Opus 4.6 for best quality.
2. **Modifications**: Send current file contents of affected files + change request. AI returns only modified files. Full file replacement, never diffs.
3. **Context management**: For modifications, include full contents of ALL project files so AI has context. For a 15-25 file project, this fits comfortably in Opus 4.6's context window.

## Build Pipeline

### Pre-baked Docker Image (Built Once)

```dockerfile
FROM node:22-slim
WORKDIR /template
COPY package.json package-lock.json ./
RUN npm ci
# Copy shadcn UI components
COPY src/components/ui/ ./src/components/ui/
COPY src/lib/utils.ts ./src/lib/utils.ts
# Copy fixed config files
COPY next.config.ts tsconfig.json postcss.config.mjs next-env.d.ts ./
```

This image is pushed to ECR and used by CodeBuild. Contains:
- `node_modules` (~300MB) pre-installed
- All shadcn/ui components pre-installed
- Fixed config files

### CodeBuild Project

**buildspec.yml:**
```yaml
version: 0.2
phases:
  pre_build:
    commands:
      # Copy template (with node_modules) to build dir
      - cp -al /template/node_modules ./node_modules
      - cp /template/next.config.ts /template/tsconfig.json /template/postcss.config.mjs /template/next-env.d.ts ./
      - cp -r /template/src/components/ui/ ./src/components/ui/
      - cp /template/src/lib/utils.ts ./src/lib/utils.ts
      # Download AI-generated source files from S3
      - aws s3 sync s3://$BUCKET/projects/$PROJECT_ID/source/ ./
  build:
    commands:
      - npx next build
  post_build:
    commands:
      # Upload built output to S3
      - aws s3 sync ./out/ s3://$BUCKET/projects/$PROJECT_ID/build/ --delete
```

**Build time:** 2-5 minutes (including CodeBuild startup overhead).

**Trigger:** FastAPI calls `codebuild.start_build()` via boto3 after AI generates files.

**Status polling:** Frontend polls `GET /api/demos/{id}/build-status` every 3 seconds.

### S3 Structure

```
s3://brownshift-demos/
  template/                      -- base template files
  projects/
    {project-id}/
      source/                    -- AI-generated source files
        src/app/page.tsx
        src/app/layout.tsx
        ...
      build/                     -- next export output (served as preview)
        index.html
        dashboard/index.html
        _next/
        ...
```

### CloudFront for Previews

Single CloudFront distribution with:
- Origin: `brownshift-demos` S3 bucket
- Behavior: `/projects/*/build/*` → S3

Preview URL pattern: `https://{cloudfront-domain}/projects/{project-id}/build/index.html`

For deployed (public) demos: copy `build/` to a `public/` prefix and serve from a cleaner URL.

## Chat Experience

### Guided Questions

**SaaS Dashboard:**
1. "What's the primary system to demo?" → quick replies based on AI recommendations (e.g., "Patient Management", "Payroll System", "Inventory Tracker")
2. "What features should the dashboard include?" → multi-select: Analytics Charts, Data Tables, Calendar View, Reports, User Management, Settings
3. "What's the color scheme?" → color swatches: Blue (Corporate), Green (Healthcare), Purple (Education), Orange (Warm), Custom
4. "How much demo data?" → Light (few items), Medium (realistic), Heavy (stress test)

**Landing Page:**
1. "What sections should the site include?" → multi-select: Hero, Services, About, Team, Testimonials, Pricing, Contact, FAQ
2. "What's the tone?" → Professional, Modern, Friendly, Corporate, Creative
3. "Color scheme?" → same as above
4. "Include call-to-action?" → Book a Demo, Contact Us, Get Started, Custom

### Chat Messages After Generation

User can type free-form:
- "Make the sidebar darker"
- "Add a patient appointments page"
- "Change the chart colors to green"
- "Replace the stats cards with a different layout"
- "Add more demo data to the patients table"
- "The header should show the hospital's name bigger"

AI responds with what it's changing, modifies files, triggers rebuild, preview updates.

### Message Types

```jsonc
// System message (intro)
{"role": "system", "content": "Building demo for Korle Bu Teaching Hospital..."}

// Assistant with quick replies
{"role": "assistant", "content": "What system should we demo?", "metadata": {"quick_replies": ["Patient Management", "Payroll System", "Booking System"]}}

// User response
{"role": "user", "content": "Patient Management"}

// Assistant with progress
{"role": "assistant", "content": "Generating your Patient Management dashboard...", "metadata": {"status": "generating", "files_generated": 12, "total_files": 18}}

// Assistant with completion
{"role": "assistant", "content": "Demo built! Here's what I created:\n- Dashboard with patient stats\n- Patient list with search\n- Appointments calendar\n- Reports page\n- Settings", "metadata": {"status": "preview_ready"}}
```

## Demo Builder UI

### New Page: `/demos`

**Demo list page** showing all generated demos:
- Card grid: each card shows prospect name, demo type, status, preview thumbnail, created date
- "New Demo" button
- Click card → opens the demo builder

### New Page: `/demos/{id}`

**Split-view builder page:**

**Left Panel (40%) — Chat:**
- Message thread (scrollable)
- Quick-reply buttons rendered below AI messages
- Text input at bottom with send button
- File list toggle (shows generated files with line counts)
- Progress bar during generation/build

**Right Panel (60%) — Preview:**
- Top bar: preview URL display, "Refresh" button, "Open in New Tab" link, "Deploy" button (green, disabled until preview ready)
- iframe: loads the preview URL from S3/CloudFront
- Loading state: animated progress with status text ("Generating code...", "Building application...", "Almost ready...")
- After deploy: shows public URL with "Copy Link" button

### Prospect Panel Integration

Add a "Build Demo" button to the prospect detail panel (Sheet). When clicked, creates a new demo project and navigates to `/demos/{id}`.

## Deployment

### Preview → Deploy Flow

1. During build, output goes to `s3://brownshift-demos/projects/{id}/build/`
2. Preview URL points here (internal use)
3. When user clicks "Deploy":
   - Create a new S3 bucket: `brownshift-demo-{prospect-slug}` (e.g., `brownshift-demo-korle-bu-hospital`)
   - Enable static website hosting on the bucket
   - Copy `build/` contents to the new bucket
   - Return public URL: `http://brownshift-demo-korle-bu-hospital.s3-website-us-east-1.amazonaws.com`
4. Store `live_url` in demo_projects table
5. UI shows the public URL with copy button

### Re-deployment

After modifications, user can click "Re-deploy" to update the public bucket with the latest build.

## Tech Stack

- **AI:** AWS Bedrock, Claude Opus 4.6 (`us.anthropic.claude-opus-4-6-v1`)
- **Build:** AWS CodeBuild with custom Docker image (Node 22 + pre-baked node_modules)
- **Storage:** S3 (source files, build output, public deployments)
- **CDN:** CloudFront for preview serving
- **Generated apps:** Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, recharts, lucide-react

## Cost Estimate

Per demo (typical lifecycle of 1 generation + 5 modifications):
- Bedrock Opus 4.6: ~$0.30-0.50 per generation (large context), ~$0.10 per modification = ~$0.80
- CodeBuild: ~$0.01 per build x 6 builds = ~$0.06
- S3: negligible
- **Total per demo: ~$1.00**

## Out of Scope (Future)

- Real-time hot-reload (would need WebContainers or persistent dev server)
- Authentication/login flows in generated demos
- Backend/API integration in generated demos (static only)
- Collaborative editing (multiple users on same demo)
- Version history/git for generated code
- Custom domain per demo (e.g., demo.korlebu.com)
