import { NextResponse } from 'next/server';
import { db } from '@/configs/db';
import { doubtsTable } from '@/configs/schema';
import { and, eq, desc, isNull } from 'drizzle-orm';
import { redisClient } from '@/lib/ratelimit/ratelimit';
import crypto from "node:crypto";
import { groq } from '@/lib/ai/groq-client';
import { buildErrorResponse } from '@/lib/errors/error-handler';
import {
    parseClassroomId,
    requireAuth,
    requireMembership,
} from '@/lib/auth/membership-guard';

const CACHE_PREFIX = "personal-analytics";
const CACHE_TTL_SECONDS = 60 * 60;

interface PersonalAnalyticsResult {
    "weakTopics": {
        "topic": string;
        "reason": string;
        "confidence": "High" | "Medium" | "Low";
    }[];
    "insight": string;
    "recommendations": {
        "practiceQuestions": string[];
        "conceptExplainer": string;
    }
}

interface AnalyticsResponse extends PersonalAnalyticsResult {
    "isEngaged": boolean;
}

export async function GET(req: Request) {
    try {
        const { email } = await requireAuth();
        const { searchParams } = new URL(req.url);
        const classroomIdStr = searchParams.get("classroomId");
        if (!classroomIdStr) {
            return NextResponse.json({ error: "Classroom ID required" }, { status: 400 });
        }
        const classroomId = parseClassroomId(classroomIdStr);
        await requireMembership(email, classroomId);

        // Fetch user's doubts in this classroom
        const userDoubts = await db.select({
            content: doubtsTable.content,
            subject: doubtsTable.subject,
            createdAt: doubtsTable.createdAt
        })
        .from(doubtsTable)
        .where(
            and(
                eq(doubtsTable.classroomId, classroomId),
                eq(doubtsTable.userEmail, email),
                isNull(doubtsTable.deletedAt)
            )
        )
        .orderBy(desc(doubtsTable.createdAt));

        if (userDoubts.length < 2) {
            return NextResponse.json({ 
                isEngaged: false,
                message: "Ask at least 2-3 doubts to unlock personalized AI Weak Topic Detection! Your AI mentor needs a bit more data to identify patterns in your learning.",
                weakTopics: [],
                recommendations: []
            });
        }

        // Prepare doubt summaries for AI analysis
        const doubtContext = userDoubts.map((d: any) => `- [${d.subject}]: ${d.content}`).join('\n');

        const stateHash = crypto
            .createHash("sha256")
            .update(doubtContext)
            .digest("hex");

        // Generate a cache key based on the current state of the user's doubts.
        const cacheKey = `${CACHE_PREFIX}:${email}:${classroomIdStr}:${stateHash}`;

        try {
            // Cache-aside lookup: reuse previously generated analytics if user's doubts have not changed.
            const cachedResponse = await redisClient.get<AnalyticsResponse>(cacheKey);

            if (cachedResponse) {
                return NextResponse.json(cachedResponse);
            }

        } catch (error) {
            console.error("Personal Analytics Redis Cache GET Error:", error);
        }

        const systemPrompt = `You are an AI Learning Mentor. Analyze the student's academic doubts across their classroom activities.
        Your goal is to identify patterns, recurring sub-topics they struggle with, and provide actionable recommendations.
        
        Strictly return a JSON object with:
        {
            "weakTopics": [
                { "topic": "Name (e.g. Recursion)", "reason": "Why it's a weak topic", "confidence": "High/Medium" }
            ],
            "insight": "A general summary of their learning status (max 2 sentences)",
            "recommendations": {
                "practiceQuestions": ["Question 1", "Question 2"],
                "conceptExplainer": "A short, crystal-clear explanation (max 3 sentences) for their most critical weak topic."
            }
        }`;

        const response = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Analyze these doubts asked by the student in this classroom:\n\n${doubtContext}` }
            ],
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" }
        });

        const result: PersonalAnalyticsResult = JSON.parse(response.choices[0].message.content || "{}");

        const analyticsResponse: AnalyticsResponse = {
            isEngaged: true,
            ...result
        };

        try {
            await redisClient.set(cacheKey, analyticsResponse, {ex: CACHE_TTL_SECONDS});

        } catch (error) {
            console.error("Personal Analytics Redis Cache SET Error:", error);
        }

        return NextResponse.json(analyticsResponse);

    } catch (error: unknown) {
        const { status, body } = buildErrorResponse(error);
        if (status < 500) {
            return NextResponse.json(body, { status });
        }

        console.error("Personal Analytics Error:", error);
        return NextResponse.json({ error: "Failed to generate personal insights" }, { status: 500 });
    }
}
