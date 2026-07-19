import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface DraftBlock {
  id: string;
  type: 'news' | 'deal' | 'briefing' | 'custom';
  data: Record<string, any>;
  addedAt: string;
}

export interface UseMagazineDraftReturn {
  editionId: string | null;
  blocks: DraftBlock[];
  addContentBlock: (type: DraftBlock['type'], data: Record<string, any>) => void;
  removeBlock: (blockId: string) => void;
  blockCount: number;
  isDirty: boolean;
  lastSavedAt: Date | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  forceSave: () => Promise<void>;
  isLoading: boolean;
}

/**
 * Shared hook for persisting draft blocks across the intelligence dashboard and magazine editor.
 * Uses a singleton-like pattern with event listeners for cross-component sync without a complex store.
 */
export function useMagazineDraft(brokerSlug?: string): UseMagazineDraftReturn {
  const [editionId, setEditionId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<DraftBlock[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const supabase = createClient();
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load the current draft on mount
  useEffect(() => {
    async function loadDraft() {
      setIsLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        let slugToUse = brokerSlug;
        if (!slugToUse) {
          const { data: profile } = await supabase
            .from('broker_profiles')
            .select('slug')
            .eq('user_id', user.id)
            .single();
          slugToUse = profile?.slug || 'demo';
        }

        // Find the latest weekly draft
        const res = await fetch(`/api/magazine/editions?broker_id=${slugToUse}&type=weekly&limit=1`);
        if (res.ok) {
          const json = await res.json();
          if (json.editions && json.editions.length > 0) {
            const ed = json.editions[0];
            setEditionId(ed.id);
            if (ed.content && ed.content.draft_blocks) {
              setBlocks(ed.content.draft_blocks);
            }
          }
        }
      } catch (e) {
        console.error('Failed to load magazine draft', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadDraft();
  }, [brokerSlug]);

  const addContentBlock = useCallback((type: DraftBlock['type'], data: Record<string, any>) => {
    setBlocks(prev => {
      // Prevent duplicates based on some identifier in data if possible
      if (data.id && prev.some(b => b.data.id === data.id)) {
        return prev;
      }
      
      const newBlock: DraftBlock = {
        id: crypto.randomUUID(),
        type,
        data,
        addedAt: new Date().toISOString()
      };
      setIsDirty(true);
      return [...prev, newBlock];
    });
  }, []);

  const removeBlock = useCallback((blockId: string) => {
    setBlocks(prev => {
      setIsDirty(true);
      return prev.filter(b => b.id !== blockId);
    });
  }, []);

  const saveToDb = useCallback(async (currentBlocks: DraftBlock[]) => {
    if (!editionId) return;
    
    setSaveStatus('saving');
    try {
      const { data: currentEd } = await supabase
        .from('magazine_editions')
        .select('content')
        .eq('id', editionId)
        .single();
        
      const updatedContent = {
        ...(currentEd?.content || {}),
        draft_blocks: currentBlocks
      };

      const { error } = await supabase
        .from('magazine_editions')
        .update({ content: updatedContent })
        .eq('id', editionId);

      if (error) throw error;

      setSaveStatus('saved');
      setLastSavedAt(new Date());
      setIsDirty(false);
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (e) {
      console.error('Auto-save failed', e);
      setSaveStatus('error');
    }
  }, [editionId, supabase]);

  // Debounced auto-save
  useEffect(() => {
    if (!isDirty || !editionId) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      saveToDb(blocks);
    }, 5000);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [blocks, isDirty, editionId, saveToDb]);

  const forceSave = async () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    await saveToDb(blocks);
  };

  return {
    editionId,
    blocks,
    addContentBlock,
    removeBlock,
    blockCount: blocks.length,
    isDirty,
    lastSavedAt,
    saveStatus,
    forceSave,
    isLoading
  };
}
