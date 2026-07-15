import json
import boto3
import asyncio
from functools import partial


ANALYSIS_SYSTEM_PROMPT = """You are a sales intelligence analyst for Brownshift Technologies, a software development and IT consulting company based in Ghana.

Given information about a company, analyze what technology services they might need. Return JSON only.

Output format:
{
    "recommended_services": [
        {"service_name": "exact name from catalog", "relevance": "high|medium|low", "reason": "why they need this"}
    ],
    "pain_points": ["identified pain point 1", "pain point 2"],
    "confidence_score": 0-100,
    "reasoning": "overall analysis of why these services are relevant",
    "suggested_send_time": "best day/time to send outreach email based on industry (e.g. 'Tuesday 10:00 AM', 'Wednesday 2:00 PM')"
}"""

EMAIL_SYSTEM_PROMPT = """You are writing a cold outreach email on behalf of Brownshift Technologies.

About Brownshift Technologies:
- An AI-focused software development and IT consulting firm — we use AI to help businesses improve efficiency, automate repetitive tasks, reduce costs, and make smarter decisions with their data
- 6+ years of experience with operations across the US, Canada, and UK
- Team of 12 engineers who have built products for 40+ businesses — from restaurants and schools to logistics companies and healthcare providers
- Recently opened a dedicated Ghana branch with a local team so clients work with people in their timezone who understand the market
- Same international-quality engineering at local pricing — typically 3-5x more cost-effective than hiring a US/UK agency
- Our AI-powered builds typically increase client revenue by 20-35% through better customer experience and operational efficiency

SUBJECT LINE RULES:
- Write it like a real person would type to a colleague — conversational, not marketing language
- Must be a complete, natural-sounding thought — not a fragment or a vague two-word phrase
- NO question marks, NO exclamation marks, NO special characters (dashes, emojis, pipes)
- NO words that trigger spam filters: free, guaranteed, opportunity, exclusive, limited, offer, deal, discount, act now, urgent
- Do NOT put the company name in the subject — it looks automated
- Aim for 6-10 words — long enough to make sense on its own, short enough to feel casual
- It should feel like a follow-up note from someone who genuinely noticed something about their business
- Examples of GOOD subjects: "quick idea for your online bookings", "noticed something about your menu flow", "thought about your event space setup", "an idea for your checkout experience", "saw your instagram and had a thought"
- Examples of BAD subjects: "your direct booking discount" (fragment — makes no sense alone), "an idea for you" (too vague), "Helping Heritage grow!" (marketing), "Digital solution for Bistro 22" (robotic)

EMAIL BODY RULES:
- ALWAYS start the email body with exactly this line: "Hi, I'm Roger, the Chief Technology Officer at Brownshift Technologies, Ghana." — then continue naturally into the specific observation about their business
- After the introduction, open with something VERY specific about their business that shows deep research — not "I came across your business" but reference a specific menu item, a Google review theme, their Instagram post, their location advantage, a specific pain point visible from their online presence
- Be conversational but credible. Write like a CTO who's genuinely interested in their business, not a sales rep
- Connect their specific situation to ONE concrete thing you could build/fix for them — describe what it would actually do in detail (features, how it works, what changes for them day-to-day). Where relevant, mention how AI powers it — e.g. AI that predicts demand, automates responses, flags anomalies, or surfaces insights from their data
- Include a specific, credible number or result — e.g., "restaurants using online reservations see 25-40% more covers on weekdays" or "businesses with ordering apps typically see a 30% increase in repeat orders". Make it relevant to THEIR situation.
- Mention a brief credibility point — e.g., "We built something similar for a restaurant chain in Toronto" or "We've done this for 3 other businesses in Accra". Keep it to one sentence, not a brag.
- Aim for 200-250 words — detailed enough to show expertise, short enough to actually read
- No buzzwords (seamless, leverage, synergy, digital transformation, cutting-edge)
- End with a soft, specific CTA — suggest a quick WhatsApp voice note, a 10-min call, or just asking a question. Make it zero-pressure.

Always include a link to our portfolio: https://brownshift.com/projects — mention it as proof/examples, like "here's a few similar builds" or "you can see what we've done for others here".

If a demo URL is provided, this is your STRONGEST asset — lead with it. Something like "I actually mocked up what [specific thing] could look like for you — take a look: [url]". This should feel like you went out of your way for them.

Sign off with (each on its own line):
Roger Koranteng
Chief Technology Officer
Brownshift Technologies, Ghana
0547738808
roger.koranteng@brownshift.com

Return JSON only:
{
    "subject": "short, specific, catchy subject line",
    "body": "full email body in plain text"
}"""

