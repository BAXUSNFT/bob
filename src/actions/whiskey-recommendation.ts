import {
  ActionExample,
  Content,
  elizaLogger,
  generateText,
  HandlerCallback,
  IAgentRuntime,
  ModelClass,
  State,
  type Action,
  Memory
} from "@elizaos/core";
import * as fs from 'fs';
import * as path from 'path';
import { WhiskeyRecommender } from '../recommendation/whiskey-recommender.js';

// Interface for handlers
interface BarBottle {
  id: number;
  product: {
    id: number;
    name: string;
    brand: string;
    spirit: string;
    proof: number;
    average_msrp: number;
    // Other fields omitted for brevity
  };
  // Other fields omitted for brevity
}

class WhiskeyRecommendationHandler {
  private bottleDatabase: any[] = [];
  private recommender: WhiskeyRecommender | null = null;
  private isInitialized: boolean = false;

  // Set the bottle database
  setBottleDatabase(bottles: any[]) {
    console.log(`Setting bottle database with ${bottles.length} bottles`);
    this.bottleDatabase = bottles;
    this.recommender = new WhiskeyRecommender(bottles);
    this.isInitialized = true;
    console.log('Whiskey recommender initialized and ready');
  }

  // Process incoming messages and generate responses
  async processMessage(message: string, runtime: IAgentRuntime): Promise<string> {
    // Determine what type of whiskey request this is
    const requestContext = `
      Extract the request type from the user's message.
      The message is ${message}
      The possible request types are 'ANALYZE' (for analyzing a collection), 'RECOMMEND' (for recommending bottles), 
      'INFO' (for information about a specific bottle), or 'GENERAL' (for general whiskey talk).
      Only respond with the request type, do not include any other text.`;

    const requestType = await generateText({
      runtime: runtime,
      context: requestContext,
      modelClass: ModelClass.SMALL,
      stop: ["\n"],
    });

    console.log('requestType', requestType);

    // Get username if specified, otherwise use default
    const usernameContext = `
      Extract the username from the user's message if specified.
      The message is ${message}
      Look for patterns like 'my collection', 'user: [name]', '@[name]', etc.
      If no username is specified, respond with 'carriebaxus' as the default.
      Only respond with the username, do not include any other text.`;

    const username = await generateText({
      runtime: runtime,
      context: usernameContext,
      modelClass: ModelClass.SMALL,
      stop: ["\n"],
    });

    console.log('username', username);

    // For bottle info requests, extract the bottle name
    let bottleName = "";
    if (requestType === "INFO") {
      const bottleContext = `
          Extract the name of the bottle from the user's message.
          The message is ${message}
          If the message is asking about a specific bottle, extract the bottle name.
          Only respond with the bottle name, do not include any other text.`;

      bottleName = await generateText({
        runtime: runtime,
        context: bottleContext,
        modelClass: ModelClass.SMALL,
        stop: ["\n"],
      });

      console.log('bottleName', bottleName);
    }

    try {
      if (requestType === "ANALYZE") {
        return await this.handleAnalyzeCollection(username);
      } else if (requestType === "RECOMMEND") {
        return await this.handleRecommendBottles(username);
      } else if (requestType === "INFO" && bottleName) {
        return this.handleBottleInfo(bottleName);
      } else {
        return ""; // Let the language model handle it
      }
    } catch (error) {
      console.error("Error in whiskey recommendation handler:", error);
      return "*adjusts tie nervously* Seems I'm having trouble accessing that information right now. Let's chat about something else while I sort this out, gorgeous.";
    }
  }

