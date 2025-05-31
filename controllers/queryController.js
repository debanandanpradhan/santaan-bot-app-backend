const axios = require("axios");
const { pipeline } = require("@xenova/transformers");
const { Pinecone } = require("@pinecone-database/pinecone");
require("dotenv").config();

// Initialize Pinecone client
const client = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
let index;

async function getPineconeIndex() {
    if (!index) {
        index = client.index(process.env.PINECONE_INDEX);
    }
    return index;
}

// Load embedding model once
const { pipeline } = require('@xenova/transformers');

const embeddingCache = new Map();

let featureExtractor;

async function loadFeatureExtractor() {
  if (!featureExtractor) {
    featureExtractor = await pipeline('feature-extraction', 'sentence-transformers/all-MiniLM-L6-v2');
  }
  return featureExtractor;
}

async function getQueryEmbedding(text) {
  if (embeddingCache.has(text)) {
    return embeddingCache.get(text);
  }
  
  try {
    console.log(`🔍 Generating embedding for query: "${text}"`);

    const extractor = await loadFeatureExtractor();

    const output = await extractor(text, { pooling: 'mean', normalize: true });

    let embedding = output?.data || output;

    if (!embedding || !Array.isArray(embedding)) {
      throw new Error('Invalid embedding format');
    }

    const embeddingArray = Array.from(embedding);

    embeddingCache.set(text, embeddingArray);

    console.log('🧠 Embedding length:', embeddingArray.length);

    return embeddingArray;
  } catch (error) {
    console.error('❌ Error generating embeddings:', error.message);
    throw new Error('Embedding generation failed.');
  }
}

async function fetchOpenAlexResults(query) {
    try {
        const response = await axios.get("https://api.openalex.org/works", {
            params: {
                search: query,
                per_page: 2
            },
            headers: { Authorization: `Bearer ${process.env.OPENALEX_API_KEY}` }
        });

        const results = response.data.results;
        if (!results || results.length === 0) return "";

        return results.map(item => item.title).join(" ") || "";
    } catch (error) {
        console.error("❌ OpenAlex API Error:", error.message);
        return "";
    }
}

function refineText(text) {
    return text.replace(/(Textbook|Chapter|published by|includes chapters on|volume editors are).*/gi, "")
               .split(". ")
               .slice(0, 2)
               .join(". ")
               .trim();
}

exports.queryChatbot = async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) {
            return res.status(400).json({ error: "Query is required" });
        }

        // 🔹 Get vector search results from Pinecone
        const queryVector = await getQueryEmbedding(query);
        if (!queryVector || !Array.isArray(queryVector)) {
            throw new Error("Failed to generate valid query embedding.");
        }

        const index = await getPineconeIndex();
        const vectorResponse = await index.query({
            vector: queryVector,
            topK: 5,
            includeMetadata: true,
        });

        let relevantText = vectorResponse.matches.map(match => match.metadata?.text).join(" ") || "";
        console.log("📚 Raw book data:", relevantText);

        // 🔍 Clean and extract only the most relevant parts
        relevantText = refineText(relevantText);
        console.log("📖 Refined book data:", relevantText);

        // 🔹 Fetch data from OpenAlex API
        const openAlexResults = await fetchOpenAlexResults(query);
        console.log("🔬 Found OpenAlex data:", openAlexResults);

        // 🔹 Combine contexts
        const combinedContext = `Book Data: ${relevantText}. Scientific Insights: ${openAlexResults}.`;

        let botResponse;
        try {
            const groqResponse = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
                messages: [
                    { role: "user", content: query },
                    { role: "system", content: `Provide a concise, factual answer summarizing key points. Avoid listing study details. Context: ${combinedContext}` }
                ],
                model: "llama-3.3-70b-versatile",
                max_tokens: 1050
            }, {
                headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }
            });

            botResponse = groqResponse.data.choices[0]?.message?.content || "I'm not sure how to respond.";
        } catch (error) {
            console.error("❌ Groq API Error:", error.message);
            botResponse = "I couldn't process your request right now.";
        }

        console.log("🤖 Chatbot Response:", botResponse);
        res.json({ response: botResponse });

    } catch (error) {
        console.error("❌ Chatbot Error:", error.message);
        res.status(500).json({ error: "Internal Server Error", details: error.message });
    }
};
