/**
 * RAG Indexing Hygiene Gate for CREDEAL v3 (S0-T3)
 * 
 * Prevents RAG self-contamination by filtering out draft/unapproved IMs from the vector store.
 * ONLY published or broker-approved IMs can be ingested for future RAG context.
 */

export interface IMDocumentForRAG {
  id: string;
  buildingId: string;
  status: 'draft' | 'under_review' | 'approved' | 'published' | 'archived';
  isBrokerApproved: boolean;
  content: string;
  assetType?: string;
  regionCode?: string;
  archetype?: string;
}

export interface RAGHygieneResult {
  eligibleForIndexing: boolean;
  reason: string;
  sanitizedDocument?: IMDocumentForRAG;
}

/**
 * Evaluates whether an IM document is eligible for RAG vector store indexing.
 * Rule S0-T3: Draft/unapproved documents must be rejected to prevent hallucination laundering.
 */
export function evaluateRAGIndexingEligibility(doc: IMDocumentForRAG): RAGHygieneResult {
  if (doc.status === 'draft') {
    return {
      eligibleForIndexing: false,
      reason: 'RAGHygieneRejected: Draft documents cannot be indexed into RAG store.',
    };
  }

  if (doc.status === 'archived') {
    return {
      eligibleForIndexing: false,
      reason: 'RAGHygieneRejected: Archived documents are excluded from active RAG context.',
    };
  }

  if (!doc.isBrokerApproved && doc.status !== 'published') {
    return {
      eligibleForIndexing: false,
      reason: 'RAGHygieneRejected: Document must be broker-approved or explicitly published.',
    };
  }

  return {
    eligibleForIndexing: true,
    reason: 'RAGHygieneApproved: Document is broker-approved/published.',
    sanitizedDocument: doc,
  };
}