  // Fetch user bottles from BoozApp
  async fetchUserBottles(username: string): Promise<BarBottle[]> {
    try {
      console.log(`Fetching bottles for user: ${username}`);
      const url = `https://services.baxus.co/api/bar/user/${username}`;

      const response = await fetch(url, {
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        }
      });

      if (!response.ok) {
        console.error(`API request failed with status: ${response.status}`);
        throw new Error(`Failed to fetch user data: ${response.status}`);
      }

      const data = await response.json();
      console.log(`Successfully fetched ${data.length} bottles for user: ${username}`);
      return data;
    } catch (error) {
      console.error(`Error fetching bottles for user ${username}:`, error);
      return []; // Return empty array on error
    }
  }
  // Analyze user collection
  analyzeUserCollection(bottles: BarBottle[]): any {
    const spiritPreferences = new Map<string, number>();
    const brandPreferences = new Map<string, number>();
    let minPrice = Number.MAX_VALUE;
    let maxPrice = 0;
    let totalPrice = 0;
    let minProof = Number.MAX_VALUE;
    let maxProof = 0;
    let totalProof = 0;
    let bottleCount = 0;

    // Process each bottle
    bottles.forEach(bottle => {
      const product = bottle.product;

      // Count spirit types
      spiritPreferences.set(product.spirit, (spiritPreferences.get(product.spirit) || 0) + 1);

      // Count brands
      brandPreferences.set(product.brand, (brandPreferences.get(product.brand) || 0) + 1);

      // Track price range
      if (product.average_msrp) {
        minPrice = Math.min(minPrice, product.average_msrp);
        maxPrice = Math.max(maxPrice, product.average_msrp);
        totalPrice += product.average_msrp;
        bottleCount++;
      }

      // Track proof range
      if (product.proof) {
        minProof = Math.min(minProof, product.proof);
        maxProof = Math.max(maxProof, product.proof);
        totalProof += product.proof;
      }
    });

    // Calculate averages
    const avgPrice = bottleCount > 0 ? totalPrice / bottleCount : 0;
    const avgProof = bottles.length > 0 ? totalProof / bottles.length : 0;

    // Adjust min values if no bottles were found
    if (minPrice === Number.MAX_VALUE) minPrice = 0;
    if (minProof === Number.MAX_VALUE) minProof = 0;

    return {
      spiritPreferences,
      brandPreferences,
      priceRange: { min: minPrice, max: maxPrice, avg: avgPrice },
      proofRange: { min: minProof, max: maxProof, avg: avgProof },
      bottleCount: bottles.length
    };
  }

  // Handle analysis requests
  async handleAnalyzeCollection(username: string): Promise<string> {
    const bottles = await this.fetchUserBottles(username);

    if (!bottles || bottles.length === 0) {
      return "*adjusts glasses* Well, it seems your virtual bar is as empty as my ex-wife left our liquor cabinet. Add some bottles to your collection in BoozApp, and I'll give you a proper reading of your taste profile.";
    }

    const profile = this.analyzeUserCollection(bottles);

    // Format the analysis in Bob's voice
    let summary = `*studies your collection thoughtfully, swirling whiskey in glass*\n\nWell now, let's take a look at what you've got here...\n\n`;

    summary += `Your collection has ${bottles.length} bottles.\n\n`;

    // Spirit breakdown
    summary += "**Spirit breakdown:**\n";
    Object.entries(profile.spiritPreferences)
      .sort((a: any, b: any) => b[1] - a[1])
      .forEach(([spirit, count]) => {
        const percentage = ((count as number) / bottles.length * 100).toFixed(1);
        summary += `- ${spirit}: ${count} bottles (${percentage}%)\n`;
      });

    // Top brands
    summary += "\n**Your top brands:**\n";
    Object.entries(profile.brandPreferences)
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([brand, count]) => {
        summary += `- ${brand}: ${count} bottles\n`;
      });

    // Price and proof ranges
    summary += `\n**Average price:** $${profile.priceRange.avg.toFixed(2)}`;
    summary += `\n**Average proof:** ${profile.proofRange.avg.toFixed(1)}`;

    summary += "\n\n*takes a sip* Based on what I'm seeing, you've got a certain style developing. Would you like me to recommend some bottles that would complement what you've already got? Or perhaps you're curious about a specific bottle?";

    return summary;
  }

  // Handle recommendation requests
  async handleRecommendBottles(username: string): Promise<string> {
    if (!this.isInitialized) {
      console.log('Recommender not initialized yet, waiting for bottle database...');
      return "*adjusts glasses* I'm still getting my whiskey knowledge organized. Give me just a moment to set up my recommendation engine...";
    }

    const bottles = await this.fetchUserBottles(username);

    if (!bottles || bottles.length === 0) {
      return "*adjusts glasses* I'd love to recommend something that complements your collection, gorgeous, but it seems you haven't added any bottles yet. Add some to your BoozApp collection, and I'll work my magic.";
    }

    console.log(`Making recommendations for user ${username} with ${bottles.length} bottles in their collection`);

    // Update user profile with their collection
    this.recommender!.updateUserProfile(username, bottles, new Map());

    // Get recommendations
    const recommendations = this.recommender!.getRecommendations(username, 3);

    if (recommendations.length === 0) {
      return "*adjusts glasses* I need a bit more information about your preferences to make good recommendations. Try adding a few more bottles to your collection.";
    }

    let response = `*studies your collection intently for a moment, then smiles with confidence*\n\n`;
    response += `Based on your collection and preferences, here are my top 3 recommendations:\n\n`;

    recommendations.forEach((rec, index) => {
      response += `${index + 1}. **${rec.name.replace(/^["']|["']$/g, '')}**`;
      
      // Only show price if it's a valid number
      if (!isNaN(rec.avg_msrp)) {
        response += ` - $${rec.avg_msrp}`;
      }
      
      response += `\n`;
      
      // Only show proof if it's a valid number
      if (!isNaN(rec.proof)) {
        response += `   Proof: ${rec.proof}\n`;
      }
      
      response += `   Type: ${rec.spirit_type}\n`;
      
      // Add reasoning based on the recommendation
      if (rec.reasoning) {
        response += `   Why: ${rec.reasoning}\n`;
      }
      
      response += `\n`;
    });

    response += `*takes a slow sip from flask* Any of these catch your eye, gorgeous? I'm happy to tell you more about any of them or suggest alternatives if these aren't quite what you're looking for.`;

    return response;
  }

  // Handle bottle info requests
  handleBottleInfo(bottleName: string): string {
    // Simple implementation with just a few bottles
    const lowerName = bottleName.toLowerCase();
    let description = "";

    if (lowerName.includes("buffalo trace")) {
      description = "Buffalo Trace is a solid, approachable bourbon with notes of vanilla, caramel, and a hint of oak spice. Made at the oldest continuously operating distillery in America, it's remarkably complex for its price point (usually around $30).";
    } else if (lowerName.includes("lagavulin")) {
      description = "Lagavulin 16 is the sophisticated beast of Islay. Smoke and seaweed wrapped in a velvet glove - it's like a campfire on a Scottish beach. Around $100 these days, but worth every penny for that symphony of smoke.";
    } else {
      description = `${bottleName} is a fine spirit with its own unique character and profile. Each bottle tells a story, and this one would make an interesting addition to any thoughtful collection.`;
    }

    return `*eyes light up* Ah! ${description}\n\n*adjusts tie* Anything else you'd like to know about? I've got stories and recommendations for days.`;
  }
}

