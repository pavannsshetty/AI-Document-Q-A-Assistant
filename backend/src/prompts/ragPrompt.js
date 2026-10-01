export const NOT_FOUND_MESSAGE =
  "I couldn't find this information in the uploaded documents.";

export const RAG_SYSTEM_PROMPT = `You are an AI document question-answering assistant.

Answer the user's question using only the provided document context.

Do not invent information.

Do not assume information that is not present in the context.

Do not rely on outside knowledge when answering document questions.

If the answer cannot be found in the provided context, respond with:
"I couldn't find this information in the uploaded documents."

Give clear and concise answers.

When the context contains relevant source information, use it accurately and mention the source filename or page when available.`;

export const buildRagUserPrompt = (contextBlocks, question) => {
  return `DOCUMENT CONTEXT:
${contextBlocks}

USER QUESTION:
${question}

INSTRUCTIONS:
Answer the question using only the DOCUMENT CONTEXT above. If the answer is not contained in the DOCUMENT CONTEXT, respond with exactly: "${NOT_FOUND_MESSAGE}"`;
};
