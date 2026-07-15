import json
import re
import boto3
from functools import partial
import asyncio

MODEL_ID = "us.anthropic.claude-sonnet-4-6"

SYSTEM_PROMPT = """You are an expert Next.js developer building FULLY INTERACTIVE, production-quality web applications as sales demos for Brownshift Technologies, a software company in Ghana.

This demo will be shown to a real client to win their business. It must look AND work like a real application — not a mockup. Every button, link, tab, and interaction must work.

You output files in XML format. Each file must contain COMPLETE contents — never partial or diff.

<file path="src/app/page.tsx">
complete file contents here
</file>

Technology stack (all pre-installed, just import and use):
- Next.js 16 App Router with TypeScript
- Tailwind CSS 4 for styling
- shadcn/ui components: Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Tabs, TabsList, TabsTrigger, TabsContent, Input, Select, Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Separator, Progress, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Tooltip, Popover, Skeleton
- recharts for charts: AreaChart, BarChart, LineChart, PieChart, Area, Bar, Line, Pie, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, Legend, Cell
- lucide-react for icons (any icon available)
- Import shadcn components from "@/components/ui/[component]"
- Import cn from "@/lib/utils"

CRITICAL Rules — Files:
- DO NOT generate any files under src/components/ui/ — shadcn components are PRE-INSTALLED
- DO NOT generate src/lib/utils.ts — it is PRE-INSTALLED
- DO NOT generate next.config.ts, tsconfig.json, postcss.config.mjs, package.json — PRE-INSTALLED
- ONLY generate: src/app/ pages, src/components/ (custom components, NOT ui/), src/lib/data.ts, src/app/globals.css, src/app/layout.tsx
- globals.css MUST be exactly this and nothing else:
```
@import "tailwindcss";
```
Do NOT add @theme, @layer, CSS custom properties, or any other CSS. All styling is done via Tailwind classes and inline styles.

CRITICAL Rules — Avoiding Blank Pages / Rendering Issues:
- NEVER use "use client" with complex useEffect patterns that gate rendering (no `if (!mounted) return null`)
- NEVER use useState for a "mounted" or "loading" gate — the page should render immediately
- Use inline `style={{}}` for layout dimensions (sidebar width, margin-left) — NOT Tailwind arbitrary values like ml-[260px] which may not compile
- ALL page components must be "use client" and render content immediately — no conditional loading screens
- For recharts: use dynamic imports: `const Chart = dynamic(() => import('../components/MyChart'), { ssr: false })`
- Create a separate component file for each chart, then dynamic-import it in the page
- data.ts must use LAZY initialization: export functions that return data, NOT top-level arrays of 200+ items. Example: `export function getOrders() { return [...] }` — call it inside the component
- Keep data.ts under 150 records total to avoid memory issues
- For sidebar layout: use a simple flex layout with fixed sidebar div and flex-1 main content — no context providers, no collapse state on first render

CRITICAL Rules — Interactivity (THIS IS THE MOST IMPORTANT PART):
- EVERY button must DO something — open a dialog, toggle state, filter data, sort a table, navigate somewhere
- EVERY navigation link must work — use Next.js Link component, all pages must exist
- Tables must be SORTABLE — clicking column headers should sort data. Use useState for sort state
- Tables must be SEARCHABLE — include a search input that filters rows in real-time
- Tables must have PAGINATION — show 10 rows per page with page controls
- Forms must be INTERACTIVE — inputs should be controlled with useState, show validation states
- Dialogs/Modals must OPEN and CLOSE — "Add New" buttons open a form dialog, "Cancel" closes it
- Tabs must SWITCH content — use shadcn Tabs component properly
- Sidebar navigation must highlight the ACTIVE page — use usePathname()
- Charts must have TOOLTIPS that show data on hover
- Status badges should be FILTERABLE — click to filter by status
- Include a SEARCH bar in the header or sidebar that filters across the app
- Dropdown menus must open and show real options (Edit, Delete, View, etc.)
- "Delete" actions should remove the item from the displayed list (useState)
- "Add" actions should add to the displayed list via a form dialog
- Include LOADING STATES — use Skeleton components for initial load simulation
- Include TOAST/NOTIFICATION feedback for actions (use a simple state-based notification)

CRITICAL Rules — Data & Content:
- Create a comprehensive data.ts file with 50-200 realistic records using REAL Ghanaian names, places, and currency (GHS)
- Include dates spanning the last 6 months for realistic timeline data
- Include status distributions (Active, Pending, Completed, Cancelled etc.)
- Chart data should tell a story — show growth trends, seasonal patterns
- Financial data should use realistic Ghanaian amounts
- Phone numbers should use Ghanaian format (+233...)
- Include at least 3 different data entities (e.g., patients, appointments, invoices)

CRITICAL Rules — Design:
- Build a PRODUCTION-QUALITY application — this goes to a real client
- Use a consistent, professional color scheme throughout
- Include proper spacing, padding, and typography hierarchy
- Sidebar should be professional with company logo/name, navigation sections, user info at bottom
- Dashboard should have KPI cards at top, charts in middle, recent activity/table at bottom
- Every page needs a proper header with breadcrumbs, title, and action buttons
- Use subtle shadows, borders, and hover effects for depth
- Responsive — should look good at different widths
- Generate 15-25 files for a SaaS dashboard, 8-12 for a landing page
- All pages must work as static exports (no API routes, no server actions)
- Code MUST pass TypeScript type-checking. Common issues to avoid:
  - recharts Tooltip formatter: cast to `any` — e.g. `formatter={((v: number) => [`GHS ${v}`, '']) as any}`
  - Don't use `as const` on arrays passed to components expecting mutable types
  - Always type event handlers explicitly when needed
  - Use `React.ReactNode` for children props, not `JSX.Element`
"""

