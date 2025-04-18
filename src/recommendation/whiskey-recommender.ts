// @ts-ignore
import natural from 'natural';
import { Matrix } from 'ml-matrix';
// @ts-ignore
import mlKnn from 'ml-knn';

interface WhiskeyProfile {
  id: number;
  name: string;
  brand: string;
  spirit_type: string;
  proof: number;
  avg_msrp: number;
  tasting_notes?: string[];
  region?: string;
  age?: number;
  rating?: number;
  reasoning?: string;
}

interface UserProfile {
  userId: string;
  preferences: {
    spiritTypes: Map<string, number>;
    priceRange: { min: number; max: number; avg: number };
    proofRange: { min: number; max: number; avg: number };
    favoriteBrands: Map<string, number>;
  };
  ratings: Map<number, number>; // whiskeyId -> rating
}

export class WhiskeyRecommender {
  private tfidf: any;
  private whiskeyProfiles: WhiskeyProfile[];
  private userProfiles: Map<string, UserProfile>;
  private knnModel: any;

  constructor(whiskeyProfiles: WhiskeyProfile[]) {
    this.whiskeyProfiles = whiskeyProfiles;
    this.userProfiles = new Map();
    this.tfidf = new natural.TfIdf();
    this.initializeTfIdf();
  }

  private initializeTfIdf() {
    // Add whiskey profiles to TF-IDF
    this.whiskeyProfiles.forEach(whiskey => {
      const document = [
        whiskey.name,
        whiskey.brand,
        whiskey.spirit_type,
        whiskey.tasting_notes?.join(' ') || '',
        whiskey.region || ''
      ].join(' ');
      this.tfidf.addDocument(document);
    });
  }

  public updateUserProfile(userId: string, bottles: any[], ratings: Map<number, number>) {
    const spiritTypes = new Map<string, number>();
    const favoriteBrands = new Map<string, number>();
    let minPrice = Number.MAX_VALUE;
    let maxPrice = 0;
    let totalPrice = 0;
    let minProof = Number.MAX_VALUE;
    let maxProof = 0;
    let totalProof = 0;
    let bottleCount = 0;

    bottles.forEach(bottle => {
      const product = bottle.product;
      
      // Update spirit type preferences
      spiritTypes.set(product.spirit, (spiritTypes.get(product.spirit) || 0) + 1);
      
      // Update brand preferences
      favoriteBrands.set(product.brand, (favoriteBrands.get(product.brand) || 0) + 1);
      
      // Update price range
      if (product.average_msrp) {
        minPrice = Math.min(minPrice, product.average_msrp);
        maxPrice = Math.max(maxPrice, product.average_msrp);
        totalPrice += product.average_msrp;
        bottleCount++;
      }
      
      // Update proof range
      if (product.proof) {
        minProof = Math.min(minProof, product.proof);
        maxProof = Math.max(maxProof, product.proof);
        totalProof += product.proof;
      }
    });

    const avgPrice = bottleCount > 0 ? totalPrice / bottleCount : 0;
    const avgProof = bottles.length > 0 ? totalProof / bottles.length : 0;

    this.userProfiles.set(userId, {
      userId,
      preferences: {
        spiritTypes,
        priceRange: { min: minPrice, max: maxPrice, avg: avgPrice },
        proofRange: { min: minProof, max: maxProof, avg: avgProof },
        favoriteBrands
      },
      ratings
    });

    // After updating user profile, train KNN if we have enough users
    this.trainKNN();
  }

  private calculateContentSimilarity(whiskey1: WhiskeyProfile, whiskey2: WhiskeyProfile): number {
    // Find the indices of the whiskeys in our database
    const index1 = this.whiskeyProfiles.findIndex(w => w.id === whiskey1.id);
    const index2 = this.whiskeyProfiles.findIndex(w => w.id === whiskey2.id);

    if (index1 === -1 || index2 === -1) {
      return 0; // Return 0 similarity if either whiskey is not found
    }

    // Get the document text for both whiskeys
    const doc1 = [
      whiskey1.name,
      whiskey1.brand,
      whiskey1.spirit_type,
      whiskey1.tasting_notes?.join(' ') || '',
      whiskey1.region || ''
    ].join(' ');

    const doc2 = [
      whiskey2.name,
      whiskey2.brand,
      whiskey2.spirit_type,
      whiskey2.tasting_notes?.join(' ') || '',
      whiskey2.region || ''
    ].join(' ');

    // Calculate similarity by comparing terms
    let similarity = 0;
    const terms = doc2.split(' ');
    terms.forEach(term => {
      similarity += this.tfidf.tfidf(term, index1);
    });

    return similarity / terms.length; // Normalize by number of terms
  }

