// Updated whiskey-recommender.ts with content-based filtering only

import natural from 'natural';
interface WhiskeyProfile {
  popularity?: number;
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
  image_url?: string;
  wishlist_count?: number;
  vote_count?: number;
  bar_count?: number;
  community_stats?: string; 
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
    try {
      console.log(`Updating profile for user ${userId} with ${bottles.length} bottles`);

      const spiritTypes = new Map<string, number>();
      const favoriteBrands = new Map<string, number>();
      let minPrice = Number.MAX_VALUE;
      let maxPrice = 0;
      let totalPrice = 0;
      let minProof = Number.MAX_VALUE;
      let maxProof = 0;
      let totalProof = 0;
      let bottleCount = 0;

      // Safely process each bottle
      bottles.forEach(bottle => {
        if (!bottle.product) return;
        const product = bottle.product;

        // Update spirit type preferences (safely)
        if (product.spirit) {
          spiritTypes.set(product.spirit, (spiritTypes.get(product.spirit) || 0) + 1);
        }

        // Update brand preferences (safely)
        if (product.brand) {
          favoriteBrands.set(product.brand, (favoriteBrands.get(product.brand) || 0) + 1);
        }

        // Update price range (safely)
        if (product.average_msrp && !isNaN(product.average_msrp)) {
          minPrice = Math.min(minPrice, product.average_msrp);
          maxPrice = Math.max(maxPrice, product.average_msrp);
          totalPrice += product.average_msrp;
          bottleCount++;
        }

        // Update proof range (safely)
        if (product.proof && !isNaN(product.proof)) {
          minProof = Math.min(minProof, product.proof);
          maxProof = Math.max(maxProof, product.proof);
          totalProof += product.proof;
        }
      });

      // Handle edge cases
      if (minPrice === Number.MAX_VALUE) minPrice = 0;
      if (minProof === Number.MAX_VALUE) minProof = 0;

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

      console.log('User profile successfully updated');
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  }

  private calculateContentSimilarity(whiskey1: WhiskeyProfile, whiskey2: WhiskeyProfile): number {
    try {
      // Find the indices of the whiskeys in our database
      const index1 = this.whiskeyProfiles.findIndex(w => w.id === whiskey1.id);
      const index2 = this.whiskeyProfiles.findIndex(w => w.id === whiskey2.id);

      if (index1 === -1 || index2 === -1) {
        return 0; // Return 0 similarity if either whiskey is not found
      }

      // Get the document text for both whiskeys
      const doc1 = [
        whiskey1.name || '',
        whiskey1.brand || '',
        whiskey1.spirit_type || '',
        whiskey1.tasting_notes?.join(' ') || '',
        whiskey1.region || ''
      ].join(' ');

      const doc2 = [
        whiskey2.name || '',
        whiskey2.brand || '',
        whiskey2.spirit_type || '',
        whiskey2.tasting_notes?.join(' ') || '',
        whiskey2.region || ''
      ].join(' ');

      // Calculate similarity by comparing terms
      let similarity = 0;
      const terms = doc2.split(' ').filter(t => t.length > 0);

      if (terms.length === 0) return 0;

      terms.forEach(term => {
        similarity += this.tfidf.tfidf(term, index1);
      });

      return similarity / terms.length; // Normalize by number of terms
    } catch (error) {
      console.error('Error calculating content similarity:', error);
      return 0;
    }
  }

