const axios = require("axios");
const { Pinecone } = require("@pinecone-database/pinecone");
const { HfInference } = require("@huggingface/inference"); 
require("dotenv").config();

// Initialize Hugging Face API
const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

// Initialize Pinecone client
const client = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

let index;
async function getPineconeIndex() {
    if (!index) {
        index = client.index(process.env.PINECONE_INDEX);
    }
    return index;
}

// Cache embeddings to minimize API calls
const embeddingCache = new Map();

async function getQueryEmbedding(text) {
    if (embeddingCache.has(text)) {
        return embeddingCache.get(text);
    }

    try {
        console.log(`🔍 Generating embedding for query: "${text}"`);
        const response = await hf.featureExtraction({
            model: "intfloat/multilingual-e5-large",
            inputs: `query: ${text}`
        });

        if (!Array.isArray(response)) {
            throw new Error("Invalid embedding response format");
        }

        embeddingCache.set(text, response);
        return response;
    } catch (error) {
        console.error("❌ Error generating embeddings:", error.message);
        throw new Error("Embedding generation failed.");
    }
}

async function fetchOpenAlexResults(query) {
    try {
        const response = await axios.get("https://api.openalex.org/works", {
            params: {
                search: query,
                per_page: 2
            },
            headers: { Authorization: `Bearer ${process.env.OPENALEX_API_KEY}` } // Use API key
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
               .split(". ") // Break into sentences
               .slice(0, 2) // Take only first 2 relevant sentences
               .join(". ") // Rejoin into cleaned paragraph
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

        // 🔹 Ensure balance between book and OpenAlex data
        const combinedContext = `Book Data: ${relevantText}. Scientific Insights: ${openAlexResults}.`;

        let botResponse;
        try {
            const groqResponse = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
                messages: [
                    { role: "user", content: query },
                    { role: "system", content: `Provide a concise, factual answer summarizing key points. Avoid listing study details. Context: ${combinedContext}` }
                ],
                model: "llama-3.3-70b-versatile",
                max_tokens: 1050 // Limit response length
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