GUIDED_QUESTIONS = {
    "saas_dashboard": [
        {
            "question": "Here's what I'm thinking based on our research on this company. Does this sound right, or would you change anything?",
            "type": "open",
            "derive_from": "ai_summary",
            "options": ["Looks good, go with it", "I have some changes"],
        },
        {
            "question": "What color scheme fits this prospect?",
            "type": "single_select",
            "options": ["Blue (Corporate)", "Green (Healthcare)", "Purple (Education)", "Orange (Warm)", "Teal (Modern)", "Red (Bold)", "Navy (Professional)", "Indigo (Tech)"],
        },
        {
            "question": "What design style do you want?",
            "type": "single_select",
            "options": ["Clean & Minimal (lots of whitespace)", "Data-dense (packed with information)", "Modern with gradients and shadows", "Enterprise/Corporate (formal)", "Friendly & Colorful (approachable)"],
        },
        {
            "question": "Any specific features or requirements you want to highlight?",
            "type": "open",
            "options": ["No, just build it", "Yes, I have specifics"],
        },
    ],
    "landing_page": [
        {
            "question": "Here's what I'm thinking for the landing page based on our research. Does this sound right, or would you change anything?",
            "type": "open",
            "derive_from": "ai_summary",
            "options": ["Looks good, go with it", "I have some changes"],
        },
        {
            "question": "What's the tone of the site?",
            "type": "single_select",
            "options": ["Professional & Corporate", "Modern & Sleek", "Friendly & Approachable", "Bold & Creative", "Luxury & Premium", "Tech & Innovative"],
        },
        {
            "question": "Color scheme?",
            "type": "single_select",
            "options": ["Blue (Corporate)", "Green (Healthcare)", "Purple (Education)", "Orange (Warm)", "Teal (Modern)", "Red (Bold)", "Navy (Professional)", "Indigo (Tech)"],
        },
        {
            "question": "Any specific features or requirements you want to highlight?",
            "type": "open",
            "options": ["No, just build it", "Yes, I have specifics"],
        },
    ],
}