  private normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude === 0 ? vector : vector.map(val => val / magnitude);
  }

  private createFeatureVector(profile: UserProfile): number[] {
    const vector: number[] = [];
    
    // Add spirit type preferences
    const spiritTypes = Array.from(profile.preferences.spiritTypes.values());
    vector.push(...spiritTypes);
    
    // Add price range features
    vector.push(
      profile.preferences.priceRange.min,
      profile.preferences.priceRange.max,
      profile.preferences.priceRange.avg
    );
    
    // Add proof range features
    vector.push(
      profile.preferences.proofRange.min,
      profile.preferences.proofRange.max,
      profile.preferences.proofRange.avg
    );
    
    // Add brand preferences
    const brandPrefs = Array.from(profile.preferences.favoriteBrands.values());
    vector.push(...brandPrefs);
    
    // Normalize the vector
    return this.normalizeVector(vector);
  }

  private trainKNN() {
    if (this.userProfiles.size < 2) return;

    // Create feature matrix for KNN using ml-matrix
    const features: number[][] = [];
    const labels: number[] = [];

    this.userProfiles.forEach((profile, userId) => {
      const featureVector = this.createFeatureVector(profile);
      features.push(featureVector);
      labels.push(parseInt(userId));
    });

    // Convert features to ml-matrix for KNN training
    const featureMatrix = new Matrix(features);
    this.knnModel = new mlKnn.KNN(featureMatrix, labels, { k: 3 });
  }

  public getRecommendations(userId: string, count: number = 3): WhiskeyProfile[] {
    const userProfile = this.userProfiles.get(userId);
    if (!userProfile) return [];

    // Get similar users if KNN is trained
    let similarUsers: string[] = [];
    if (this.knnModel) {
      const userVector = this.createFeatureVector(userProfile);
      const userMatrix = new Matrix([userVector]);
      similarUsers = this.knnModel.predict(userMatrix);
    }

    // Calculate scores for each whiskey
    const scores = new Map<number, number>();
    
    this.whiskeyProfiles.forEach(whiskey => {
      let score = 0;
      
      // Content-based scoring
      const spiritPref = userProfile.preferences.spiritTypes.get(whiskey.spirit_type) || 0;
      const brandPref = userProfile.preferences.favoriteBrands.get(whiskey.brand) || 0;
      
      // Price range scoring
      const priceScore = this.calculatePriceScore(whiskey.avg_msrp, userProfile.preferences.priceRange);
      
      // Proof range scoring
      const proofScore = this.calculateProofScore(whiskey.proof, userProfile.preferences.proofRange);
      
      // Collaborative filtering score
      const collabScore = this.calculateCollaborativeScore(whiskey.id, similarUsers);
      
      // Content similarity score
      const contentScore = this.calculateContentSimilarityScore(whiskey, userProfile);
      
      // Combine scores with weights
      score = (
        spiritPref * 0.2 +
        brandPref * 0.15 +
        priceScore * 0.2 +
        proofScore * 0.15 +
        collabScore * 0.15 +
        contentScore * 0.15
      );
      
      scores.set(whiskey.id, score);
    });

    // Sort by score and return top recommendations
    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([id]) => {
        const whiskey = this.whiskeyProfiles.find(w => w.id === id)!;
        // Add reasoning based on the scoring factors
        const reasons = [];
        
        if (userProfile.preferences.spiritTypes.has(whiskey.spirit_type)) {
          reasons.push(`matches your preference for ${whiskey.spirit_type}`);
        }
        
        if (userProfile.preferences.favoriteBrands.has(whiskey.brand)) {
          reasons.push(`from your favorite brand ${whiskey.brand}`);
        }
        
        if (whiskey.avg_msrp >= userProfile.preferences.priceRange.min && 
            whiskey.avg_msrp <= userProfile.preferences.priceRange.max) {
          reasons.push(`fits your price range`);
        }
        
        if (!isNaN(whiskey.proof) && 
            whiskey.proof >= userProfile.preferences.proofRange.min && 
            whiskey.proof <= userProfile.preferences.proofRange.max) {
          reasons.push(`matches your preferred proof range`);
        }
        
        return {
          ...whiskey,
          reasoning: reasons.length > 0 ? reasons.join(', ') : 'a well-balanced choice based on your collection'
        };
      });
  }

  private calculatePriceScore(price: number, range: { min: number; max: number; avg: number }): number {
    if (price <= range.max && price >= range.min) {
      return 1;
    }
    const deviation = Math.abs(price - range.avg) / range.avg;
    return Math.max(0, 1 - deviation);
  }

  private calculateProofScore(proof: number, range: { min: number; max: number; avg: number }): number {
    if (proof <= range.max && proof >= range.min) {
      return 1;
    }
    const deviation = Math.abs(proof - range.avg) / range.avg;
    return Math.max(0, 1 - deviation);
  }

  private calculateCollaborativeScore(whiskeyId: number, similarUsers: string[]): number {
    let totalRating = 0;
    let ratingCount = 0;

    similarUsers.forEach(userId => {
      const userProfile = this.userProfiles.get(userId);
      if (userProfile && userProfile.ratings.has(whiskeyId)) {
        totalRating += userProfile.ratings.get(whiskeyId)!;
        ratingCount++;
      }
    });

    return ratingCount > 0 ? totalRating / ratingCount : 0;
  }

  private calculateContentSimilarityScore(whiskey: WhiskeyProfile, userProfile: UserProfile): number {
    // Calculate similarity with each bottle in user's collection
    let totalSimilarity = 0;
    let count = 0;

    // Get all bottles from user's ratings
    userProfile.ratings.forEach((rating, whiskeyId) => {
      const userWhiskey = this.whiskeyProfiles.find(w => w.id === whiskeyId);
      if (userWhiskey) {
        totalSimilarity += this.calculateContentSimilarity(whiskey, userWhiskey);
        count++;
      }
    });

    return count > 0 ? totalSimilarity / count : 0;
  }
} 