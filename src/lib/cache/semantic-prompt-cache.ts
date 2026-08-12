/**
 * src/lib/cache/semantic-prompt-cache.ts
 * 
 * Redis / Memcached를 모사한 시맨틱 프롬프트 인메모리 캐시 시스템.
 * 동일한 자산, 동일한 컨텍스트(건축물대장 + 시세)가 입력되었을 때
 * LLM 호출을 생략하고 캐시된 응답을 반환하여 비용 절감 및 지연 시간 단축.
 */

import { createHash } from "crypto";
import { LRUCache } from "lru-cache";

interface CacheEntry {
  response: string;
}

class SemanticPromptCache {
  private cache = new LRUCache<string, CacheEntry>({
    max: 500,
    ttl: 3600 * 1000,
  });

  private metrics = { hits: 0, misses: 0, sets: 0 };

  /**
   * 프롬프트의 입력 데이터를 기반으로 SHA-256 해시를 생성하여 캐시 키로 사용합니다.
   */
  generateKey(sectionType: string, inputData: Record<string, any>): string {
    const sortedData = JSON.stringify(inputData, Object.keys(inputData).sort());
    const hash = createHash("sha256").update(`${sectionType}:${sortedData}`).digest("hex");
    return `im_prompt_cache:${sectionType}:${hash}`;
  }

  /**
   * 캐시에서 프롬프트 생성 결과를 조회합니다.
   */
  async get(key: string): Promise<string | null> {
    const entry = this.cache.get(key);
    if (!entry) {
      this.metrics.misses++;
      return null;
    }
    
    this.metrics.hits++;
    console.info(`[Cache] Hit for key: ${key}`);
    return entry.response;
  }

  /**
   * 프롬프트 생성 결과를 캐시에 저장합니다.
   */
  async set(key: string, response: string, ttlSeconds: number = 3600): Promise<void> {
    this.metrics.sets++;
    this.cache.set(key, { response }, { ttl: ttlSeconds * 1000 });
    console.info(`[Cache] Set for key: ${key}`);
  }

  /**
   * 특정 패턴(예: sectionType)을 포함하는 캐시를 무효화합니다.
   */
  async invalidateBySection(sectionType: string): Promise<void> {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(`:${sectionType}:`)) {
        this.cache.delete(key);
        count++;
      }
    }
    console.info(`[Cache] Invalidated ${count} entries for section: ${sectionType}`);
  }

  getMetrics() {
    return {
      ...this.metrics,
      hitRate: this.metrics.hits / (this.metrics.hits + this.metrics.misses) || 0,
      size: this.cache.size,
    };
  }
}

export const promptCache = new SemanticPromptCache();
