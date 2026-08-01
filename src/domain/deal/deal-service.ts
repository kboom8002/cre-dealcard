import { DealStage, validateTransition, TransitionResult } from './deal-transition';

export interface Deal {
  id: string;
  stage: DealStage;
  updatedAt: string;
}

export class DealService {
  /**
   * Attempts to transition a deal to a new stage.
   * In a real application, this would update a database.
   */
  public async transitionDealStage(deal: Deal, toStage: DealStage, triggeredBy: string): Promise<TransitionResult & { deal?: Deal }> {
    const result = validateTransition(deal.stage, toStage);
    
    if (result.allowed) {
      // Mocking DB update
      deal.stage = toStage;
      deal.updatedAt = new Date().toISOString();
      return { ...result, deal };
    }
    
    return result;
  }
}

export const dealService = new DealService();
