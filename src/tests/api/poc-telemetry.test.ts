import { describe, test, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as postSurvey, GET as getSurveys } from '@/app/api/public/surveys/route';
import { POST as postEvent } from '@/app/api/public/events/route';
import { POST as postSentimentPoll, GET as getSentimentPoll } from '@/app/api/public/sentiment-poll/route';

// Mock Supabase
vi.mock('@/lib/supabase/service', () => {
  return {
    createServiceClient: () => {
      return {
        from: (table: string) => {
          return {
            insert: (row: any) => {
              return {
                select: () => {
                  return {
                    single: () => Promise.resolve({ data: { id: 'mocked-id', ...row }, error: null })
                  };
                }
              };
            },
            select: () => {
              return {
                order: () => {
                  if (table === 'market_sentiment_polls') {
                    return Promise.resolve({
                      data: [
                        { score: 80, sentiment: 'bullish' },
                        { score: 50, sentiment: 'neutral' }
                      ],
                      error: null
                    });
                  }
                  return Promise.resolve({ data: [{ step_index: 1, answers: {} }], error: null });
                }
              };
            }
          };
        }
      };
    }
  };
});

describe('PoC Telemetry & G1/G2/G7 API Routes', () => {
  test('POST /api/public/surveys - saves user survey response', async () => {
    const req = new NextRequest('http://localhost:3000/api/public/surveys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'test-user-id',
        stepIndex: 1,
        answers: { preferredType: '꼬마빌딩' }
      })
    });

    const res = await postSurvey(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.answers.preferredType).toBe('꼬마빌딩');
  });

  test('POST /api/public/events (share_event) - records share event telemetry', async () => {
    const req = new NextRequest('http://localhost:3000/api/public/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'share_event',
        shareId: 'test-share-id',
        eventType: 'view',
        metadata: { duration: 15 }
      })
    });

    const res = await postEvent(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  test('POST & GET /api/public/sentiment-poll - aggregates sentiment index', async () => {
    // 1. Post sentiment
    const postReq = new NextRequest('http://localhost:3000/api/public/sentiment-poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brokerId: 'test-broker-id',
        score: 90,
        sentiment: 'bullish',
        comment: '시장 호조'
      })
    });

    const postRes = await postSentimentPoll(postReq);
    const postData = await postRes.json();
    expect(postRes.status).toBe(200);
    expect(postData.success).toBe(true);

    // 2. Get aggregate
    const getReq = new NextRequest('http://localhost:3000/api/public/sentiment-poll', {
      method: 'GET'
    });

    const getRes = await getSentimentPoll(getReq);
    const getData = await getRes.json();
    expect(getRes.status).toBe(200);
    expect(getData.index).toBe(65); // Average of 80 and 50 is 65
    expect(getData.bullishPct).toBe(50);
  });
});