MODEL_ID = "us.anthropic.claude-sonnet-4-6"


class AIAnalyzerService:
    def __init__(self, region: str = "us-east-1"):
        self.client = boto3.client("bedrock-runtime", region_name=region)

    def _invoke(self, system_prompt: str, user_message: str) -> dict:
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_message}],
            "max_tokens": 4096,
            "temperature": 0.3,
        })

        response = self.client.invoke_model(
            modelId=MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=body,
        )

        result = json.loads(response["body"].read())
        text = result["content"][0]["text"]
        # Strip markdown code fences if present
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]
        return json.loads(text.strip())

    async def _ainvoke(self, system_prompt: str, user_message: str) -> dict:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, partial(self._invoke, system_prompt, user_message)
        )

    async def analyze_company(
        self,
        company_name: str,
        industry: str,
        city: str,
        about_text: str | None,
        service_catalog: list[str],
    ) -> dict:
        user_message = f"""Company: {company_name}
Industry: {industry}
Location: {city}, Ghana
About: {about_text or 'No information available'}

Available services from our catalog:
{chr(10).join(f'- {s}' for s in service_catalog)}

Analyze this company and recommend which of our services they might need."""

        return await self._ainvoke(ANALYSIS_SYSTEM_PROMPT, user_message)

    async def draft_email(
        self,
        company_name: str,
        industry: str,
        recommended_services: list[str],
        reasoning: str,
        tone: str = "professional",
        demo_url: str | None = None,
        about_text: str | None = None,
        website: str | None = None,
        city: str | None = None,
        contact_name: str | None = None,
        contact_role: str | None = None,
    ) -> dict:
        demo_section = ""
        if demo_url:
            demo_section = f"\nDemo URL: {demo_url} (include this link naturally in the email as a preview we built specifically for them)\n"

        research_section = ""
        if about_text:
            research_section = f"\nWhat we found about them (from their website/online presence):\n{about_text}\n"
        if website:
            research_section += f"Their website: {website}\n"

        contact_section = ""
        if contact_name or contact_role:
            contact_section = f"\nContact we're writing to: {contact_name or 'unknown name'}{f', {contact_role}' if contact_role else ''}\n"
            contact_section += "- Address them by first name in the greeting if their name is known (e.g. 'Hi James,' instead of the generic intro line)\n"
            contact_section += "- If no name is known, use the standard intro line: 'Hi, I'm Roger, the Chief Technology Officer at Brownshift Technologies, Ghana.'\n"

        user_message = f"""Company: {company_name}
Industry: {industry}
Location: {city or 'Ghana'}
The ONE service we'd pitch them: {recommended_services[0] if recommended_services else 'custom software'}
Other relevant services (don't list these, just use for context): {', '.join(recommended_services[1:]) if len(recommended_services) > 1 else 'none'}
Why they specifically need help: {reasoning}
Tone: {tone}
{research_section}{demo_section}{contact_section}
Write a hyper-targeted cold email for this specific business. DO NOT be generic. Reference specific details from their online presence. Focus on ONE specific problem you'd solve for them. Be detailed about what you'd build — describe the features and how it would work in their day-to-day. Include a credible stat or result. Mention a relevant past project briefly."""

        return await self._ainvoke(EMAIL_SYSTEM_PROMPT, user_message)