class DemoGeneratorService:
    def __init__(self, region: str = "us-east-1"):
        from botocore.config import Config
        self.client = boto3.client(
            "bedrock-runtime",
            region_name=region,
            config=Config(read_timeout=600, connect_timeout=10, retries={"max_attempts": 1}),
        )

    def _invoke(self, system_prompt: str, messages: list[dict]) -> str:
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "system": system_prompt,
            "messages": messages,
            "max_tokens": 64000,
            "temperature": 0.3,
        })

        response = self.client.invoke_model(
            modelId=MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=body,
        )

        result = json.loads(response["body"].read())
        return result["content"][0]["text"]

    async def _ainvoke(self, system_prompt: str, messages: list[dict]) -> str:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, partial(self._invoke, system_prompt, messages)
        )

    async def _ainvoke_raw(self, system_prompt: str, messages: list[dict]) -> str:
        return await self._ainvoke(system_prompt, messages)

    def parse_files(self, ai_response: str) -> dict[str, str]:
        """Parse AI response XML into {file_path: content} dict."""
        files = {}
        pattern = r'<file\s+path="([^"]+)"(?:\s+action="[^"]*")?>(.*?)</file>'
        matches = re.findall(pattern, ai_response, re.DOTALL)
        for path, content in matches:
            files[path.strip()] = content.strip()
        return files

    def get_guided_questions(self, demo_type: str) -> list[dict]:
        return GUIDED_QUESTIONS.get(demo_type, [])

    def build_generation_prompt(
        self,
        prospect_name: str,
        prospect_industry: str,
        prospect_region: str,
        demo_type: str,
        config: dict,
        about_text: str | None = None,
        recommended_services: list | None = None,
        pain_points: list | None = None,
    ) -> str:
        prompt = f"""Build a complete {demo_type.replace('_', ' ')} for:

Company: {prospect_name}
Industry: {prospect_industry}
Location: {prospect_region}, Ghana
About: {about_text or 'No additional info'}

"""
        if recommended_services:
            prompt += "Services we recommend for them:\n"
            for s in recommended_services:
                if isinstance(s, dict):
                    prompt += f"- {s.get('service_name', s)}: {s.get('reason', '')}\n"
                else:
                    prompt += f"- {s}\n"

        if pain_points:
            prompt += "\nTheir pain points:\n"
            for p in pain_points:
                prompt += f"- {p}\n"

        prompt += "\nUser configuration:\n"
        for key, value in config.items():
            prompt += f"- {key}: {value}\n"

        if demo_type == "saas_dashboard":
            prompt += """
Generate a complete multi-page SaaS dashboard application with:
- A professional sidebar with the company name and navigation
- A main dashboard page with stats cards, charts, and recent activity
- 3-5 feature pages based on the recommended services
- A reports/analytics page
- A settings page
- Realistic demo data throughout (use industry-appropriate names and numbers)
- Working navigation between all pages
- Consistent branding and color scheme

Generate ALL files needed. Use the file XML format."""
        else:
            prompt += """
Generate a complete landing page website with:
- Professional header with navigation
- Compelling hero section
- All requested sections with real content
- Professional footer
- Responsive design
- Consistent branding

Generate ALL files needed. Use the file XML format."""

        return prompt

    def build_modification_prompt(
        self,
        current_files: dict[str, str],
        user_request: str,
    ) -> str:
        prompt = "Current project files:\n\n"
        for path, content in current_files.items():
            prompt += f'[File: {path}]\n```\n{content}\n```\n\n'
        prompt += f"\nUser request: {user_request}\n\n"
        prompt += """IMPORTANT MODIFICATION RULES:
- Modify ONLY the files that need to change. Return complete file contents for each changed file using the <file> XML format.
- Do NOT return files that don't need changes.
- Do NOT regenerate globals.css unless explicitly asked about styling — the template version works correctly.
- Do NOT add "mounted" state guards or loading gates — pages must render content immediately.
- Do NOT change the sidebar/layout structure unless specifically asked — it's working.
- If fixing a blank page: the issue is usually (1) a mounted/loading gate preventing render, (2) CSS breaking the layout, or (3) an import error. Fix the actual cause, don't rebuild everything.
- Keep using inline style={{}} for layout dimensions.
- Before outputting files, briefly explain what you're changing and why (1-2 sentences)."""
        return prompt

    async def generate_demo(
        self,
        prospect_name: str,
        prospect_industry: str,
        prospect_region: str,
        demo_type: str,
        config: dict,
        about_text: str | None = None,
        recommended_services: list | None = None,
        pain_points: list | None = None,
    ) -> dict[str, str]:
        user_prompt = self.build_generation_prompt(
            prospect_name, prospect_industry, prospect_region,
            demo_type, config, about_text, recommended_services, pain_points,
        )
        response = await self._ainvoke(SYSTEM_PROMPT, [{"role": "user", "content": user_prompt}])
        return self.parse_files(response)

    async def modify_demo(
        self,
        current_files: dict[str, str],
        conversation_history: list[dict],
        user_request: str,
    ) -> tuple[dict[str, str], str]:
        """Returns (modified_files, ai_explanation)."""
        messages = list(conversation_history)
        modification_prompt = self.build_modification_prompt(current_files, user_request)
        messages.append({"role": "user", "content": modification_prompt})
        response = await self._ainvoke(SYSTEM_PROMPT, messages)
        files = self.parse_files(response)

        # Extract explanation text (everything before the first <file> tag)
        explanation = response.split("<file")[0].strip() if "<file" in response else response.strip()
        # Clean up any trailing whitespace or empty lines
        explanation = "\n".join(line for line in explanation.split("\n") if line.strip())[:500]

        return files, explanation