  public getRecommendations(userId: string, count: number = 3): WhiskeyProfile[] {
    try {
      console.log(`Getting recommendations for user ${userId}`);
      const userProfile = this.userProfiles.get(userId);
      if (!userProfile) {
        console.log('No user profile found');
        return [];
      }

      // Calculate scores for each whiskey using a content-based approach
      const scores = new Map<number, number>();

      this.whiskeyProfiles.forEach(whiskey => {
        if (!whiskey || !whiskey.id) return;

        try {
          let score = 0;

          // Spirit type preference score (0-1)
          const spiritScore = (userProfile.preferences.spiritTypes.get(whiskey.spirit_type) || 0) /
            (Math.max(...Array.from(userProfile.preferences.spiritTypes.values())) || 1);

          // Brand preference score (0-1)
          const brandScore = (userProfile.preferences.favoriteBrands.get(whiskey.brand) || 0) /
            (Math.max(...Array.from(userProfile.preferences.favoriteBrands.values())) || 1);

          // Price range scoring (0-1)
          const priceScore = this.calculatePriceScore(whiskey.avg_msrp, userProfile.preferences.priceRange);

          // Proof range scoring (0-1)
          const proofScore = this.calculateProofScore(whiskey.proof, userProfile.preferences.proofRange);

          const popularityScore = this.calculatePopularityScore(whiskey.popularity);

          // Community metric scoring (0-1)
          const wishlistScore = this.calculateCommunityMetricScore(whiskey.wishlist_count);
          const voteScore = this.calculateCommunityMetricScore(whiskey.vote_count);
          const barScore = this.calculateCommunityMetricScore(whiskey.bar_count);

          // Combine community scores
          const communityScore = (wishlistScore + voteScore + barScore) / 3;
          // Combine scores with weights
          score = (
            spiritScore * 0.20 +
            brandScore * 0.15 +
            priceScore * 0.15 +
            proofScore * 0.15 +
            popularityScore * 0.15 +
            communityScore * 0.20  // Add community score with 20% weight
          );

          scores.set(whiskey.id, score);
        } catch (error) {
          console.error(`Error scoring whiskey ${whiskey.id}:`, error);
        }
      });

      // Sort by score and return top recommendations
      return Array.from(scores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .map(([id]) => {
          const whiskey = this.whiskeyProfiles.find(w => w.id === id);
          if (!whiskey) return null;

          const formattedStats = this.formatCommunityStats(whiskey);
          // Add reasoning based on the scoring factors
          const reasons = [];

          if (userProfile.preferences.spiritTypes.has(whiskey.spirit_type)) {
            reasons.push(`matches your preference for ${whiskey.spirit_type}`);
          }

          if (userProfile.preferences.favoriteBrands.has(whiskey.brand)) {
            reasons.push(`from your favorite brand ${whiskey.brand}`);
          }

          if (!isNaN(whiskey.avg_msrp) &&
            whiskey.avg_msrp >= userProfile.preferences.priceRange.min &&
            whiskey.avg_msrp <= userProfile.preferences.priceRange.max) {
            reasons.push(`fits your price range`);
          }

          if (!isNaN(whiskey.proof) &&
            whiskey.proof >= userProfile.preferences.proofRange.min &&
            whiskey.proof <= userProfile.preferences.proofRange.max) {
            reasons.push(`matches your preferred proof range`);
          }
          if (!isNaN(whiskey.popularity) && whiskey.popularity > 10000) {
            reasons.push(`highly rated among whiskey enthusiasts`);
          }

          // Add community-based reasoning - don't push to the reasons array but show separately for now
          // if ((whiskey.wishlist_count || 0) > 1000) {
          //   reasons.push(`on many collectors' wishlists`);
          // } else if ((whiskey.vote_count || 0) > 1000) {
          //   reasons.push(`has received significant positive votes from the community`);
          // } else if ((whiskey.bar_count || 0) > 5000) {
          //   reasons.push(`found in many enthusiasts' collections`);
          // }

          return {
            ...whiskey,
            reasoning: reasons.length > 0 ? reasons.join(', ') : 'a well-balanced choice based on your collection'
          };
        })
        .filter(item => item !== null) as WhiskeyProfile[];
    } catch (error) {
      console.error('Error getting recommendations:', error);
      return [];
    }
  }

  private calculateCommunityMetricScore(value: number | undefined): number {
    if (isNaN(value as number) || value === null || value === undefined) return 0;

    // Normalize the metric using a log scale
    // This handles the wide range of values while giving higher scores to higher values
    return Math.min(1, Math.log10(Math.max(1, value)) / 4);
  }

  private calculatePopularityScore(popularity: number): number {
    if (isNaN(popularity) || popularity === null || popularity === undefined) return 0;
    const normalizedScore = Math.min(1, Math.log10(Math.max(1, popularity)) / 5);
    return normalizedScore;
  }

  private calculatePriceScore(price: number, range: { min: number; max: number; avg: number }): number {
    if (isNaN(price)) return 0;

    // If in range, give a high score
    if (price <= range.max && price >= range.min) {
      return 1;
    }

    // Otherwise, calculate how far it is from the average
    const deviation = Math.abs(price - range.avg) / (range.avg || 1);
    return Math.max(0, 1 - deviation);
  }

  private calculateProofScore(proof: number, range: { min: number; max: number; avg: number }): number {
    if (isNaN(proof)) return 0;

    // If in range, give a high score
    if (proof <= range.max && proof >= range.min) {
      return 1;
    }

    // Otherwise, calculate how far it is from the average
    const deviation = Math.abs(proof - range.avg) / (range.avg || 1);
    return Math.max(0, 1 - deviation);
  }

  private formatCommunityStats(whiskey: WhiskeyProfile): string {
    const stats = [];

    if (whiskey.wishlist_count !== undefined && whiskey.wishlist_count > 0) {
      stats.push(`${whiskey.wishlist_count.toLocaleString()} wishlist adds`);
    }

    if (whiskey.vote_count !== undefined && whiskey.vote_count > 0) {
      stats.push(`${whiskey.vote_count.toLocaleString()} community votes`);
    }

    if (whiskey.bar_count !== undefined && whiskey.bar_count > 0) {
      stats.push(`in ${whiskey.bar_count.toLocaleString()} collections`);
    }

    return stats.length > 0 ? `Community stats: ${stats.join(', ')}` : '';
  }

  public getSimilarBottles(bottleName: string, count: number = 3): WhiskeyProfile[] {
    try {
      if (!bottleName || !this.whiskeyProfiles || this.whiskeyProfiles.length === 0) {
        return [];
      }

      // Clean and normalize the search name
      const searchName = bottleName.toLowerCase().trim()
        .replace(/[.,]/g, '') // Remove periods and commas
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/^["']|["']$/g, ''); // Remove quotes

      // First try exact match
      let targetBottle = this.whiskeyProfiles.find(w => {
        if (!w || !w.name) return false;
        const bottleNameLower = w.name.toLowerCase()
          .replace(/[.,]/g, '')
          .replace(/\s+/g, ' ')
          .replace(/^["']|["']$/g, '');
        return bottleNameLower === searchName;
      });

      // If no exact match, try partial matches
      if (!targetBottle) {
        targetBottle = this.whiskeyProfiles.find(w => {
          if (!w || !w.name || !w.brand) return false;

          const bottleNameLower = w.name.toLowerCase()
            .replace(/[.,]/g, '')
            .replace(/\s+/g, ' ')
            .replace(/^["']|["']$/g, '');

          const brandNameLower = w.brand.toLowerCase()
            .replace(/[.,]/g, '')
            .replace(/\s+/g, ' ')
            .replace(/^["']|["']$/g, '');

          // Check for various match types
          return bottleNameLower.includes(searchName) ||
            searchName.includes(bottleNameLower) ||
            brandNameLower === searchName ||
            // Handle special cases like "Blanton's"
            bottleNameLower.startsWith(searchName) ||
            brandNameLower.startsWith(searchName);
        });
      }

      if (!targetBottle) {
        console.log(`No matching bottle found for: ${bottleName}`);
        return [];
      }

      console.log(`Found target bottle: ${targetBottle.name}`);

      // Calculate similarity scores for all bottles
      const scores = new Map<number, number>();

      this.whiskeyProfiles.forEach(whiskey => {
        if (!whiskey || whiskey.id === targetBottle!.id) return; // Skip the target bottle and invalid entries

        // Spirit type match score (exact match = 1, otherwise 0)
        const spiritMatch = (whiskey.spirit_type === targetBottle!.spirit_type) ? 1 : 0;

        // Calculate similarity based on proof - handle undefined values
        const proofSimilarity = !isNaN(targetBottle!.proof) && !isNaN(whiskey.proof)
          ? this.calculateProofSimilarity(targetBottle!.proof, whiskey.proof)
          : 0;

        // Calculate similarity based on price - handle undefined values
        const priceSimilarity = !isNaN(targetBottle!.avg_msrp) && !isNaN(whiskey.avg_msrp)
          ? this.calculatePriceSimilarity(targetBottle!.avg_msrp, whiskey.avg_msrp)
          : 0;

        // Brand match score (exact match = 1, otherwise 0)
        const brandMatch = (whiskey.brand === targetBottle!.brand) ? 1 : 0;

        // Combine scores with weights
        const score = (
          spiritMatch * 0.35 +
          proofSimilarity * 0.25 +
          priceSimilarity * 0.25 +
          brandMatch * 0.15
        );

        scores.set(whiskey.id, score);
      });

      // Sort by score and return top recommendations
      return Array.from(scores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, count)
        .map(([id]) => {
          const whiskey = this.whiskeyProfiles.find(w => w.id === id)!;

          // Build reasoning text
          const similarities = [];

          if (whiskey.spirit_type === targetBottle!.spirit_type) {
            similarities.push('spirit type');
          }

          if (Math.abs((whiskey.proof || 0) - (targetBottle!.proof || 0)) < 10) {
            similarities.push('proof range');
          }

          if (Math.abs((whiskey.avg_msrp || 0) - (targetBottle!.avg_msrp || 0)) < 20) {
            similarities.push('price point');
          }

          if (whiskey.brand === targetBottle!.brand) {
            similarities.push('brand');
          }

          // Add 'flavor profile' as a catch-all
          similarities.push('flavor profile');

          // Format the reasoning text
          let reasoning = `Similar to ${targetBottle!.name} in terms of `;
          if (similarities.length > 1) {
            const lastSimilarity = similarities.pop();
            reasoning += similarities.join(', ') + ' and ' + lastSimilarity;
          } else {
            reasoning += similarities[0];
          }

          return {
            ...whiskey,
            reasoning
          };
        });
    } catch (error) {
      console.error('Error finding similar bottles:', error);
      return [];
    }
  }

  private calculateProofSimilarity(proof1: number, proof2: number): number {
    if (isNaN(proof1) || isNaN(proof2)) return 0;
    const diff = Math.abs(proof1 - proof2);
    return Math.max(0, 1 - diff / 100); // Normalize by 100 proof
  }

  private calculatePriceSimilarity(price1: number, price2: number): number {
    if (isNaN(price1) || isNaN(price2)) return 0;
    const diff = Math.abs(price1 - price2);
    return Math.max(0, 1 - diff / 100); // Normalize by $100
  }
}