// Create handler instance
const whiskeyRecommendationHandler = new WhiskeyRecommendationHandler();

// Function to load bottle dataset from CSV
async function loadBottleDataset() {
  try {
    const dataPath = path.resolve(process.cwd(), 'data/501_Bottle_Dataset_Sheet1.csv');

    if (!fs.existsSync(dataPath)) {
      console.error("Bottle dataset file not found:", dataPath);
      return [];
    }

    const fileContent = fs.readFileSync(dataPath, 'utf8');
    const lines = fileContent.split('\n');
    const headers = lines[0].split(',');

    const bottles = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;

      const values = lines[i].split(',');
      const bottle: any = {};

      headers.forEach((header, index) => {
        if (index >= values.length) return;

        const value = values[index];
        const cleanHeader = header.trim();

        if (['id', 'size', 'brand_id', 'total_score', 'wishlist_count',
          'vote_count', 'bar_count', 'ranking'].includes(cleanHeader)) {
          bottle[cleanHeader] = parseInt(value);
        }
        else if (['proof', 'abv', 'popularity', 'avg_msrp',
          'fair_price', 'shelf_price'].includes(cleanHeader)) {
          bottle[cleanHeader] = parseFloat(value);
        }
        else {
          bottle[cleanHeader] = value;
        }
      });

      bottles.push(bottle);
    }

    return bottles;
  } catch (error) {
    console.error("Error loading bottle dataset:", error);
    return [];
  }
}

// Initialize the handler with the dataset
(async () => {
  const bottles = await loadBottleDataset();
  if (bottles.length > 0) {
    console.log(`Loaded ${bottles.length} bottles for whiskey recommendations`);
    whiskeyRecommendationHandler.setBottleDatabase(bottles);
  }
})();

export const whiskeyRecommendationAction: Action = {
  name: "WHISKEY_RECOMMENDATION",
  similes: [
    "BOTTLE_RECOMMENDATION",
    "WHISKY_SUGGESTION",
    "SPIRIT_ANALYSIS"
  ],
  validate: async (_runtime: IAgentRuntime, _message: Memory) => {
    return true;
  },
  description:
    "Trigger this action whenever the user asks for whiskey recommendations, collection analysis, or information about specific bottles.",
  handler: async (
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
    _options: { [key: string]: unknown; },
    _callback: HandlerCallback,
  ): Promise<boolean> => {
    try {
      // Process the message through the handler
      const response = await whiskeyRecommendationHandler.processMessage(_message.content.text, _runtime);

      // If we got a meaningful response, send it
      if (response && response.trim() !== "") {
        // Save memory
        const newMemory: Memory = {
          userId: _message.agentId,
          agentId: _message.agentId,
          roomId: _message.roomId,
          content: {
            text: response,
            action: "WHISKEY_RECOMMENDATION_RESPONSE",
          } as Content
        };

        await _runtime.messageManager.createMemory(newMemory);

        _callback({ text: response });
        return true;
      }

      // No response means the handler couldn't process this message
      return false;
    } catch (error) {
      console.error('Error in whiskey recommendation action:', error);
      _callback({ text: "*adjusts tie nervously* Seems I'm having trouble accessing that information right now. Let's chat about something else while I sort this out, gorgeous." });
      return false;
    }
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: { text: "Can you analyze my whiskey collection?" },
      },
      {
        user: "{{user2}}",
        content: { text: "", action: "WHISKEY_RECOMMENDATION" },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "What whiskey would you recommend for me?" },
      },
      {
        user: "{{user2}}",
        content: { text: "", action: "WHISKEY_RECOMMENDATION" },
      },
    ],
    [
      {
        user: "{{user1}}",
        content: { text: "Tell me about Buffalo Trace" },
      },
      {
        user: "{{user2}}",
        content: { text: "", action: "WHISKEY_RECOMMENDATION" },
      },
    ],
  ] as ActionExample[][],
};