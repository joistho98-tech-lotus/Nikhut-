import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { Transaction, ReconciliationReport, UnmatchedEntry } from "../types";

const apiKey = process.env.GEMINI_API_KEY || "";
if (!apiKey) {
  console.warn("GEMINI_API_KEY is not defined in the environment.");
}
const ai = new GoogleGenAI({ apiKey });

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function generateContentWithRetry(params: any, maxRetries = 3, retryDelay = 30000, onStatus?: (status: string) => void) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (error: any) {
      const isQuotaError = error?.status === 429 || 
                          error?.message?.includes('429') || 
                          error?.message?.includes('ResourceExhausted') ||
                          error?.message?.includes('Quota');
      
      if (isQuotaError && attempt < maxRetries - 1) {
        const msg = `⚠️ Quota Full. Nikhut is resting for ${retryDelay / 1000}s... (Attempt ${attempt + 1}/${maxRetries})`;
        console.warn(msg);
        if (onStatus) onStatus(msg);
        await delay(retryDelay);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

export async function processOCR(
  fileData: string, 
  mimeType: string, 
  onStatus?: (status: string) => void
): Promise<{ transactions: Transaction[], companyName?: string }> {
  const response = await generateContentWithRetry({
    model: "gemini-flash-latest",
    contents: [
      {
        parts: [
          {
            text: `Extract all financial transactions from this document. 
            Also, extract the name of the company or entity this document belongs to.
            Return a JSON object with these fields:
            - companyName (string, the name of the company/entity)
            - transactions (array of objects with these EXACT fields: 
              - date (string, format YYYY-MM-DD if possible, else as is)
              - particulars (string, description of transaction)
              - vchType (string, e.g., Purchase, Sale, Payment, Receipt, Journal)
              - vchNo (string, Transaction No. or Invoice No.)
              - debit (number, amount out/dr)
              - credit (number, amount in/cr)
            )
            
            Ensure debit and credit are numbers. Use 0 if a value is missing. 
            Include EVERY transaction found in the document.`,
          },
          {
            inlineData: {
              data: fileData.split(",")[1] || fileData,
              mimeType: mimeType,
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          companyName: { type: Type.STRING },
          transactions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                date: { type: Type.STRING },
                particulars: { type: Type.STRING },
                vchType: { type: Type.STRING },
                vchNo: { type: Type.STRING },
                debit: { type: Type.NUMBER },
                credit: { type: Type.NUMBER },
              },
              required: ["date", "particulars", "vchType", "vchNo", "debit", "credit"],
            },
          },
        },
        required: ["transactions"],
      },
    },
  });

  if (!response) return { transactions: [] };
  
  try {
    const text = response.text || "{}";
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse OCR response", e);
    return { transactions: [] };
  }
}

export async function reconcileData(
  internal: Transaction[],
  external: Transaction[],
  metadata: { name: string; type: string; subType: string[] }
): Promise<ReconciliationReport> {
  // Step 1: Calculate Closing Balances (First Check)
  const calculateBalance = (txs: Transaction[]) => {
    return txs.reduce((acc, tx) => acc + (tx.credit || 0) - (tx.debit || 0), 0);
  };

  const internalBalance = calculateBalance(internal);
  const externalBalance = calculateBalance(external);
  const difference = internalBalance - externalBalance;

  // Step 2: Hierarchy of Matching (Code-based for speed)
  const unmatchedEntries: UnmatchedEntry[] = [];
  const matchedInternalIds = new Set<number>();
  const matchedExternalIds = new Set<number>();

  // Helper to get amount
  const getAmt = (tx: Transaction) => (tx.debit || 0) + (tx.credit || 0);

  // Pass 1: Exact Match (Date, ID, Type, Amount)
  internal.forEach((itx, iIdx) => {
    const matchIdx = external.findIndex((etx, eIdx) => 
      !matchedExternalIds.has(eIdx) && 
      etx.vchNo === itx.vchNo && 
      etx.date === itx.date &&
      etx.vchType === itx.vchType &&
      getAmt(etx) === getAmt(itx)
    );
    if (matchIdx !== -1) {
      matchedInternalIds.add(iIdx);
      matchedExternalIds.add(matchIdx);
    }
  });

  // Pass 2: Match by Date and ID (vchNo) - Flag Amount Discrepancy
  internal.forEach((itx, iIdx) => {
    if (matchedInternalIds.has(iIdx) || !itx.vchNo) return;
    const matchIdx = external.findIndex((etx, eIdx) => 
      !matchedExternalIds.has(eIdx) && 
      etx.vchNo === itx.vchNo && 
      etx.date === itx.date
    );
    if (matchIdx !== -1) {
      if (getAmt(itx) !== getAmt(external[matchIdx])) {
        unmatchedEntries.push({
          internal: itx,
          external: external[matchIdx],
          reason: "Amount Mismatch"
        });
      }
      matchedInternalIds.add(iIdx);
      matchedExternalIds.add(matchIdx);
    }
  });

  // Pass 3: Match by Date, Type, and Amount
  internal.forEach((itx, iIdx) => {
    if (matchedInternalIds.has(iIdx)) return;
    const matchIdx = external.findIndex((etx, eIdx) => 
      !matchedExternalIds.has(eIdx) && 
      etx.date === itx.date && 
      etx.vchType === itx.vchType && 
      getAmt(etx) === getAmt(itx)
    );
    if (matchIdx !== -1) {
      matchedInternalIds.add(iIdx);
      matchedExternalIds.add(matchIdx);
    }
  });

  // Pass 4: Match by Date and Amount (Priority)
  internal.forEach((itx, iIdx) => {
    if (matchedInternalIds.has(iIdx)) return;
    const matchIdx = external.findIndex((etx, eIdx) => 
      !matchedExternalIds.has(eIdx) && 
      etx.date === itx.date && 
      getAmt(etx) === getAmt(itx)
    );
    if (matchIdx !== -1) {
      matchedInternalIds.add(iIdx);
      matchedExternalIds.add(matchIdx);
    }
  });

  // Collect remaining unmatched
  internal.forEach((itx, iIdx) => {
    if (!matchedInternalIds.has(iIdx)) {
      unmatchedEntries.push({
        internal: itx,
        reason: "Entry missing in External Data"
      });
    }
  });

  external.forEach((etx, eIdx) => {
    if (!matchedExternalIds.has(eIdx)) {
      unmatchedEntries.push({
        external: etx,
        reason: "Entry missing in Internal Data"
      });
    }
  });

  // AI Conclusion (Optional, but good for summary)
  let aiConclusion = "Reconciliation complete. ";
  if (difference === 0 && unmatchedEntries.length === 0) {
    aiConclusion += "All records match perfectly.";
  } else if (difference === 0) {
    aiConclusion += "Closing balances match, but there are internal discrepancies in entries.";
  } else {
    aiConclusion += `Discrepancy of ₹${Math.abs(difference).toLocaleString()} detected. Please review unmatched entries.`;
  }

  return {
    id: Math.random().toString(36).substr(2, 9),
    name: metadata.name,
    type: metadata.type,
    subType: metadata.subType,
    lastEdit: new Date().toLocaleString('en-US', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit', 
      hour12: true 
    }),
    internalBalance,
    externalBalance,
    difference,
    unmatchedEntries,
    aiConclusion
  };
}

export async function analyzeDiscrepancies(report: ReconciliationReport): Promise<string> {
  const response = await generateContentWithRetry({
    model: "gemini-flash-latest",
    contents: [
      {
        parts: [
          {
            text: `Analyze this reconciliation report and provide a professional summary of the discrepancies. 
            Focus on potential causes and recommended actions. Be specific about the unmatched entries.
            
            Report Summary:
            Internal Balance: ₹${report.internalBalance.toLocaleString()}
            External Balance: ₹${report.externalBalance.toLocaleString()}
            Difference: ₹${report.difference.toLocaleString()}
            
            Unmatched Entries: ${JSON.stringify(report.unmatchedEntries.slice(0, 20))} ${report.unmatchedEntries.length > 20 ? '(truncated)' : ''}
            `,
          }
        ]
      }
    ]
  });
  return response?.text || "No analysis available.";
}
