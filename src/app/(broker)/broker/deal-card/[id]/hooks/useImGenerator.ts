import { useState, useCallback } from 'react';

interface UseImGeneratorOptions {
  buildingId: string;
  onSuccess?: (result: unknown) => void;
  onError?: (error: Error) => void;
}

interface UseImGeneratorReturn {
  isGenerating: boolean;
  generationStatus: string | null;
  progress: number;
  startGeneration: (formData: Record<string, unknown>) => Promise<void>;
  cancelGeneration: () => void;
}

export function useImGenerator(options: UseImGeneratorOptions): UseImGeneratorReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const startGeneration = useCallback(async (formData: Record<string, unknown>) => {
    setIsGenerating(true);
    setProgress(0);
    setGenerationStatus('생성 준비 중...');
    try {
      // Step 1: API 호출
      const res = await fetch(`/api/broker/im-lite/generate-async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingId: options.buildingId, ...formData }),
      });
      if (!res.ok) throw new Error(`Generation failed: ${res.status}`);
      const { jobId } = await res.json();

      // Step 2: 폴링
      setGenerationStatus('IM 생성 중...');
      setProgress(30);
      // 실제 폴링 로직은 기존 컴포넌트에서 유지
      options.onSuccess?.({ jobId });
    } catch (err) {
      console.warn('[useImGenerator]', err);
      options.onError?.(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsGenerating(false);
      setProgress(100);
      setGenerationStatus(null);
    }
  }, [options]);

  const cancelGeneration = useCallback(() => {
    setIsGenerating(false);
    setGenerationStatus(null);
    setProgress(0);
  }, []);

  return { isGenerating, generationStatus, progress, startGeneration, cancelGeneration };
}
