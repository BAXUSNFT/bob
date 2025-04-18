# Whiskey Recommendation System

A sophisticated whiskey recommendation engine that uses multiple algorithms to provide personalized bottle suggestions based on user preferences and collection analysis.

## Features

- **Collection Analysis**: Analyzes your whiskey collection to understand your taste preferences
- **Personalized Recommendations**: Suggests bottles based on multiple factors:
  - Spirit type preferences
  - Brand preferences
  - Price range
  - Proof range
  - Similarity to your existing bottles
  - What similar users enjoy

## Recommendation Algorithms

The system uses a hybrid approach combining multiple recommendation techniques:

1. **Content-Based Filtering (40%)**
   - Analyzes your collection's characteristics
   - Compares bottle descriptions using TF-IDF
   - Considers spirit types, brands, and flavor profiles
   - Weights: Spirit preferences (20%), Brand preferences (15%), Content similarity (15%)

2. **Collaborative Filtering (15%)**
   - Uses K-Nearest Neighbors (KNN) to find users with similar tastes
   - Considers ratings from similar users
   - Helps discover bottles you might not have considered

3. **Preference-Based Scoring (35%)**
   - Price range matching (20%)
   - Proof range matching (15%)
   - Ensures recommendations fit your budget and strength preferences

4. **TF-IDF Analysis**
   - Compares bottle descriptions, names, and characteristics
   - Uses natural language processing to find similar bottles
   - Helps identify bottles with similar flavor profiles

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Add your collection to BoozApp:
   - Create an account at [BoozApp](https://boozapp.com)
   - Add your whiskey bottles to your collection
   - Note your username

3. Get recommendations:
   - Ask for analysis: "Can you analyze my collection?"
   - Request recommendations: "What whiskey would you recommend?"
   - Get bottle info: "Tell me about [bottle name]"

## Example Usage

```typescript
// Initialize the recommender
const recommender = new WhiskeyRecommender(bottleDatabase);

// Update user profile with collection
recommender.updateUserProfile(username, bottles, ratings);

// Get personalized recommendations
const recommendations = recommender.getRecommendations(username, 3);
```

## Data Sources

- **Bottle Database**: Comprehensive dataset of 500+ whiskeys with detailed information
- **User Collections**: Real-time data from BoozApp API
- **Tasting Notes**: Curated flavor profiles and characteristics

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Edit the character files

Open `src/character.ts` to modify the default character. Uncomment and edit.

### Custom characters

To load custom characters instead:
- Use `pnpm start --characters="path/to/your/character.json"`
- Multiple character files can be loaded simultaneously

### Add clients
```
# in character.ts
clients: [Clients.TWITTER, Clients.DISCORD],

# in character.json
clients: ["twitter", "discord"]
```

## Duplicate the .env.example template

```bash
cp .env.example .env
```

\* Fill out the .env file with your own values.

### Add login credentials and keys to .env
```
DISCORD_APPLICATION_ID="discord-application-id"
DISCORD_API_TOKEN="discord-api-token"
...
OPENROUTER_API_KEY="sk-xx-xx-xxx"
...
TWITTER_USERNAME="username"
TWITTER_PASSWORD="password"
TWITTER_EMAIL="your@email.com"
```

## Install dependencies and start your agent

```bash
pnpm i && pnpm start
```
Note: this requires node to be at least version 22 when you install packages and run the agent.

## Run with Docker

### Build and run Docker Compose (For x86_64 architecture)

#### Edit the docker-compose.yaml file with your environment variables

```yaml
services:
    eliza:
        environment:
            - OPENROUTER_API_KEY=blahdeeblahblahblah
```

#### Run the image

```bash
docker compose up
```

### Build the image with Mac M-Series or aarch64

Make sure docker is running.

```bash
# The --load flag ensures the built image is available locally
docker buildx build --platform linux/amd64 -t eliza-starter:v1 --load .
```

#### Edit the docker-compose-image.yaml file with your environment variables

```yaml
services:
    eliza:
        environment:
            - OPENROUTER_API_KEY=blahdeeblahblahblah
```

#### Run the image

```bash
docker compose -f docker-compose-image.yaml up
```

# Deploy with Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/aW47_j)