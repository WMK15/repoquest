import { recommendNextContribution } from "../domain/recommendation";
import type { EngineerRepositoryProfile } from "../domain/types";

export class RecommendationService {
  recommend(profile: EngineerRepositoryProfile) {
    return recommendNextContribution(profile);
  }
}
