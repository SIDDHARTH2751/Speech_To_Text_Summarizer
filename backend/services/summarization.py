"""
services/summarization.py — Groq-powered rolling summarization.

Uses the Groq API (OpenAI-compatible) with Llama 3.1 for fast summarization.
Two functions:
  1. update_rolling_summary — merges a new transcript chunk into the running summary
  2. generate_final_summary — polishes the accumulated summary at the end

Uses httpx (already installed) to call Groq's OpenAI-compatible endpoint.
"""

import asyncio
import logging
import httpx
from config import settings

logger = logging.getLogger(__name__)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


async def _call_groq(messages: list[dict], max_tokens: int = 500) -> str:
    """
    Call the Groq chat completions API.
    Returns the assistant's response text.
    """
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.GROQ_MODEL,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": 0.3,  # Low temp for factual summarization
            },
        )

        if response.status_code != 200:
            raise RuntimeError(f"Groq API error {response.status_code}: {response.text[:200]}")

        data = response.json()
        return data["choices"][0]["message"]["content"].strip()


async def update_rolling_summary(current_summary: str, new_text: str) -> str:
    """
    Merge a new transcript chunk into the existing rolling summary.
    If current_summary is empty (first chunk), creates an initial summary.
    """
    if not new_text.strip():
        return current_summary

    if not current_summary:
        messages = [
            {
                "role": "system",
                "content": "You are summarizing an audio transcript received in chunks. Create a concise summary of the key points.",
            },
            {
                "role": "user",
                "content": f"Here is the first chunk of transcript. Summarize the key points:\n\n{new_text}",
            },
        ]
    else:
        messages = [
            {
                "role": "system",
                "content": "You are summarizing an audio transcript received in chunks. Update the existing summary with new information. Keep it concise. Do NOT repeat yourself.",
            },
            {
                "role": "user",
                "content": f"CURRENT SUMMARY:\n{current_summary}\n\nNEW TRANSCRIPT CHUNK:\n{new_text}\n\nProvide the updated summary:",
            },
        ]

    try:
        result = await _call_groq(messages, max_tokens=500)
        logger.info(f"Rolling summary updated ({len(result)} chars)")
        return result
    except Exception as e:
        logger.error(f"Groq rolling summary failed: {e}")
        # On failure, keep the old summary — don't crash the whole pipeline
        return current_summary


async def generate_final_summary(rolling_summary: str, full_transcript: str) -> str:
    """
    Polish the rolling summary into a clean final summary.
    Takes both the rolling summary and full transcript for accuracy.
    """
    if not rolling_summary and not full_transcript:
        return "No content to summarize."

    messages = [
        {
            "role": "system",
            "content": "You produce polished, well-structured summaries of audio transcripts.",
        },
        {
            "role": "user",
            "content": (
                "Given the rolling summary and full transcript below, produce a final summary with:\n"
                "- A 1-2 sentence overview at the top\n"
                "- Bullet points for key topics/decisions/action items\n"
                "- Keep it concise (max 300 words)\n\n"
                f"ROLLING SUMMARY:\n{rolling_summary or '(none)'}\n\n"
                f"FULL TRANSCRIPT:\n{full_transcript[:6000]}\n\n"
                "FINAL SUMMARY:"
            ),
        },
    ]

    result = await _call_groq(messages, max_tokens=800)
    logger.info(f"Final summary generated ({len(result)} chars)")
    return result
